// 通信対戦 ローカル権威サーバ（テスト中・L4c-2 ①b）。Run: node server-online.mjs
//
// ws で待ち受け、クライアントの intent.join{charId} を受けて 1 卓を立てる（席0=その雀士、残り3席は
// CPU 補填＝接続の無い席）。対局は AuthorityRoom が回し、wire Event を席別 redaction して配信する。
// 切断は serveRoom 内で dropSeat → CPU 代打ち。これはローカル開発用で、本番は同じ serveRoom ロジックを
// Cloudflare Worker + Durable Object(WebSocketPair) へ移植する（L4c-2 ①c）。
import { createWsServer } from "./src/net/wsServer.js";
import { serveRoom } from "./src/net/onlineServer.js";
import { Game } from "./src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "./src/characters/characters.js";

const PORT = Number(process.env.PORT) || 8787;
const seatOf = (cs) => cs.map((c) => ({ character: c, abilities: instantiateAbilities(c) }));
function shuffled(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

const server = await createWsServer(PORT);
console.log(`麻雀オンライン権威サーバ: ws://127.0.0.1:${server.port}  (Ctrl+C で停止)`);

server.onConnection((conn) => {
  let started = false;
  // join 受信で卓を構築。以後 serveRoom(=AuthorityRoom) が conn.onMessage を intent ハンドラへ張り替える。
  conn.onMessage((msg) => {
    if (started || !msg || msg.type !== "intent.join") return;
    started = true;
    const human = CHARACTERS.find((c) => c.id === msg.charId) || CHARACTERS[0];
    const cpus = shuffled(CHARACTERS.filter((c) => c.id !== human.id)).slice(0, 3);
    const chars = [human, ...cpus];
    const game = new Game(seatOf(chars), /*human seat*/ 0, undefined, { maxRounds: 1 });
    serveRoom(conn, game, chars.map((c) => c.id), {
      seat: 0,
      timeout: 120000, // 人間の手番は長めに待つ
      pacing: { cpuDelay: 650, cutInWait: 1700, nakiWait: 1100 }, // ブラウザで CPU の手が見える間合い
    });
    console.log(`卓開始: 席0=${human.name} / CPU=${cpus.map((c) => c.name).join("・")}`);
  });
  conn.onClose?.(() => { if (started) console.log("クライアント切断（席0はCPU代打ち）"); });
});
