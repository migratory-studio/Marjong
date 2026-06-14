// 通信対戦 L4c の実ソケット疎通テスト。Run: node test/netsocket.mjs
//
// 既存の AuthorityRoom / ClientSession を「実ソケット越し」(TCP loopback = WS/DO のスタンドイン)で
// 結線し、本番に近い経路で検証する。loopback(同一プロセスのメモリ受け渡し)と違い、ここでは
// シリアライズ→改行フレーミング→TCP→復元→順序保証→接続ライフサイクルが実際に通る。検証:
//  (1) 実回線で1ゲーム完走（席0=ソケット接続クライアント、残りCPU補填）。
//  (2) 漏洩なし＆整合（netredact と同じ：他席手牌/seed/wall は届かない／公開＋自席＋他席枚数で一致）。
//  (3) 切断 → CPU 代打ち：対局途中でクライアントを切っても、権威は最後まで対局を続ける。
import { Game } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";
import { createSocketServer, connectSocket } from "../src/net/socketTransport.js";
import { serveRoom } from "../src/net/onlineServer.js";
import { ClientSession } from "../src/net/clientSession.js";

let failures = 0;
const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); failures++; } };

function rosterChars(startIdx) {
  const out = [];
  for (let i = 0; i < 4; i++) out.push(CHARACTERS[(startIdx + i) % CHARACTERS.length]);
  return out;
}
const seatOf = (chars) => chars.map((c) => ({ character: c, abilities: instantiateAbilities(c) }));
const makeSeated = (rosterIds) =>
  rosterIds.map((id) => {
    const c = CHARACTERS.find((x) => x.id === id) || CHARACTERS[0];
    return { character: c, abilities: instantiateAbilities(c) };
  });

const ids = (arr) => arr.map((t) => t.id);
const meldKey = (melds) =>
  melds.map((m) => m.type + ":" + m.tiles.map((t) => t.id).sort((a, b) => a - b).join(",")).join("|");
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hasForbidden = (o) => { const s = JSON.stringify(o); return s.includes('"seed"') || s.includes('"wall"'); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(pred, timeoutMs, label) {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout: ${label}`);
    await wait(50);
  }
}

// (1)+(2): 実ソケットで1ゲーム完走 → 漏洩なし＋整合
async function playFullGame(seed) {
  const chars = rosterChars(seed % CHARACTERS.length);
  const auth = new Game(seatOf(chars), -1, seed);
  const server = await createSocketServer(0);
  let room = null;
  server.onConnection((conn) => { room = serveRoom(conn, auth, chars.map((c) => c.id), { timeout: 5000 }); });
  const clientEp = await connectSocket("127.0.0.1", server.port);
  const client = new ClientSession(clientEp, { seat: 0, makeSeated });

  await until(() => auth.isGameOver(), 30000, `seed ${seed} game over`);
  await wait(50); // 末尾フレームの到達待ち
  clientEp.close();        // 接続を閉じてから server.close（既存接続があると閉じ切らない）
  await server.close();

  assert(client.replica != null, `seed ${seed}: replica built from welcome`);
  // 漏洩なし
  let leaks = 0;
  for (const msg of client.received) {
    if (hasForbidden(msg)) leaks++;
    if (msg.type === "handStarted") for (let i = 0; i < 4; i++) if (i !== 0 && msg.hands[i] != null) leaks++;
    if (msg.type === "tileDrawn" && msg.seat !== 0 && (msg.tileId != null || msg.kind != null)) leaks++;
    if (msg.type === "abilityUsed" && msg.seat !== 0 && msg.hand != null) leaks++;
  }
  assert(leaks === 0, `seed ${seed}: ${leaks} leak(s) over the socket`);
  // 整合（公開＋自席手牌＋他席枚数）
  for (let i = 0; i < 4; i++) {
    const ap = auth.players[i], cp = client.replica.players[i];
    assert(eq(ids(ap.discards), ids(cp.discards)), `seed ${seed}: seat ${i} river`);
    assert(meldKey(ap.melds) === meldKey(cp.melds), `seed ${seed}: seat ${i} melds`);
    assert(ap.points === cp.points, `seed ${seed}: seat ${i} points`);
    assert(ap.hand.length === cp.hand.length, `seed ${seed}: seat ${i} hand-count`);
    if (i === 0) assert(eq(ids(ap.hand).sort((a, b) => a - b), ids(cp.hand).sort((a, b) => a - b)), `seed ${seed}: own hand`);
    else assert(cp.hand.every((t) => t.id == null), `seed ${seed}: seat ${i} face-down`);
  }
  return client.received.length;
}

// (3): 切断 → CPU 代打ち。途中でソケットを切っても権威は最後まで回る。
async function disconnectMidGame(seed) {
  const chars = rosterChars(seed % CHARACTERS.length);
  const auth = new Game(seatOf(chars), -1, seed);
  const server = await createSocketServer(0);
  server.onConnection((conn) => serveRoom(conn, auth, chars.map((c) => c.id), { timeout: 5000 }));
  const clientEp = await connectSocket("127.0.0.1", server.port);
  const client = new ClientSession(clientEp, { seat: 0, makeSeated });

  await until(() => client.replica && client.replica.players.some((p) => p.discards.length > 0), 15000, `seed ${seed} started`);
  clientEp.close(); // 離脱（席0は以後 CPU 代打ち）
  await until(() => auth.isGameOver(), 30000, `seed ${seed} finished after drop`);
  await server.close();
  assert(auth.isGameOver(), `seed ${seed}: game completed after client disconnect (CPU took over)`);
}

(async () => {
  let total = 0;
  for (const seed of [101, 202, 303]) {
    try { total += await playFullGame(seed); }
    catch (e) { assert(false, `playFullGame ${seed} threw: ${e.message}`); }
  }
  try { await disconnectMidGame(404); }
  catch (e) { assert(false, `disconnectMidGame threw: ${e.message}`); }

  console.log(`  played 3 full games + 1 disconnect over real TCP sockets (${total} msgs to seat 0)`);
  if (failures === 0) console.log("\n✅ netsocket (real-socket transport + disconnect→CPU) checks passed");
  else { console.error(`\n❌ ${failures} failure(s)`); process.exit(1); }
  process.exit(0);
})();
