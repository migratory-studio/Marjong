// 通信対戦 ルーム待合室テスト。Run: node test/netlobby.mjs
//
// RoomHost の「ホスト主導待合室」(lobby=true)を検証する：
//  (1) 単独入室：席0=ホスト、残り3枠は open、開始前は卓未確定。
//  (2) 2人目入室：両者へ随時反映（human2+open2）。yourSeat は各自視点、hostSeat は最初の人。
//  (3) ホストの CPU 化／解除：空き枠を cpu にでき、open に戻せる。
//  (4) 権限：非ホストの lobbySlot / lobbyStart は無視される。
//  (5) ホストの開始：残り open を CPU 補填して welcome→対局が完走。
//  (6) ホスト離脱：hostSeat が次の人間へ繰り上がる。
//  (7) 満席：5人目は evt.lobbyFull で弾かれる。
import { createSocketServer, connectSocket } from "../src/net/socketTransport.js";
import { RoomHost } from "../src/net/onlineServer.js";
import { ClientSession } from "../src/net/clientSession.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";

let failures = 0;
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); failures++; } };
const makeSeated = (ids) => ids.map((id) => { const c = CHARACTERS.find((x) => x.id === id) || CHARACTERS[0]; return { character: c, abilities: instantiateAbilities(c) }; });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(pred, ms, label) { const t0 = Date.now(); while (!pred()) { if (Date.now() - t0 > ms) throw new Error(`timeout: ${label}`); await wait(20); } }

async function makeHost(opts = {}) {
  const host = new RoomHost();
  const server = await createSocketServer(0);
  server.onConnection((conn) => host.handle(conn, { timeout: 4000, pacing: { cpuDelay: 10, nakiWait: 5 }, ...opts }));
  return { host, server };
}
// lobby=true でルーム待合室へ入る。
async function joinLobby(server, charId, name) {
  const ep = await connectSocket("127.0.0.1", server.port);
  const c = new ClientSession(ep, { makeSeated });
  ep.send({ type: "intent.join", charId, name, lobby: true });
  return { ep, c };
}
const lastLobby = (c) => [...c.received].reverse().find((m) => m.type === "evt.lobby");
const welcomeOf = (c) => c.received.find((m) => m.type === "welcome");
const humans = (L) => L.members.filter((m) => m.kind === "human").length;
async function teardown(server, eps) { for (const ep of eps) ep.close(); await wait(30); await server.close(); }

