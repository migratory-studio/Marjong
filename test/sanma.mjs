// Headless smoke test for 三人麻雀 (sanma). Autoplays many full 3-player games
// with all-CPU players and checks the sanma-specific invariants. Run:
//   node test/sanma.mjs
import { Game, Phase } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";
import { decideDiscard, decideCall, decideAbilityActivations } from "../src/ai/simpleAI.js";
import { Wall } from "../src/core/wall.js";
import { doraFromIndicator, makeKind } from "../src/core/tiles.js";

let failures = 0;
const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); failures++; } };

// ---- unit: sanma wall composition ----
{
  const w = new Wall(123, { sanma: true });
  assert(w.tiles.length === 108, `sanma wall has 108 tiles (got ${w.tiles.length})`);
  const man28 = w.tiles.filter((t) => t.kind >= 1 && t.kind <= 7);
  assert(man28.length === 0, `no 2m-8m in sanma wall (got ${man28.length})`);
  const oneM = w.tiles.filter((t) => t.kind === 0).length;
  const nineM = w.tiles.filter((t) => t.kind === 8).length;
  assert(oneM === 4 && nineM === 4, `1m and 9m present x4 (1m=${oneM} 9m=${nineM})`);
}

// ---- unit: sanma manzu dora cycles 1m<->9m ----
{
  assert(doraFromIndicator(makeKind("m", 1), true) === makeKind("m", 9), "1m indicator -> 9m dora (sanma)");
  assert(doraFromIndicator(makeKind("m", 9), true) === makeKind("m", 1), "9m indicator -> 1m dora (sanma)");
  // 4p keeps the normal +1 wrap
  assert(doraFromIndicator(makeKind("m", 1), false) === makeKind("m", 2), "1m indicator -> 2m dora (4p)");
}

// ---- integration: autoplay 3-player games ----
function makeGame(seed, startIdx = 0) {
  const chosen = [];
  for (let i = 0; i < 3; i++) chosen.push(CHARACTERS[(startIdx + i) % CHARACTERS.length]);
  const seated = chosen.map((c) => ({ character: c, abilities: instantiateAbilities(c) }));
  return new Game(seated, /*human*/ -1, seed); // no human, 3 players => sanma
}

function autoplay(game, maxSteps = 50000) {
  assert(game.numPlayers === 3 && game.sanma, "game is in sanma mode");
  game.startHand();
  let steps = 0, wins = 0, draws = 0, nukis = 0;
  let sawNoChi = true;
  while (!game.isGameOver() && steps++ < maxSteps) {
    if (game.phase === Phase.HAND_OVER) {
      if (game.lastResult?.draw) draws++; else wins++;
      game.startHand();
      continue;
    }
    if (game.phase === Phase.AWAIT_CALLS) {
      for (const c of game.pendingCalls.callers) {
        if (c.options.chi && c.options.chi.length > 0) sawNoChi = false;
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
      else if (d.type === "kan") game.declareKan(idx, d.kind, d.kanType);
      else if (d.type === "nuki") { game.nukiKita(idx); nukis++; }
      else game.discard(idx, d.tileId, d.riichi);
      // no man 2-8 should ever appear in a hand
      for (const p of game.players) {
        if (p.hand.some((t) => t.kind >= 1 && t.kind <= 7)) {
          assert(false, "man 2-8 appeared in a sanma hand");
        }
      }
      continue;
    }
    break;
  }
  assert(steps < maxSteps, "game terminated (no infinite loop)");
  assert(sawNoChi, "no chi was ever offered in sanma");
  return { steps, wins, draws, nukis };
}

let totalWins = 0, totalDraws = 0, totalNukis = 0;
const GAMES = 40;
for (let g = 0; g < GAMES; g++) {
  const game = makeGame(2000 + g, g % CHARACTERS.length);
  try {
    const r = autoplay(game);
    totalWins += r.wins; totalDraws += r.draws; totalNukis += r.nukis;
    assert(game.isGameOver(), `game ${g} reached game over`);
  } catch (e) {
    console.error(`FAIL: game ${g} threw:`, e.stack);
    failures++;
  }
}
console.log(`  autoplayed ${GAMES} sanma games — wins=${totalWins} draws=${totalDraws} nukis=${totalNukis}`);
assert(totalNukis > 0, "北抜き occurred at least once across all games");

if (failures === 0) console.log("\n✅ all sanma smoke checks passed");
else { console.error(`\n❌ ${failures} failure(s)`); process.exit(1); }
