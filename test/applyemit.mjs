// 通信対戦 L4c-2 ③-1 の土台テスト。Run: node test/applyemit.mjs
//
// (1) applyEvent の emit モード：レプリカに replay すると、エンジンと同じ bus イベントが発火し、
//     クライアントのレンダラ/SE/相棒ボード等がそのまま動かせる。結果(lastResult)も復元される。
// (2) 権威の awaitDiscard が、人間UIの描画材料(options/abilityStatus/danger)を同梱して配信する。
import { Game, Phase, Events } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";
import { decideDiscard, decideCall, decideAbilityActivations } from "../src/ai/simpleAI.js";
import { attachRecorder } from "../src/net/eventLog.js";
import { applyEvent } from "../src/net/applyEvent.js";
import { createLoopback } from "../src/net/transport.js";
import { AuthorityRoom } from "../src/net/authorityRoom.js";
import { ClientSession } from "../src/net/clientSession.js";

let failures = 0;
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); failures++; } };
const seatOf = (startIdx) => {
  const s = [];
  for (let i = 0; i < 4; i++) { const c = CHARACTERS[(startIdx + i) % CHARACTERS.length]; s.push({ character: c, abilities: instantiateAbilities(c) }); }
  return s;
};
function autoplay(game) {
  game.startHand();
  let steps = 0;
  while (!game.isGameOver() && steps++ < 50000) {
    if (game.phase === Phase.HAND_OVER) { game.startHand(); continue; }
    if (game.phase === Phase.AWAIT_CALLS) { game.resolveCalls(game.pendingCalls.callers.map((c) => ({ index: c.index, ...decideCall(game, c.index, c.options) }))); continue; }
    if (game.phase === Phase.AWAIT_DISCARD) { const i = game.turn; for (const a of decideAbilityActivations(game, i)) game.activateAbility(i, a.id, a.params); const d = decideDiscard(game, i); if (!d) break; if (d.type === "tsumo") game.doTsumo(i); else if (d.type === "kan") game.declareKan(i, d.kind, d.kanType); else if (d.type === "nuki") game.nukiKita(i); else game.discard(i, d.tileId, d.riichi); continue; }
    break;
  }
}

// ---- (1) emit reducer ----
for (const seed of [101, 202, 303]) {
  const auth = new Game(seatOf(seed % CHARACTERS.length), -1, seed);
  const { records } = attachRecorder(auth);
  autoplay(auth);

  const replica = new Game(seatOf(seed % CHARACTERS.length), -1, undefined);
  const counts = {}; let stateChanges = 0; let lastWon = null;
  for (const t of [Events.HAND_STARTED, Events.TILE_DRAWN, Events.TILE_DISCARDED, Events.RIICHI_DECLARED, Events.MELD_CALLED, Events.ABILITY_USED, Events.HAND_WON, Events.HAND_DRAWN]) {
    counts[t] = 0; replica.bus.on(t, () => { counts[t]++; });
  }
  replica.bus.on(Events.STATE_CHANGED, () => { stateChanges++; });
  replica.bus.on(Events.HAND_WON, (r) => { lastWon = r; });
  let meldType = null;
  replica.bus.on(Events.MELD_CALLED, ({ type }) => { meldType = type; });

  const recCount = (type) => records.filter((r) => r.type === type).length;
  for (const rec of records) applyEvent(replica, rec, { viewpoint: 0, emit: true });

  assert(counts[Events.TILE_DRAWN] === recCount("tileDrawn"), `seed ${seed}: TILE_DRAWN emits == records`);
  assert(counts[Events.TILE_DISCARDED] === recCount("tileDiscarded"), `seed ${seed}: TILE_DISCARDED emits == records`);
  assert(counts[Events.MELD_CALLED] === recCount("meldCalled"), `seed ${seed}: MELD_CALLED emits == records`);
  assert(counts[Events.HAND_STARTED] === recCount("handStarted"), `seed ${seed}: HAND_STARTED emits == records`);
  assert(counts[Events.HAND_WON] === recCount("handWon"), `seed ${seed}: HAND_WON emits == records`);
  assert(stateChanges >= records.length, `seed ${seed}: STATE_CHANGED fired per event (${stateChanges} >= ${records.length})`);
  if (recCount("meldCalled") > 0) assert(["pon", "chi", "kan"].includes(meldType), `seed ${seed}: meld banner type valid (${meldType})`);
  if (recCount("handWon") > 0) {
    assert(lastWon && (lastWon.winner != null), `seed ${seed}: HAND_WON payload carries winner`);
    assert(replica.lastResult && (replica.lastResult.winner != null || replica.lastResult.draw), `seed ${seed}: replica.lastResult set (full result for 結果画面)`);
    // 完全シリアライズの確認：勝者の公開手など結果画面の素材が乗っている。
    assert(replica.lastResult.deltas && replica.lastResult.deltas.length === 4, `seed ${seed}: lastResult.deltas present`);
  }
}

// ---- (2) 権威の awaitDiscard が UI options を同梱する ----
await (async () => {
  const { a: authEp, b: cliEp } = createLoopback();
  const auth = new Game(seatOf(0), -1, 4242);
  const room = new AuthorityRoom(auth, { 0: authEp }, { timeout: 5000 });
  // 受信を覗き見るスパイ（ClientSession はトリビアルに intent を返して進める）。
  let awaitMsg = null;
  const realOnMsg = cliEp.onMessage.bind(cliEp);
  const spy = (fn) => realOnMsg((m) => { if (m.type === "evt.awaitDiscard" && !awaitMsg) awaitMsg = m; fn(m); });
  const client = new ClientSession({ send: cliEp.send.bind(cliEp), onMessage: spy }, { seat: 0, seated: seatOf(0) });
  room.run();
  const t0 = Date.now();
  while (!awaitMsg && Date.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 30));
  assert(!!awaitMsg, "awaitDiscard delivered to seat 0");
  if (awaitMsg) {
    assert("options" in awaitMsg, "awaitDiscard carries options (actionOptions)");
    assert(Array.isArray(awaitMsg.abilityStatus), "awaitDiscard carries abilityStatus[]");
    assert("danger" in awaitMsg, "awaitDiscard carries danger field");
  }
})();

if (failures === 0) console.log("\n✅ applyemit (emit reducer + result reconstruction + UI option payloads) checks passed");
else { console.error(`\n❌ ${failures} failure(s)`); process.exit(1); }
process.exit(0);
