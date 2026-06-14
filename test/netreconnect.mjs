// 通信対戦 リコネクト（途中復帰）テスト。Run: node test/netreconnect.mjs
//
// 実ソケットで join → 数手プレイ → 切断（席0はCPU代打ち・対局継続）→ 同じ卓へ intent.rejoin{token}
// で再接続 → サーバが現在の盤面スナップショットを送る → 新クライアントが途中局面から再構築して
// プレイ再開 → 最後まで完走、を検証する。
import { createSocketServer, connectSocket } from "../src/net/socketTransport.js";
import { RoomHost } from "../src/net/onlineServer.js";
import { ClientSession } from "../src/net/clientSession.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";

let failures = 0;
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); failures++; } };
const makeSeated = (ids) => ids.map((id) => { const c = CHARACTERS.find((x) => x.id === id) || CHARACTERS[0]; return { character: c, abilities: instantiateAbilities(c) }; });
const ids = (a) => a.map((t) => t.id);
const meldKey = (ms) => ms.map((m) => m.type + ":" + m.tiles.map((t) => t.id).sort((a, b) => a - b).join(",")).join("|");
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(pred, ms, label) { const t0 = Date.now(); while (!pred()) { if (Date.now() - t0 > ms) throw new Error(`timeout: ${label}`); await wait(40); } }

(async () => {
  const host = new RoomHost();
  let room = null;
  const server = await createSocketServer(0);
  // ホスト経由で接続を捌く（join→卓作成 / rejoin→復帰）。room を覗いて検証に使う。
  server.onConnection((conn) => { host.handle(conn, { timeout: 5000, pacing: { cpuDelay: 25, nakiWait: 10 } }); });

  // --- client1: join して数手進める ---
  const ep1 = await connectSocket("127.0.0.1", server.port);
  const c1 = new ClientSession(ep1, { seat: 0, makeSeated });
  ep1.send({ type: "intent.join", charId: "shiyue" });
  await until(() => host.room != null, 5000, "room created");
  room = host.room;
  const token = c1.received.find((m) => m.type === "welcome")?.token;
  assert(!!token, "join welcome carried a reconnect token");
  // 盤面が少し進む（誰かが打牌する）まで待つ
  await until(() => room.game.players.reduce((s, p) => s + p.discards.length, 0) >= 3, 10000, "some discards");

  // --- 切断（席0は CPU 代打ちへ・対局は継続） ---
  ep1.close();
  await wait(300); // CPU が席0を少し打つ
  assert(!room.isRemote(0), "seat 0 became CPU after disconnect");
  assert(!room.game.isGameOver(), "game still running during the outage");

  // --- client2: 同じ卓へ rejoin ---
  const ep2 = await connectSocket("127.0.0.1", server.port);
  const c2 = new ClientSession(ep2, { seat: 0, makeSeated });
  ep2.send({ type: "intent.rejoin", token });
  await until(() => c2.received.some((m) => m.type === "evt.snapshot"), 8000, "snapshot received");
  await wait(60);

  assert(room.isRemote(0), "seat 0 reclaimed by reconnecting client");
  // スナップショットで現在局面が再構築できている（公開＋自席手牌＋他席枚数で一致）
  const g = room.game, rep = c2.replica;
  for (let i = 0; i < 4; i++) {
    assert(eq(ids(g.players[i].discards), ids(rep.players[i].discards)), `seat ${i} river after reconnect`);
    assert(meldKey(g.players[i].melds) === meldKey(rep.players[i].melds), `seat ${i} melds after reconnect`);
    assert(g.players[i].points === rep.players[i].points, `seat ${i} points after reconnect`);
    assert(g.players[i].hand.length === rep.players[i].hand.length, `seat ${i} hand-count after reconnect`);
    if (i === 0) assert(eq(ids(g.players[0].hand).sort((a, b) => a - b), ids(rep.players[0].hand).sort((a, b) => a - b)), "own hand restored after reconnect");
    else assert(rep.players[i].hand.every((t) => t.id == null), `seat ${i} face-down after reconnect`);
  }

  // --- 復帰後、本人(client2)が最後までプレイできる ---
  await until(() => g.isGameOver(), 30000, "finished after reconnect");
  assert(g.isGameOver(), "game completed with the reconnected player");
  assert(c2.intentCount > 0, `reconnected client made moves (${c2.intentCount})`);

  ep2.close();
  await server.close();

  if (failures === 0) console.log("\n✅ netreconnect (disconnect → CPU → rejoin via token + snapshot) checks passed");
  else { console.error(`\n❌ ${failures} failure(s)`); process.exit(1); }
  process.exit(0);
})();
