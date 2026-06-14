// 通信対戦 ローカル権威サーバ（テスト中・L4c-2 ①b/リコネクト）。Run: node server-online.mjs
//
// ws で待ち受け、接続URLの ?room=合言葉 ごとに 1 卓（RoomHost）を持つ。最初の接続(intent.join)で卓を
// 立て、同じ room へ繋ぎ直す接続(intent.rejoin{token})は対局途中から復帰させる。本番は同じ
// RoomHost/serveRoom ロジックを Cloudflare Durable Object(worker/) で動かす（DO は room=DO で隔離）。
import { createWsServer } from "./src/net/wsServer.js";
import { RoomHost } from "./src/net/onlineServer.js";

const PORT = Number(process.env.PORT) || 8787;
const hosts = new Map(); // room 名 → RoomHost
const ROOM_OPTS = { timeout: 120000, pacing: { cpuDelay: 650, cutInWait: 1700, nakiWait: 1100 } };

const server = await createWsServer(PORT);
console.log(`麻雀オンライン権威サーバ: ws://127.0.0.1:${server.port}/ws?room=合言葉  (Ctrl+C で停止)`);

server.onConnection((conn, req) => {
  let room = "default";
  try { room = new URL(req.url, "ws://x").searchParams.get("room") || "default"; } catch { /* keep default */ }
  let host = hosts.get(room);
  if (!host) { host = new RoomHost(); hosts.set(room, host); }
  host.handle(conn, ROOM_OPTS);
});
