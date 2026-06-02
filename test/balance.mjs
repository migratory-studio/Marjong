// キャラ別バランス計測: 多数の対局を自動プレイし、キャラごとの成績を集計する。
// 各ゲームは8キャラから4人を選抜・席順もシャッフルし、東風戦を最後まで打つ。
// 出場数は全キャラぴったり同数になるよう均等割当する（greedy: 残り出場数の多い順に4人）。
// 集計: 出場数 / 1着率(=勝率) / 平均順位 / 平均最終点 / トビ率。
// 実行: node test/balance.mjs [gamesPerChar]   (結果は test/balance-result.txt に出力)
import { writeFileSync } from "node:fs";
import { Game, Phase } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";
import { decideDiscard, decideCall, decideAbilityActivations } from "../src/ai/simpleAI.js";

const PER_CHAR = Number(process.argv[2]) || 50;

// 簡易シード付き乱数（再現性のため）
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

// 各キャラがぴったり perChar 回出場する対戦表を作る。
// 毎ゲーム「残り出場枠の多い順に4人」を選ぶ greedy。タイは乱数で崩す（順序をシャッフルしてから
// 安定ソート）。総枠 = perChar*8 は4の倍数なので最後まで4人ずつ取り切れる。
function balancedSchedule(perChar) {
  const n = CHARACTERS.length;
  const remain = CHARACTERS.map(() => perChar);
  const games = [];
  let total = perChar * n;
  while (total >= 4) {
    const idxs = shuffle(CHARACTERS.map((_, i) => i)); // タイの並びを乱す
    idxs.sort((a, b) => remain[b] - remain[a]);        // 残り枠の多い順（安定ソート）
    const pick = idxs.slice(0, 4);
    for (const i of pick) remain[i]--;
    total -= 4;
    games.push(shuffle(pick)); // 席順もランダム化
  }
  return games;
}

function autoplay(game, maxSteps = 200000) {
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

// 集計器
const stat = {};
for (const c of CHARACTERS) {
  stat[c.id] = {
    id: c.id, name: c.name, start: c.stats.startingPoints,
    games: 0, firsts: 0, placeSum: 0, pointSum: 0, busts: 0,
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
  const game = new Game(seated, -1, seed); // 東風戦, 人間なし
  let ok = false;
  try { ok = autoplay(game); } catch (e) { ok = false; }
  if (!ok) continue;
  completed++;

  // 最終順位: 点数降順。同点はタイブレークせず席順安定でOK（稀）。
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

// 出力: 1着率(勝率)の高い順
const rows = Object.values(stat).filter((s) => s.games > 0);
rows.sort((a, b) => (b.firsts / b.games) - (a.firsts / a.games));

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const lines = [];
lines.push(`シミュレーション結果  (各キャラ${PER_CHAR}戦目標 / 完了 ${completed}/${schedule.length} ゲーム, 東風戦・全CPU)`);
lines.push("");
lines.push(`${pad("順", 3)} ${pad("キャラ", 14)} ${padL("初期点", 7)} ${padL("出場", 5)} ${padL("勝率", 7)} ${padL("平均順位", 8)} ${padL("平均最終点", 10)} ${padL("トビ率", 7)}`);
lines.push("-".repeat(76));
rows.forEach((s, i) => {
  const winRate = (100 * s.firsts / s.games).toFixed(1) + "%";
  const avgPlace = (s.placeSum / s.games).toFixed(2);
  const avgPts = Math.round(s.pointSum / s.games);
  const bustRate = (100 * s.busts / s.games).toFixed(1) + "%";
  lines.push(`${pad(i + 1, 3)} ${pad(s.name, 14)} ${padL(s.start, 7)} ${padL(s.games, 5)} ${padL(winRate, 7)} ${padL(avgPlace, 8)} ${padL(avgPts, 10)} ${padL(bustRate, 7)}`);
});
lines.push("");
lines.push("勝率 = 4人中1着で終えた割合 / 平均順位 1.00が最良〜4.00が最悪 / トビ率 = 最終点がマイナスで終えた割合");

const out = lines.join("\n");
writeFileSync(new URL("./balance-result.txt", import.meta.url), out + "\n");
console.log(out);
