// 全キャラ・拡張バランス計測。balance.mjs を拡張し、HAND_WON を購読して
// 「アガリ回数」と「アガリハンの合計」も集計する。
// 集計: 出場数 / 勝率(=1着率) / 得点平均(最終点) / トビ率 / 平均順位 / 平均アガリハン。
// 実行: node test/balance-full.mjs [gamesPerChar]  (既定 80)
import { writeFileSync } from "node:fs";
import { Game, Phase } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";
import { decideDiscard, decideCall, decideAbilityActivations } from "../src/ai/simpleAI.js";
import { Events } from "../src/core/events.js";

const PER_CHAR = Number(process.argv[2]) || 80;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0xC0FFEE);
const randInt = (n) => Math.floor(rng() * n);
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function balancedSchedule(perChar) {
  const n = CHARACTERS.length;
  const remain = CHARACTERS.map(() => perChar);
  const games = [];
  let total = perChar * n;
  while (total >= 4) {
    const idxs = shuffle(CHARACTERS.map((_, i) => i));
    idxs.sort((a, b) => remain[b] - remain[a]);
    const pick = idxs.slice(0, 4);
    for (const i of pick) remain[i]--;
    total -= 4;
    games.push(shuffle(pick));
  }
  return games;
}

function autoplay(game, maxSteps = 20000) {
  game.startHand();
  let steps = 0;
  while (!game.isGameOver() && steps++ < maxSteps) {
    if (game.phase === Phase.HAND_OVER) { game.startHand(); continue; }
    if (game.phase === Phase.AWAIT_CALLS) {
      const decisions = game.pendingCalls.callers.map((c) => ({
        index: c.index, ...decideCall(game, c.index, c.options),
      }));
      game.resolveCalls(decisions);
      continue;
    }
    if (game.phase === Phase.AWAIT_DISCARD) {
      const idx = game.turn;
      for (const a of decideAbilityActivations(game, idx)) game.activateAbility(idx, a.id, a.params);
      const d = decideDiscard(game, idx);
      if (!d) break;
      if (d.type === "tsumo") game.doTsumo(idx);
      else if (d.type === "kan") game.declareKan(idx, d.kind, d.kanType);
      else game.discard(idx, d.tileId, d.riichi);
      continue;
    }
    break;
  }
  return steps < maxSteps;
}

const stat = {};
for (const c of CHARACTERS) {
  stat[c.id] = {
    id: c.id, name: c.name, start: c.stats.startingPoints,
    games: 0, firsts: 0, placeSum: 0, pointSum: 0, busts: 0,
    wins: 0, hanSum: 0,
    dealIns: 0, oyaTsumoPaid: 0, drawTenpai: 0, drawNoten: 0,
  };
}

const schedule = balancedSchedule(PER_CHAR);
let completed = 0;
for (let g = 0; g < schedule.length; g++) {
  const chosen = schedule[g];
  const seated = chosen.map((ci) => ({
    character: CHARACTERS[ci], abilities: instantiateAbilities(CHARACTERS[ci]),
  }));
  const seed = 1_000_000 + g;
  const game = new Game(seated, -1, seed);

  // アガリを購読: 和了者の回数/翻、放銃者、親被り(親ツモを払った子)を加算。
  game.bus.on(Events.HAND_WON, (r) => {
    const wp = game.players[r.winner];
    if (wp) {
      const s = stat[wp.character.id];
      s.wins++;
      s.hanSum += (r.result && r.result.totalHan) || 0;
    }
    // 放銃: ロンの放銃者(loser)
    if (r.loser != null) stat[game.players[r.loser].character.id].dealIns++;
    // 親被り: 親のツモ和了を、子が支払ったケース
    if (r.tsumo && wp && wp.isDealer) {
      game.players.forEach((p, i) => {
        if (i !== r.winner && (r.deltas[i] || 0) < 0) stat[p.character.id].oyaTsumoPaid++;
      });
    }
  });
  // 流局を購読: 各キャラのテンパイ/ノーテンを加算。
  game.bus.on(Events.HAND_DRAWN, (r) => {
    if (!r || !r.tenpai) return;
    game.players.forEach((p, i) => {
      if (r.tenpai[i]) stat[p.character.id].drawTenpai++;
      else stat[p.character.id].drawNoten++;
    });
  });

  let ok = false;
  try { ok = autoplay(game); } catch (e) { ok = false; }
  if (!ok) continue;
  completed++;

  const order = [...game.players].sort((a, b) => b.points - a.points);
  order.forEach((p, rank) => {
    const s = stat[p.character.id];
    s.games++;
    s.pointSum += p.points;
    s.placeSum += rank + 1;
    if (rank === 0) s.firsts++;
    if (p.points < 0) s.busts++;
  });
}

const rows = Object.values(stat).filter((s) => s.games > 0);
rows.sort((a, b) => (b.firsts / b.games) - (a.firsts / a.games));

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const lines = [];
lines.push(`全キャラ・拡張バランス結果  (各キャラ${PER_CHAR}戦目標 / 完了 ${completed}/${schedule.length} ゲーム, 東風戦・全CPU)`);
lines.push("");
lines.push(`${pad("順", 3)} ${pad("キャラ", 14)} ${padL("出場", 5)} ${padL("勝率", 7)} ${padL("得点平均", 9)} ${padL("トビ率", 7)} ${padL("平均順位", 8)} ${padL("平均ハン", 9)} ${padL("アガリ", 6)} ${padL("放銃", 6)} ${padL("親被り", 7)} ${padL("流局聴牌", 8)} ${padL("流局ノテン", 9)}`);
lines.push("-".repeat(120));
rows.forEach((s, i) => {
  const winRate = (100 * s.firsts / s.games).toFixed(1) + "%";
  const avgPlace = (s.placeSum / s.games).toFixed(2);
  const avgPts = Math.round(s.pointSum / s.games);
  const bustRate = (100 * s.busts / s.games).toFixed(1) + "%";
  const avgHan = s.wins > 0 ? (s.hanSum / s.wins).toFixed(2) : "-";
  lines.push(`${pad(i + 1, 3)} ${pad(s.name, 14)} ${padL(s.games, 5)} ${padL(winRate, 7)} ${padL(avgPts, 9)} ${padL(bustRate, 7)} ${padL(avgPlace, 8)} ${padL(avgHan, 9)} ${padL(s.wins, 6)} ${padL(s.dealIns, 6)} ${padL(s.oyaTsumoPaid, 7)} ${padL(s.drawTenpai, 8)} ${padL(s.drawNoten, 9)}`);
});
lines.push("");
lines.push("勝率=4人中1着の割合 / 得点平均=最終点の平均 / トビ率=最終点マイナスの割合 / 平均順位 1.00最良〜4.00最悪");
lines.push("平均ハン=和了1回あたりの合計翻(ドラ込, 役満13翻換算) / アガリ・放銃・親被り・流局聴牌・流局ノテンは全戦の合計回数");
lines.push("放銃=ロンで振り込んだ回数 / 親被り=親のツモ和了を子として支払った回数");

const out = lines.join("\n");
writeFileSync(new URL("./balance-full-result.txt", import.meta.url), out + "\n");
console.log(out);
