import assert from "node:assert/strict";
import { test } from "node:test";
import { createConnectionDiagnostics, connectionDiagnostics } from "../src/net/connectionDiagnostics.js";
import { connectWebSocket } from "../src/net/wsTransport.js";
import { createConnectionLog, wrapServerWs } from "../worker/connectionLog.js";
import { buildEnvReport } from "../src/config/appInfo.js";
import { AuthorityRoom } from "../src/net/authorityRoom.js";
import { Game } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";

const connectionId = "11111111-1111-4111-8111-111111111111";
const instanceId = "22222222-2222-4222-8222-222222222222";
const matchId = "33333333-3333-4333-8333-333333333333";
const token = "a".repeat(32);
const rows = (d) => d.report().split("\n").filter(Boolean).map((line) => JSON.parse(line.slice(line.indexOf(" ") + 1)));
function storage() {
  const values = new Map();
  return { values, getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) };
}

test("F5後も診断を読めるがtoken・名前・手牌・URLは残さない", () => {
  const saved = storage();
  const create = () => createConnectionDiagnostics({ storage: () => saved, now: () => 1000 });
  const before = create();
  before.record("match_welcome", { matchId, token, name: "乃木回遊", hands: [[{ id: 1 }]], url: "wss://game/ws?room=SECRET" });
  const after = create();
  assert.equal(rows(after)[0].matchId, matchId);
  for (const hidden of [token, "乃木回遊", "hands", "SECRET", "url"]) assert.ok(!after.report().includes(hidden));
  saved.setItem("mahjong-online-diagnostics-v1", JSON.stringify([{ at: 1000, event: "ws_close", code: 1006, token }]));
  assert.ok(!create().report().includes(token));
});

test("保存は120件・24時間まで。保存不可でも診断を使える", () => {
  let now = 1000;
  const saved = storage();
  const d = createConnectionDiagnostics({ storage: () => saved, now: () => now });
  for (let i = 0; i < 150; i++) d.record("reconnect_attempt", { attempt: i });
  assert.equal(rows(d).length, 120);
  assert.equal(rows(d)[0].attempt, 30);
  now += 24 * 60 * 60 * 1000 + 1;
  assert.equal(d.report(), "");
  const blocked = createConnectionDiagnostics({ storage: () => { throw new Error("denied"); } });
  assert.doesNotThrow(() => blocked.record("ws_close", { code: 1006 }));
  assert.equal(rows(blocked)[0].code, 1006);
});

test("トランスポートが接続ID・対局ID・異常切断・最終受信位置を記録", async (t) => {
  const saved = storage(), d = createConnectionDiagnostics({ storage: () => saved });
  let socket;
  class FakeWebSocket {
    constructor() { socket = this; this.readyState = 0; }
    send() {}
    close() { this.onclose?.({ code: 1000, reason: "", wasClean: true }); }
  }
  const original = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket;
  t.after(() => { globalThis.WebSocket = original; });
  const connecting = connectWebSocket("wss://game.example/ws?room=SECRET", { diagnostics: d });
  socket.readyState = 1; socket.onopen();
  const ep = await connecting;
  const received = [];
  ep.onMessage((msg) => received.push(msg));
  const deliver = (msg) => socket.onmessage({ data: JSON.stringify(msg) });
  deliver({ type: "evt.connection", connectionId, instanceId, build: "0.9.0-test.6" });
  deliver({ type: "welcome", matchId, token, name: "乃木回遊", hands: [1, 2, 3] });
  deliver({ type: "tileDiscarded", seq: 42, pub: { phase: "await-calls", turn: 1 }, tileId: 71 });
  socket.onclose({ code: 1006, reason: "SECRET", wasClean: false });
  const closed = rows(d).find((e) => e.event === "ws_close");
  assert.equal(closed.connectionId, connectionId);
  assert.equal(closed.instanceId, instanceId);
  assert.equal(closed.matchId, matchId);
  assert.equal(closed.lastSeq, 42);
  assert.equal(closed.phase, "await-calls");
  assert.equal(closed.code, 1006);
  assert.equal(closed.localClose, false);
  assert.equal(closed.reason, "other");
  assert.equal(received[1].token, token, "本来の対局メッセージは変更しない");
  for (const hidden of [token, "乃木回遊", "hands", "SECRET", "tileId"]) assert.ok(!d.report().includes(hidden));
});

