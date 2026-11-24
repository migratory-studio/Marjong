import assert from "node:assert/strict";
import { test } from "node:test";
import { Game, Phase } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";
import { AuthorityRoom } from "../src/net/authorityRoom.js";
import { applyEvent } from "../src/net/applyEvent.js";

const seated = () => CHARACTERS.slice(0, 4).map((character) => ({ character, abilities: instantiateAbilities(character) }));
function endpoint() {
  let message;
  const closed = [];
  return {
    sent: [],
    send(m) { this.sent.push(m); },
    onMessage(fn) { message = fn; },
    onClose(fn) { closed.push(fn); },
    receive(m) { message?.(m); },
    close() {}, // 実回線の遅延closeを再現
    finishClose() { closed.forEach((fn) => fn()); },
  };
}
function setup(t) {
  const old = endpoint(), fresh = endpoint();
  const game = new Game(seated(), 0, 1234, { dealerIndex: 0 });
  game.startHand();
  const room = new AuthorityRoom(game, { 0: old }, { timeout: 2000 });
  room.started = true;
  room.roster = game.players.map((p) => p.character.id);
  old.onClose(() => room.dropSeat(0, old));
  t.after(() => { room.dropSeat(0); room.recorder.dispose(); });
  return { room, game, old, fresh };
}

test("F5の新接続後に旧接続のclose/操作が届いても新接続と入力待ちを維持", async (t) => {
  const { room, game, old, fresh } = setup(t);
  const decision = room.decideTurn(0);
  const pending = room.pending.get(0);
  assert.ok(pending?.prompt);
  room.rejoin(0, fresh);
  old.finishClose();
  assert.equal(room.connections[0], fresh);
  assert.equal(room.pending.get(0), pending);
  const prompt = fresh.sent.find((m) => m.type === "evt.awaitDiscard");
  assert.deepEqual(prompt, pending.prompt, "選択肢を新接続に再送");
  old.receive({ type: "intent.discard", tileId: game.players[0].drawnTileId });
  assert.equal(room.pending.get(0), pending, "古い接続の操作は受け付けない");
  const replica = new Game(seated(), 0);
  const snapshot = fresh.sent.find((m) => m.type === "evt.snapshot");
  applyEvent(replica, snapshot, { viewpoint: 0 });
  assert.equal(replica.players[0].drawnTileId, game.players[0].drawnTileId);
  for (let i = 1; i < 4; i++) {
    assert.equal(snapshot.hands[i], null);
    assert.equal(snapshot.drawnTileIds[i], null);
    assert.ok(replica.players[i].hand.every((p) => p.id == null));
  }
  fresh.receive({ type: "intent.discard", tileId: replica.players[0].drawnTileId });
  assert.equal((await decision).tileId, game.players[0].drawnTileId);
});

test("鳴き待ちの更新でも選択肢を再送し、新接続から回答できる", async (t) => {
  const { room, old, fresh } = setup(t);
  const choosing = room.decideCalls([{ index: 0, options: { pon: true } }]);
  room.rejoin(0, fresh);
  old.finishClose();
  assert.equal(fresh.sent.find((m) => m.type === "evt.awaitCalls").options.pon, true);
  fresh.receive({ type: "intent.call", action: "pon" });
  assert.deepEqual((await choosing).decisions, [{ index: 0, action: "pon" }]);
});

test("局結果待ちの更新でも結果と確認済み状態を復元し、次局へ進める", async (t) => {
  const { room, game, fresh } = setup(t);
  game.phase = Phase.HAND_OVER;
  game.lastResult = { draw: true, deltas: [0, 0, 0, 0] };
  const waiting = room._waitAcks();
  room.rejoin(0, fresh);
  const snapshot = fresh.sent.find((m) => m.type === "evt.snapshot");
  const replica = new Game(seated(), 0);
  applyEvent(replica, snapshot, { viewpoint: 0 });
  assert.equal(snapshot.acked, false);
  assert.equal(replica.phase, Phase.HAND_OVER);
  assert.deepEqual(replica.lastResult, game.lastResult);
  fresh.receive({ type: "intent.ack" });
  await waiting;
  const again = endpoint();
  room.rejoin(0, again);
  assert.equal(again.sent.find((m) => m.type === "evt.snapshot").acked, true);
});
