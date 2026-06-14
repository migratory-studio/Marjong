// 通信対戦 マッチング待機テスト。Run: node test/netmatch.mjs
//
// RoomHost が join を即CPU化せず「人間が揃うか時間切れ」まで待ってから卓を確定することを検証する：
//  (1) 時間切れフォールバック：1人で join → matchWaitMs 経過 → 1人＋CPU3 で開始（席0）。
//  (2) 複数人マッチング：2人が締切内に join → 同卓（席0/1）＋CPU2、最後まで完走。
//  (3) 満席で即開始：4人 join で締切を待たず即開始。
//  (4) 探索中は evt.matchWaiting（待機人数）が届く。
import { createSocketServer, connectSocket } from "../src/net/socketTransport.js";
import { RoomHost } from "../src/net/onlineServer.js";
import { ClientSession } from "../src/net/clientSession.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";

let failures = 0;
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); failures++; } };
const makeSeated = (ids) => ids.map((id) => { const c = CHARACTERS.find((x) => x.id === id) || CHARACTERS[0]; return { character: c, abilities: instantiateAbilities(c) }; });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(pred, ms, label) { const t0 = Date.now(); while (!pred()) { if (Date.now() - t0 > ms) throw new Error(`timeout: ${label}`); await wait(20); } }

// 1ホスト＝1卓。opts.matchWaitMs で待機時間を制御。
async function makeHost(opts) {
  const host = new RoomHost();
  const server = await createSocketServer(0);
  server.onConnection((conn) => host.handle(conn, { timeout: 4000, pacing: { cpuDelay: 10, nakiWait: 5 }, ...opts }));
  return { host, server };
}
async function joinClient(server, charId) {
  const ep = await connectSocket("127.0.0.1", server.port);
  const c = new ClientSession(ep, { makeSeated });
  ep.send({ type: "intent.join", charId });
  return { ep, c };
}
const welcomeOf = (c) => c.received.find((m) => m.type === "welcome");
// net.Server.close は既存接続が閉じるまで待つ。後片付けはクライアントを閉じてからサーバを閉じる。
async function teardown(server, eps) { for (const ep of eps) ep.close(); await wait(30); await server.close(); }

(async () => {
  // --- (1) 時間切れフォールバック：1人＋CPU3 ---
  {
    const { host, server } = await makeHost({ matchWaitMs: 150 });
    const a = await joinClient(server, "shiyue");
    assert(host.room == null, "join 直後は卓未確定（待機中）");
    await until(() => host.room != null, 3000, "時間切れで卓確定");
    const w = welcomeOf(a.c);
    assert(!!w && w.seat === 0, "単独参加は席0");
    assert(w && w.roster && w.roster.length === 4, "空席はCPUで4人に補填");
    assert(w && w.token, "再接続トークンが発行される");
    await teardown(server, [a.ep]);
  }

  // --- (2) 複数人マッチング：2人同卓＋CPU2、完走 ---
  {
    const { host, server } = await makeHost({ matchWaitMs: 500 });
    const a = await joinClient(server, "shiyue");
    const b = await joinClient(server, "kuidoshi");
    await until(() => host.room != null, 3000, "2人で卓確定");
    const wa = welcomeOf(a.c), wb = welcomeOf(b.c);
    assert(wa && wb, "両者に welcome");
    const seats = [wa?.seat, wb?.seat].sort();
    assert(seats[0] === 0 && seats[1] === 1, `人間は席0/1（got ${seats}）`);
    assert(host.room.isRemote(0) && host.room.isRemote(1), "席0/1は遠隔(人間)");
    assert(!host.room.isRemote(2) && !host.room.isRemote(3), "席2/3はCPU");
    await until(() => host.room.game.isGameOver(), 30000, "2人卓が完走");
    assert(a.c.intentCount > 0 && b.c.intentCount > 0, "両者とも打牌した");
    await teardown(server, [a.ep, b.ep]);
  }

  // --- (3) 満席で即開始（締切を待たない） ---
  {
    const { host, server } = await makeHost({ matchWaitMs: 10000 });
    const ids = ["shiyue", "kuidoshi", "bibi", "yobinin"];
    const eps = [];
    for (const id of ids) eps.push((await joinClient(server, id)).ep);
    const t0 = Date.now();
    await until(() => host.room != null, 3000, "4人で即開始");
    assert(Date.now() - t0 < 2000, "締切(10s)を待たず即開始した");
    for (let s = 0; s < 4; s++) assert(host.room.isRemote(s), `席${s}は人間（CPU補填なし）`);
    await teardown(server, eps);
  }

  // --- (4) 探索中の進捗通知 ---
  {
    const { host, server } = await makeHost({ matchWaitMs: 400 });
    const a = await joinClient(server, "shiyue");
    await wait(60);
    const w1 = a.c.received.find((m) => m.type === "evt.matchWaiting");
    assert(!!w1 && w1.joined === 1 && w1.capacity === 4, "1人目に matchWaiting(joined=1)");
    const b = await joinClient(server, "kuidoshi");
    await until(() => a.c.received.filter((m) => m.type === "evt.matchWaiting").some((m) => m.joined === 2), 2000, "2人目で joined=2 が配信");
    await until(() => host.room != null, 3000, "締切で開始");
    await teardown(server, [a.ep, b.ep]);
  }

  // --- (5) 常設マッチメイカー：開始後も次バッチを受け付ける（締め出さない） ---
  {
    const { host, server } = await makeHost({ matchWaitMs: 120 });
    const a = await joinClient(server, "shiyue");          // バッチ1
    await until(() => host.room != null, 2000, "バッチ1開始");
    const room1 = host.room;
    const tok1 = welcomeOf(a.c)?.token;
    // バッチ1開始後の新規参加が matchClosed されず、新しいバッチで開始する
    const b = await joinClient(server, "kuidoshi");        // バッチ2
    const cc = await joinClient(server, "bibi");
    await until(() => host.room !== room1, 2000, "バッチ2が別卓で開始");
    assert(!b.c.received.some((m) => m.type === "evt.matchClosed"), "開始後の参加が締め出されない(matchClosedなし)");
    assert(welcomeOf(b.c) && welcomeOf(cc.c), "バッチ2の両者に welcome");
    assert(host.room !== room1, "バッチ2は別の AuthorityRoom");
    // 両卓の token がそれぞれ rejoin 照合表に載っている（複数卓を同時管理）
    assert(tok1 && host.tokenSeat[tok1] && host.tokenSeat[tok1].room === room1, "バッチ1の token は卓1を指す");
    const tok2 = welcomeOf(b.c)?.token;
    assert(tok2 && host.tokenSeat[tok2] && host.tokenSeat[tok2].room === host.room, "バッチ2の token は卓2を指す");
    await teardown(server, [a.ep, b.ep, cc.ep]);
  }

  if (failures === 0) console.log("\n✅ netmatch (待機→時間切れCPU / 複数人同卓 / 満席即開始 / 進捗通知 / 常設マッチメイカー) checks passed");
  else { console.error(`\n❌ ${failures} failure(s)`); process.exit(1); }
  process.exit(0);
})();
