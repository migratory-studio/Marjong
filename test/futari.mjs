// Headless smoke test for 二人麻雀 (futari). Autoplays many full 2-player games
// with all-CPU players and checks the futari-specific invariants. Run:
//   node test/futari.mjs
import { Game, Phase } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";
import { decideDiscard, decideCall, decideAbilityActivations } from "../src/ai/simpleAI.js";
import { Wall } from "../src/core/wall.js";
import { doraFromIndicator, makeKind } from "../src/core/tiles.js";

let failures = 0;
const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); failures++; } };

// ---- unit: futari wall composition (萬子+筒子2-8抜き=80枚) ----
{
  const w = new Wall(123, { tileset: "futari" });
  assert(w.tiles.length === 80, `futari wall has 80 tiles (got ${w.tiles.length})`);
  const man28 = w.tiles.filter((t) => t.kind >= 1 && t.kind <= 7);
  const pin28 = w.tiles.filter((t) => t.kind >= 10 && t.kind <= 16);
  assert(man28.length === 0, `no 2m-8m in futari wall (got ${man28.length})`);
  assert(pin28.length === 0, `no 2p-8p in futari wall (got ${pin28.length})`);
  const ends = [0, 8, 9, 17].map((k) => w.tiles.filter((t) => t.kind === k).length);
  assert(ends.every((n) => n === 4), `1m/9m/1p/9p present x4 (got ${ends.join(",")})`);
  const sou = w.tiles.filter((t) => t.kind >= 18 && t.kind <= 26).length;
  assert(sou === 36, `all 9 sou present x4 = 36 (got ${sou})`);
  // 赤5は5sのみ残る（5m/5pは抜けている）
  const reds = w.tiles.filter((t) => t.red);
  assert(reds.length === 1 && reds[0].kind === 22, `only 5s red remains (got ${reds.map((t)=>t.kind).join(",")})`);
}

// ---- unit: futari dora cycles 1<->9 for BOTH man and pin ----
{
  assert(doraFromIndicator(makeKind("m", 1), "futari") === makeKind("m", 9), "1m -> 9m dora (futari)");
  assert(doraFromIndicator(makeKind("m", 9), "futari") === makeKind("m", 1), "9m -> 1m dora (futari)");
  assert(doraFromIndicator(makeKind("p", 1), "futari") === makeKind("p", 9), "1p -> 9p dora (futari)");
  assert(doraFromIndicator(makeKind("p", 9), "futari") === makeKind("p", 1), "9p -> 1p dora (futari)");
  // sou keeps the normal +1 wrap
  assert(doraFromIndicator(makeKind("s", 1), "futari") === makeKind("s", 2), "1s -> 2s dora (futari)");
}

// ---- integration: autoplay 2-player games ----
function makeGame(seed, startIdx = 0) {
  const chosen = [];
  for (let i = 0; i < 2; i++) chosen.push(CHARACTERS[(startIdx + i) % CHARACTERS.length]);
  const seated = chosen.map((c) => ({ character: c, abilities: instantiateAbilities(c) }));
  return new Game(seated, /*human*/ -1, seed); // no human, 2 players => futari
}

function autoplay(game, maxSteps = 50000) {
  assert(game.numPlayers === 2 && game.futari, "game is in futari mode");
  game.startHand();
  let steps = 0, wins = 0, draws = 0;
  let sawNaki = false;
  while (!game.isGameOver() && steps++ < maxSteps) {
    if (game.phase === Phase.HAND_OVER) {
      if (game.lastResult?.draw) draws++; else wins++;
      game.startHand();
      continue;
    }
    if (game.phase === Phase.AWAIT_CALLS) {
      for (const c of game.pendingCalls.callers) {
        // 鳴き(ポン/チー/明槓)は一切提示されないこと。ロンのみ許可。
        if ((c.options.chi && c.options.chi.length > 0) || c.options.pon || c.options.kan) sawNaki = true;
      }
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
      if (!d) { assert(false, "no discard decision"); break; }
      if (d.type === "tsumo") game.doTsumo(idx);
      else if (d.type === "kan") {
        assert(d.kanType === "closed" || d.kanType === undefined, "futari kan must be closed (ankan)");
        game.declareKan(idx, d.kind, d.kanType);
      }
      else game.discard(idx, d.tileId, d.riichi);
      // no man/pin 2-8 should ever appear in a hand
      for (const p of game.players) {
        if (p.hand.some((t) => (t.kind >= 1 && t.kind <= 7) || (t.kind >= 10 && t.kind <= 16))) {
          assert(false, "man/pin 2-8 appeared in a futari hand");
        }
      }
      continue;
    }
    break;
  }
  assert(steps < maxSteps, "game terminated (no infinite loop)");
  assert(!sawNaki, "no pon/chi/open-kan was ever offered in futari");
  return { steps, wins, draws };
}

let totalWins = 0, totalDraws = 0;
const GAMES = 40;
for (let g = 0; g < GAMES; g++) {
  const game = makeGame(2000 + g, g % CHARACTERS.length);
  try {
    const r = autoplay(game);
    totalWins += r.wins; totalDraws += r.draws;
    assert(game.isGameOver(), `game ${g} reached game over`);
  } catch (e) {
    console.error(`FAIL: game ${g} threw:`, e.stack);
    failures++;
  }
}
console.log(`  autoplayed ${GAMES} futari games — wins=${totalWins} draws=${totalDraws}`);
assert(totalWins > 0, "at least one hand was won across all games");

// ---- unit: ツモは「勝者の立場で1人分」だけ取る ----
// 能力なしの2席で _applyTsumo を直接呼び、点の増減だけを検証（能力＝点移動は
// 設計上ゼロサムを崩すため、ルール検証は能力ヌキの単体で行う）。
{
  const mkSeat = (id) => ({ character: { id, name: id, color: "#ccc", stats: { startingPoints: 25000 } }, abilities: [] });
  // winner=席0。winnerIsDealer で親/子を割り当て、res.tsumoEach を直接渡す。
  const tsumoDeltas = (winnerIsDealer, tsumoEach) => {
    const game = new Game([mkSeat("A"), mkSeat("B")], -1, 1);
    game._lastDraw = { kind: 0 };
    game.kyotaku = 0;
    game.players[0].isDealer = winnerIsDealer;
    game.players[1].isDealer = !winnerIsDealer;
    const before = game.players.map((p) => p.points);
    game._applyTsumo(game.players[0], { tsumoEach });
    return game.players.map((p, i) => p.points - before[i]);
  };
  // 子の自摸（相手は親）: 親の2倍払い(4000)ではなく子の素点1人分(base×1=2000)だけ。
  const dKo = tsumoDeltas(false, { dealer: 4000, nonDealer: 2000 });
  assert(dKo[0] === 2000 && dKo[1] === -2000, `non-dealer tsumo takes base×1 only (got ${dKo})`);
  // 親の自摸: 親の立場で1人分=base×2(4000)。
  const dOya = tsumoDeltas(true, { nonDealer: 4000 });
  assert(dOya[0] === 4000 && dOya[1] === -4000, `dealer tsumo takes base×2 single share (got ${dOya})`);
}

if (failures === 0) console.log("\n✅ all futari smoke checks passed");
else { console.error(`\n❌ ${failures} failure(s)`); process.exit(1); }
