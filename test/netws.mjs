// 通信対戦 L4c-2 ① の実 WebSocket 疎通テスト。Run: node test/netws.mjs
//
// netsocket(TCP) の WebSocket 版。クライアントは依存ゼロの wsTransport(組込 WebSocket)、サーバは
// ローカル用 `ws`。既存の AuthorityRoom/ClientSession を実 WS 越しに通し、本番(Cloudflare DO)へ
// 載せ替える前に「クライアント I/F ＋ WS 経路」を検証する。検証:
//  (1) 実 WS で1ゲーム完走（席0=WS接続クライアント、残りCPU補填）。
//  (2) 漏洩なし＆整合（公開＋自席手牌＋他席枚数で権威と一致／他席は伏せ札）。
//  (3) 切断 → CPU 代打ちで対局完走。
import { Game } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";
import { connectWebSocket } from "../src/net/wsTransport.js";
import { createWsServer } from "../src/net/wsServer.js";
import { serveRoom } from "../src/net/onlineServer.js";
import { ClientSession } from "../src/net/clientSession.js";

let failures = 0;
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); failures++; } };
const rosterChars = (s) => { const o = []; for (let i = 0; i < 4; i++) o.push(CHARACTERS[(s + i) % CHARACTERS.length]); return o; };
const seatOf = (cs) => cs.map((c) => ({ character: c, abilities: instantiateAbilities(c) }));
const makeSeated = (ids) => ids.map((id) => { const c = CHARACTERS.find((x) => x.id === id) || CHARACTERS[0]; return { character: c, abilities: instantiateAbilities(c) }; });
const ids = (a) => a.map((t) => t.id);
const meldKey = (ms) => ms.map((m) => m.type + ":" + m.tiles.map((t) => t.id).sort((a, b) => a - b).join(",")).join("|");
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hasForbidden = (o) => { const s = JSON.stringify(o); return s.includes('"seed"') || s.includes('"wall"'); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(pred, ms, label) { const t0 = Date.now(); while (!pred()) { if (Date.now() - t0 > ms) throw new Error(`timeout: ${label}`); await wait(50); } }

async function playFullGame(seed) {
  const chars = rosterChars(seed % CHARACTERS.length);
  const auth = new Game(seatOf(chars), -1, seed);
  const server = await createWsServer(0);
  server.onConnection((conn) => serveRoom(conn, auth, chars.map((c) => c.id), { timeout: 5000 }));
  const ep = await connectWebSocket(`ws://127.0.0.1:${server.port}`);
  const client = new ClientSession(ep, { seat: 0, makeSeated });

  await until(() => auth.isGameOver(), 30000, `seed ${seed} game over`);
  await wait(50);
  ep.close();
  await server.close();

  assert(client.replica != null, `seed ${seed}: replica built from welcome`);
  let leaks = 0;
  for (const msg of client.received) {
    if (hasForbidden(msg)) leaks++;
    if (msg.type === "handStarted") for (let i = 0; i < 4; i++) if (i !== 0 && msg.hands[i] != null) leaks++;
    if (msg.type === "tileDrawn" && msg.seat !== 0 && (msg.tileId != null || msg.kind != null)) leaks++;
    if (msg.type === "abilityUsed" && msg.seat !== 0 && msg.hand != null) leaks++;
  }
  assert(leaks === 0, `seed ${seed}: ${leaks} leak(s) over WebSocket`);
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

async function disconnectMidGame(seed) {
  const chars = rosterChars(seed % CHARACTERS.length);
  const auth = new Game(seatOf(chars), -1, seed);
  const server = await createWsServer(0);
  server.onConnection((conn) => serveRoom(conn, auth, chars.map((c) => c.id), { timeout: 5000 }));
  const ep = await connectWebSocket(`ws://127.0.0.1:${server.port}`);
  const client = new ClientSession(ep, { seat: 0, makeSeated });
  await until(() => client.replica && client.replica.players.some((p) => p.discards.length > 0), 15000, `seed ${seed} started`);
  ep.close();
  await until(() => auth.isGameOver(), 30000, `seed ${seed} finished after drop`);
  await server.close();
  assert(auth.isGameOver(), `seed ${seed}: completed after WS disconnect (CPU took over)`);
}

(async () => {
  let total = 0;
  for (const seed of [101, 202, 303]) {
    try { total += await playFullGame(seed); } catch (e) { assert(false, `playFullGame ${seed} threw: ${e.message}`); }
  }
  try { await disconnectMidGame(404); } catch (e) { assert(false, `disconnectMidGame threw: ${e.message}`); }

  console.log(`  played 3 full games + 1 disconnect over real WebSocket (${total} msgs to seat 0)`);
  if (failures === 0) console.log("\n✅ netws (WebSocket transport + disconnect→CPU) checks passed");
  else { console.error(`\n❌ ${failures} failure(s)`); process.exit(1); }
  process.exit(0);
})();
