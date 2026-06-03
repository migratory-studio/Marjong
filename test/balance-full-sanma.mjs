// 三人麻雀版・全キャラ拡張バランス計測。balance-full.mjs の sanma 版。
// 各ゲームは14キャラから3人を選抜・席順シャッフルし、東風戦(sanma)を最後まで打つ。
// 集計: 出場数 / 勝率(=1着率, 3人中) / 得点平均 / トビ率 / 平均順位(1.00〜3.00) / 平均アガリハン。
// 実行: node test/balance-full-sanma.mjs [gamesPerChar]   (既定 80)
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
const rng = mulberry32(0x5A11A);
const randInt = (n) => Math.floor(rng() * n);
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// 各キャラがほぼ均等に出場する 3人テーブルを作る greedy（残り枠の多い順に3人）。
function balancedSchedule(perChar) {
  const n = CHARACTERS.length;
  const remain = CHARACTERS.map(() => perChar);
  const games = [];
  let total = perChar * n;
  while (total >= 3) {
    const idxs = shuffle(CHARACTERS.map((_, i) => i));
    idxs.sort((a, b) => remain[b] - remain[a]);
    const pick = idxs.slice(0, 3);
    for (const i of pick) remain[i]--;
    total -= 3;
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
      else if (d.type === "nuki") game.nukiKita(idx);
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
  };
}

const schedule = balancedSchedule(PER_CHAR);
let completed = 0, skipped = 0;
for (let g = 0; g < schedule.length; g++) {
  const chosen = schedule[g];
  const seated = chosen.map((ci) => ({
    character: CHARACTERS[ci], abilities: instantiateAbilities(CHARACTERS[ci]),
  }));
  const seed = 3_000_000 + g;
  const game = new Game(seated, -1, seed); // 3人 → sanma 自動判定

  game.bus.on(Events.HAND_WON, (r) => {
    const wp = game.players[r.winner];
    if (!wp) return;
    const s = stat[wp.character.id];
    s.wins++;
    s.hanSum += (r.result && r.result.totalHan) || 0;
  });

  let ok = false;
  try { ok = autoplay(game); } catch (e) { ok = false; }
  if (!ok) { skipped++; continue; }
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
lines.push(`三人麻雀・全キャラ拡張バランス結果  (各キャラ${PER_CHAR}戦目標 / 完了 ${completed} / スキップ ${skipped} / 全${schedule.length}ゲーム, 東風戦・全CPU)`);
lines.push("");
lines.push(`${pad("順", 3)} ${pad("キャラ", 14)} ${padL("出場", 5)} ${padL("勝率", 7)} ${padL("得点平均", 9)} ${padL("トビ率", 7)} ${padL("平均順位", 8)} ${padL("平均アガリハン", 13)} ${padL("アガリ数", 7)}`);
lines.push("-".repeat(90));
rows.forEach((s, i) => {
  const winRate = (100 * s.firsts / s.games).toFixed(1) + "%";
  const avgPlace = (s.placeSum / s.games).toFixed(2);
  const avgPts = Math.round(s.pointSum / s.games);
  const bustRate = (100 * s.busts / s.games).toFixed(1) + "%";
  const avgHan = s.wins > 0 ? (s.hanSum / s.wins).toFixed(2) : "-";
  lines.push(`${pad(i + 1, 3)} ${pad(s.name, 14)} ${padL(s.games, 5)} ${padL(winRate, 7)} ${padL(avgPts, 9)} ${padL(bustRate, 7)} ${padL(avgPlace, 8)} ${padL(avgHan, 13)} ${padL(s.wins, 7)}`);
});
lines.push("");
lines.push("勝率=3人中1着の割合 / 得点平均=最終点の平均 / トビ率=最終点マイナスの割合 / 平均順位 1.00最良〜3.00最悪 / 平均アガリハン=和了1回あたりの合計翻(ドラ込, 役満は13翻換算)");

const out = lines.join("\n");
writeFileSync(new URL("./balance-full-sanma-result.txt", import.meta.url), out + "\n");
console.log(out);
