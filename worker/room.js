// 通信対戦 L4c-2 ①c: 卓 = 1 Durable Object（MahjongRoom）。
//
// server-online.mjs（Node + ws）の Cloudflare 版。WS の受け口だけを WebSocketPair に替え、卓ロジックは
// 既存の serveRoom / AuthorityRoom / redact をそのまま再利用する（src/net/* は純 JS で Workers で動く）。
// 接続→ intent.join{charId} → 席0=その雀士＋CPU補填で卓構築 → welcome → 対局。切断は dropSeat。
import { Game } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";
import { serveRoom } from "../src/net/onlineServer.js";

const seatOf = (cs) => cs.map((c) => ({ character: c, abilities: instantiateAbilities(c) }));
function shuffled(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

// Workers の WebSocket(server側)を transport 端点（{send,onMessage,onClose,close}）にラップ。
function wrapServerWs(ws) {
  let handler = null;
  let queue = [];
  const deliver = (m) => { if (handler) handler(m); else queue.push(m); };
  ws.addEventListener("message", (ev) => {
    let m;
    try { m = JSON.parse(typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data)); } catch { return; }
    deliver(m);
  });
  return {
    send: (m) => { try { ws.send(JSON.stringify(m)); } catch { /* closed */ } },
    onMessage: (fn) => { handler = fn; const q = queue; queue = []; for (const m of q) fn(m); },
    onClose: (fn) => ws.addEventListener("close", fn),
    close: () => { try { ws.close(); } catch { /* already closed */ } },
  };
}

export class MahjongRoom {
  constructor(state, env) { this.state = state; this.env = env; }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const endpoint = wrapServerWs(server);
    let started = false;
    // join 受信で卓を立てる。以後 serveRoom(=AuthorityRoom) が endpoint.onMessage を intent ハンドラへ。
    endpoint.onMessage((msg) => {
      if (started || !msg || msg.type !== "intent.join") return;
      started = true;
      const human = CHARACTERS.find((c) => c.id === msg.charId) || CHARACTERS[0];
      const cpus = shuffled(CHARACTERS.filter((c) => c.id !== human.id)).slice(0, 3);
      const chars = [human, ...cpus];
      const game = new Game(seatOf(chars), /*human seat*/ 0, undefined, { maxRounds: 1 });
      serveRoom(endpoint, game, chars.map((c) => c.id), {
        seat: 0,
        timeout: 120000,
        pacing: { cpuDelay: 650, cutInWait: 1700, nakiWait: 1100 },
      });
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}
