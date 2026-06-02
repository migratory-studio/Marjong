// Headless smoke test: autoplay many full games with all-CPU players and a few
// unit checks on win detection / scoring. Run: node test/smoke.mjs
import { Game, Phase } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";
import { decideDiscard, decideCall, decideAbilityActivations } from "../src/ai/simpleAI.js";
import { scoreHand } from "../src/core/rules/score.js";
import { isAgari, decomposeStandard, isChiitoitsu } from "../src/core/rules/winCheck.js";
import { emptyCounts, makeKind, makeHonor } from "../src/core/tiles.js";

let failures = 0;
const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); failures++; } };

// ---- unit: win detection ----
function counts(...kinds) {
  const c = emptyCounts();
  for (const k of kinds) c[k]++;
  return c;
}
// 123m 456m 789m 234s 11p  (m=0..8, s=18..26, p=9..17)
const M = (r) => makeKind("m", r), P = (r) => makeKind("p", r), S = (r) => makeKind("s", r);
{
  const c = counts(M(1),M(2),M(3), M(4),M(5),M(6), M(7),M(8),M(9), S(2),S(3),S(4), P(1),P(1));
  assert(isAgari(c, 0), "standard hand should be agari");
  assert(decomposeStandard(c, 0).length > 0, "standard decomposition found");
}
// seven pairs
{
  const c = counts(M(1),M(1), M(3),M(3), P(2),P(2), P(5),P(5), S(7),S(7), S(9),S(9), makeHonor(5),makeHonor(5));
  assert(isChiitoitsu(c, 0), "seven pairs detected");
  assert(isAgari(c, 0), "seven pairs is agari");
}
// scoring a tsumo (menzen tsumo at least => valid)
{
  const c = counts(M(2),M(3),M(4), M(6),M(7),M(8), P(2),P(3),P(4), S(5),S(6),S(7), P(9),P(9));
  const res = scoreHand(c, [], {
    winningTile: M(2), tsumo: true, ron: false, seatWind: 27, roundWind: 27,
    isDealer: false, honba: 0, riichi: false, doubleRiichi: false, ippatsu: false,
    haitei: false, houtei: false, rinshan: false, chankan: false,
    doraKinds: [], uraKinds: [], redCount: 0,
  });
  assert(res.valid, "menzen tsumo hand scores valid");
  assert(res.total > 0, "tsumo total > 0");
  console.log("  sample tsumo:", res.rank || "", res.totalHan + "飜", res.fu + "符", res.total + "点",
    res.yaku.map((y) => y.name).join("/"));
}

// ---- integration: autoplay ----
// Seat 4 characters starting at `startIdx` (wrapping) so all abilities — incl.
// the new game-scoped draw-bias ones — get exercised across the game loop.
function makeGame(seed, startIdx = 0) {
  const chosen = [];
  for (let i = 0; i < 4; i++) chosen.push(CHARACTERS[(startIdx + i) % CHARACTERS.length]);
  const seated = chosen.map((c) => ({
    character: c, abilities: instantiateAbilities(c),
  }));
  return new Game(seated, /*human*/ -1, seed); // no human
}

function autoplay(game, maxSteps = 50000) {
  game.startHand();
  let steps = 0;
  let wins = 0, draws = 0;
  while (!game.isGameOver() && steps++ < maxSteps) {
    if (game.phase === Phase.HAND_OVER) {
      if (game.lastResult?.draw) draws++; else wins++;
      game.startHand();
      continue;
    }
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
      if (!d) { assert(false, "no discard decision"); break; }
      if (d.type === "tsumo") game.doTsumo(idx);
      else if (d.type === "kan") game.declareKan(idx, d.kind, d.kanType);
      else game.discard(idx, d.tileId, d.riichi);
      continue;
    }
    break;
  }
  assert(steps < maxSteps, "game terminated (no infinite loop)");
  return { steps, wins, draws, finalPhase: game.phase };
}

let totalWins = 0, totalDraws = 0;
const GAMES = 40;
for (let g = 0; g < GAMES; g++) {
  const game = makeGame(1000 + g, g % CHARACTERS.length);
  try {
    const r = autoplay(game);
    totalWins += r.wins; totalDraws += r.draws;
    assert(game.isGameOver(), `game ${g} reached game over (phase=${game.finalPhase})`);
  } catch (e) {
    console.error(`FAIL: game ${g} threw:`, e.stack);
    failures++;
  }
}
console.log(`  autoplayed ${GAMES} games — wins=${totalWins} draws=${totalDraws}`);

if (failures === 0) console.log("\n✅ all smoke checks passed");
else { console.error(`\n❌ ${failures} failure(s)`); process.exit(1); }
