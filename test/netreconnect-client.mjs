import assert from "node:assert/strict";
import { test } from "node:test";
import { ReconnectController } from "../src/net/reconnectController.js";
import { createOnlineResumeStore } from "../src/net/onlineResume.js";
import { connectWebSocket } from "../src/net/wsTransport.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check) {
  const deadline = Date.now() + 2000;
  while (!check()) { assert.ok(Date.now() < deadline, "condition timed out"); await wait(2); }
}
function endpoint() {
  let message, closed;
  return {
    sent: [], closed: false,
    send(msg) { this.sent.push(msg); },
    onMessage(fn) { message = fn; },
    onClose(fn) { closed = fn; },
    receive(msg) { message?.(msg); },
    close() { this.closed = true; closed?.(); },
  };
}
function setup(t, options = {}) {
  const eps = [], states = [], received = [];
  const controller = new ReconnectController({
    connect: async () => { const ep = endpoint(); eps.push(ep); return ep; },
    onEndpoint() {}, onMessage: (msg) => received.push(msg),
    onState: (state, reason) => states.push({ state, reason }),
    responseTimeout: 40, retryDelay: () => 5, stableMs: 500, maxAttempts: 3,
    ...options,
  });
  t.after(() => controller.stop());
  controller.start("wss://game.example/ws?room=match3", "a".repeat(32));
  return { controller, eps, states, received };
}

test("対局不在→close を繰り返し受けても再接続は一度で停止", async (t) => {
  const { controller, eps, states, received } = setup(t);
  await until(() => eps[0]?.sent.length);
  eps[0].receive({ type: "evt.rejoinFailed", reason: "対局が見つかりません" });
  eps[0].close();
  eps[0].receive({ type: "welcome", rejoined: true });
  await wait(60);
  assert.equal(eps.length, 1);
  assert.equal(controller.state, "failed");
  assert.equal(states.at(-1).reason, "missing");
  assert.equal(received.length, 0, "stale messages are ignored");
});

test("welcome だけでは復帰表示を消さず、盤面適用後に成功とする", async (t) => {
  const { controller, eps, received } = setup(t);
  await until(() => eps[0]?.sent.length);
  eps[0].receive({ type: "welcome", rejoined: true });
  assert.equal(controller.state, "reconnecting");
  eps[0].receive({ type: "evt.snapshot" });
  assert.equal(controller.state, "connected");
  assert.equal(received.at(-1).type, "evt.snapshot");
});

test("応答前の切断と無応答は上限付きで再試行する", async (t) => {
  const { controller, eps } = setup(t);
  await until(() => eps[0]?.sent.length);
  eps[0].close();
  await until(() => eps[1]?.sent.length);
  // 2、3回目はWSが開くが何も返さない。
  await until(() => controller.state === "failed");
  assert.equal(eps.length, 3);
  assert.ok(eps.every((ep) => ep.closed));
});

test("接続自体が失敗しても上限で停止し、手動再試行だけ新しく開始できる", async (t) => {
  let count = 0;
  const { controller } = setup(t, { connect: async () => { count++; throw new Error("offline"); } });
  await until(() => controller.state === "failed");
  assert.equal(count, 3);
  controller.start("wss://game.example/ws", "a".repeat(32));
  await until(() => controller.state === "failed");
  assert.equal(count, 6);
});

test("welcome と盤面が届いても直後の切断が続けば回数上限で止める", async (t) => {
  const { controller, eps } = setup(t);
  for (let i = 0; i < 3; i++) {
    await until(() => eps[i]?.sent.length);
    eps[i].receive({ type: "welcome", rejoined: true });
    eps[i].receive({ type: "evt.snapshot" });
    eps[i].close();
  }
  assert.equal(controller.state, "failed");
  await wait(60);
  assert.equal(eps.length, 3);
});

test("退出後に遅れて開いたWSは閉じ、対局や画面を復活させない", async (t) => {
  let finish;
  const { controller, received } = setup(t, { connect: () => new Promise((r) => { finish = r; }) });
  controller.stop();
  const ep = endpoint();
  finish(ep);
  await wait(5);
  assert.ok(ep.closed);
  assert.equal(ep.sent.length, 0);
  assert.equal(received.length, 0);
  assert.equal(controller.state, "idle");
});

test("F5相当の新インスタンスでも復帰情報を読める。退出・期限切れ・別ホストは破棄", () => {
  const values = new Map();
  const storage = () => ({ getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) });
  let now = 1000;
  const base = "wss://game.example/ws", url = base + "?room=match3", token = "b".repeat(32);
  const original = createOnlineResumeStore(storage, () => now);
  original.save(url, token);
  const reloaded = createOnlineResumeStore(storage, () => now);
  assert.deepEqual(reloaded.load(base), { url, token, savedAt: now });
  reloaded.clear();
  assert.equal(original.load(base), null);
  original.save(url, token);
  assert.equal(reloaded.load("wss://other.example/ws"), null);
  original.save(url, token);
  now += 7 * 60 * 60 * 1000;
  assert.equal(reloaded.load(base), null);
  const blocked = createOnlineResumeStore(() => { throw new Error("denied"); });
  assert.doesNotThrow(() => blocked.save(url, token));
  assert.equal(blocked.load(base), null);
});

test("WSのopen前切断と接続タイムアウトは未解決Promiseを残さない", async (t) => {
  const instances = [];
  class FakeWebSocket {
    constructor() { instances.push(this); }
    close() { this.onclose?.({ code: 1006 }); }
    send() {}
  }
  const original = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket;
  t.after(() => { globalThis.WebSocket = original; });
  const closing = connectWebSocket("ws://test/ws", { timeout: 30 });
  const rejected = assert.rejects(closing, /closed before opening/);
  instances[0].close();
  await rejected;
  await assert.rejects(connectWebSocket("ws://test/ws", { timeout: 10 }), /timed out/);
  const opening = connectWebSocket("ws://test/ws", { timeout: 30 });
  instances[2].onopen();
  instances[2].close();
  const ep = await opening;
  let notified = false;
  ep.onClose(() => { notified = true; });
  assert.ok(notified, "close before listener registration is replayed");
});