(async () => {
  // --- (1) 単独入室＝ホスト ---
  {
    const { host, server } = await makeHost();
    const a = await joinLobby(server, "shiyue", "Aさん");
    await until(() => lastLobby(a.c), 2000, "host に evt.lobby");
    const L = lastLobby(a.c);
    assert(L.yourSeat === 0 && L.hostSeat === 0, "単独入室は席0=ホスト");
    assert(L.members.length === 4 && L.capacity === 4, "4枠");
    assert(L.members[0].kind === "human" && L.members[0].name === "Aさん", "席0=自分(human・名前)");
    assert(L.members.slice(1).every((m) => m.kind === "open"), "席1-3は空き");
    assert(host.room == null, "開始前は卓未確定");
    await teardown(server, [a.ep]);
  }

  // --- (2) 2人目入室で随時反映 ---
  {
    const { server } = await makeHost();
    const a = await joinLobby(server, "shiyue", "A");
    const b = await joinLobby(server, "kuidoshi", "B");
    await until(() => { const L = lastLobby(b.c); return L && humans(L) === 2; }, 2000, "Bに2人反映");
    const La = lastLobby(a.c), Lb = lastLobby(b.c);
    assert(humans(La) === 2, "Aの画面にも2人");
    assert(La.yourSeat === 0 && Lb.yourSeat === 1, "yourSeat は各自視点");
    assert(La.hostSeat === 0 && Lb.hostSeat === 0, "ホストは最初の人(席0)");
    assert(La.members[1].kind === "human" && La.members[1].name === "B", "席1=B");
    await teardown(server, [a.ep, b.ep]);
  }

  // --- (3) ホストの CPU 化／解除 ---
  {
    const { server } = await makeHost();
    const a = await joinLobby(server, "shiyue", "A");
    await until(() => lastLobby(a.c), 2000, "lobby 到着");
    a.ep.send({ type: "intent.lobbySlot", slot: 2, state: "cpu" });
    await until(() => lastLobby(a.c)?.members[2].kind === "cpu", 2000, "席2を CPU 化");
    a.ep.send({ type: "intent.lobbySlot", slot: 2, state: "open" });
    await until(() => lastLobby(a.c)?.members[2].kind === "open", 2000, "席2を空ける");
    await teardown(server, [a.ep]);
  }

  // --- (4) 権限：非ホストは操作できない ---
  {
    const { host, server } = await makeHost();
    const a = await joinLobby(server, "shiyue", "A");  // ホスト
    const b = await joinLobby(server, "kuidoshi", "B"); // 非ホスト(席1)
    await until(() => { const L = lastLobby(b.c); return L && L.yourSeat === 1; }, 2000, "Bが席1");
    b.ep.send({ type: "intent.lobbySlot", slot: 2, state: "cpu" }); // 無視されるべき
    await wait(100);
    assert(host.slots[2].type === "open", "非ホストの CPU 化は無視");
    b.ep.send({ type: "intent.lobbyStart" }); // 無視されるべき
    await wait(100);
    assert(host.room == null, "非ホストの開始は無視");
    await teardown(server, [a.ep, b.ep]);
  }

  // --- (5) ホストの開始 → CPU 補填で完走 ---
  {
    const { host, server } = await makeHost();
    const a = await joinLobby(server, "shiyue", "A");   // ホスト
    const b = await joinLobby(server, "kuidoshi", "B");
    await until(() => { const L = lastLobby(b.c); return L && humans(L) === 2; }, 2000, "2人");
    a.ep.send({ type: "intent.lobbyStart" });
    await until(() => host.room != null, 2000, "ホスト開始で卓確定");
    await until(() => welcomeOf(a.c) && welcomeOf(b.c), 2000, "両者 welcome");
    const wa = welcomeOf(a.c), wb = welcomeOf(b.c);
    assert(wa.seat === 0 && wb.seat === 1, "席0/1");
    assert(wa.roster && wa.roster.length === 4, "CPU 補填で4人");
    assert(wa.token && wb.token, "再接続トークン発行");
    assert(host.room.isRemote(0) && host.room.isRemote(1), "席0/1は遠隔(人間)");
    assert(!host.room.isRemote(2) && !host.room.isRemote(3), "席2/3は CPU");
    await until(() => host.room.game.isGameOver(), 30000, "待合室卓が完走");
    assert(a.c.intentCount > 0 && b.c.intentCount > 0, "両者とも打牌した");
    await teardown(server, [a.ep, b.ep]);
  }

  // --- (6) ホスト離脱で繰り上がり ---
  {
    const { server } = await makeHost();
    const a = await joinLobby(server, "shiyue", "A");   // ホスト(席0)
    const b = await joinLobby(server, "kuidoshi", "B"); // 席1
    await until(() => { const L = lastLobby(b.c); return L && L.yourSeat === 1; }, 2000, "Bが席1");
    a.ep.close(); // ホスト離脱
    await until(() => lastLobby(b.c)?.hostSeat === 1, 2000, "ホストがBへ繰り上がり");
    const L = lastLobby(b.c);
    assert(L.members[0].kind === "open", "席0は空きに戻る");
    assert(L.yourSeat === 1 && L.hostSeat === 1, "Bが新ホスト");
    await teardown(server, [b.ep]);
  }

  // --- (7) 満席は弾く ---
  {
    const { host, server } = await makeHost();
    const ids = ["shiyue", "kuidoshi", "bibi", "yobinin"];
    const eps = [];
    for (const id of ids) eps.push((await joinLobby(server, id, id)).ep);
    await until(() => host.slots && host.slots.every((s) => s.type === "human"), 2000, "4人で満席");
    const e = await joinLobby(server, "shiyue", "5人目");
    await until(() => e.c.received.some((m) => m.type === "evt.lobbyFull"), 2000, "5人目は満員で弾かれる");
    await teardown(server, [...eps, e.ep]);
  }

  if (failures === 0) console.log("\n✅ netlobby (単独=ホスト / 随時反映 / CPU化解除 / 権限 / 開始完走 / 繰り上がり / 満席) checks passed");
  else { console.error(`\n❌ ${failures} failure(s)`); process.exit(1); }
  process.exit(0);
})();