test("診断処理が壊れてもWebSocketを開いて閉じられる", async (t) => {
  let socket;
  class FakeWebSocket {
    constructor() { socket = this; }
    close() { this.onclose?.({ code: 1000 }); }
  }
  const original = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket;
  t.after(() => { globalThis.WebSocket = original; });
  const connecting = connectWebSocket("wss://game.example/ws", { diagnostics: { record() { throw new Error("broken"); } } });
  socket.onopen();
  const ep = await connecting;
  assert.doesNotThrow(() => ep.close());
});

test("サーバーの接続・拒否・例外を同じIDで記録しpayloadをログへ流さない", () => {
  const entries = [], listeners = new Map(), sent = [];
  const logger = createConnectionLog({ instanceId, build: "0.9.0-test.6" }, {
    info: (e) => entries.push(e), error: (e) => entries.push(e),
  });
  const socket = {
    addEventListener(type, fn) { const list = listeners.get(type) || []; list.push(fn); listeners.set(type, list); },
    send: (msg) => sent.push(JSON.parse(msg)),
    close(code, reason) { for (const fn of listeners.get("close") || []) fn({ code, reason, wasClean: true }); },
  };
  const ep = wrapServerWs(socket, { connectionId, log: logger });
  ep.send({ type: "welcome", matchId, token, seat: 0, players: [{ name: "乃木回遊" }] });
  ep.send({ type: "evt.rejoinFailed", reason: "対局が見つかりません" });
  ep.onMessage(() => { throw new TypeError("SECRET " + token); });
  for (const fn of listeners.get("message")) fn({ data: JSON.stringify({ type: "intent.rejoin", token }) });
  ep.close(1000, "rejoin_missing");
  assert.ok(entries.some((e) => e.event === "ws_handler_error" && e.errorName === "TypeError"));
  assert.ok(entries.some((e) => e.event === "ws_closed" && e.reason === "rejoin_missing"));
  assert.ok(entries.every((e) => e.connectionId === connectionId && e.instanceId === instanceId));
  assert.equal(entries.find((e) => e.event === "seat_joined").matchId, matchId);
  for (const hidden of [token, "乃木回遊", "SECRET", "players"]) assert.ok(!JSON.stringify(entries).includes(hidden));
  assert.equal(sent[0].token, token);
});

test("対局の開始・終了・例外に同じ対局IDと局面を付ける", async () => {
  const entries = [];
  const seated = CHARACTERS.slice(0, 4).map((character) => ({ character, abilities: instantiateAbilities(character) }));
  const game = new Game(seated, -1, 1234, { maxHands: 1 });
  const room = new AuthorityRoom(game, {}, { diagnostic: (event, fields) => entries.push({ event, ...fields }) });
  await room.run();
  room.reportFailure(new TypeError("SECRET"));
  assert.ok(entries.some((e) => e.event === "match_started"));
  assert.ok(entries.some((e) => e.event === "match_finished"));
  assert.ok(entries.every((e) => e.matchId === room.matchId));
  assert.equal(entries.at(-1).errorName, "TypeError");
  assert.ok(!JSON.stringify(entries).includes("SECRET"));
});

test("既存の環境情報コピーに診断が含まれる", () => {
  connectionDiagnostics.record("ws_close", { connectionId, code: 1006 });
  const report = buildEnvReport();
  assert.ok(report.includes("connection diagnostics (UTC):"));
  assert.ok(report.includes(connectionId));
  assert.ok(report.includes('"code":1006'));
});
