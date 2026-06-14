// 通信対戦 L4c-2 ①c: 卓 = 1 Durable Object（MahjongRoom）。
//
// WS の受け口だけを WebSocketPair に替え、卓ロジックは RoomHost / AuthorityRoom / redact をそのまま
// 再利用する（src/net/* は純 JS で workers で動く）。RoomHost を DO インスタンスに保持するので、
// 同じ合言葉(room)へ繋ぎ直す `intent.rejoin{token}` で**対局途中から復帰**できる（リコネクト）。
import { RoomHost } from "../src/net/onlineServer.js";

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
  constructor(state, env) { this.state = state; this.env = env; this.host = new RoomHost(); }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    // マッチング待機時間。?wait=ms で上書き可（テスト用。既定 30 秒）。
    const waitParam = Number(new URL(request.url).searchParams.get("wait"));
    const matchWaitMs = Number.isFinite(waitParam) && waitParam >= 0 ? waitParam : 30000;
    // join は待機列へ（人間が揃うか時間切れで開始）、rejoin で同じ卓へ復帰（RoomHost が token 照合）。
    this.host.handle(wrapServerWs(server), {
      timeout: 120000,
      matchWaitMs,
      pacing: { cpuDelay: 650, cutInWait: 1700, nakiWait: 1100 },
    });
    return new Response(null, { status: 101, webSocket: client });
  }
}
