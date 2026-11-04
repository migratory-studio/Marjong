// 通信対戦 L4c-2 ①c: 卓 = 1 Durable Object（MahjongRoom）。
//
// WS の受け口だけを WebSocketPair に替え、卓ロジックは RoomHost / AuthorityRoom / redact をそのまま
// 再利用する（src/net/* は純 JS で workers で動く）。RoomHost を DO インスタンスに保持するので、
// 同じ合言葉(room)へ繋ぎ直す `intent.rejoin{token}` で**対局途中から復帰**できる（リコネクト）。
import { RoomHost } from "../src/net/onlineServer.js";
import { RegularClub } from "./regularClub.js";
import { PUBLIC_ROOM, HUMAN_WAIT_MS } from "./regulars.js";

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
    const url = new URL(request.url);
    if (url.pathname.startsWith("/regular-result/")) {
      const club = this.club ??= new RegularClub(this.state.storage);
      const row = club.sql.exec("SELECT data FROM outbox WHERE id=?", url.pathname.slice(16)).toArray()[0];
      return new Response(row?.data ?? null, { status: row ? 200 : 404,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    if (url.pathname === "/regular-tick" && request.method === "POST") {
      const club = this.club ??= new RegularClub(this.state.storage);
      await club.tick(this.host, Number(url.searchParams.get("time")));
      await club.flush(this.env);
      return new Response(null, { status: 204 });
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    // マッチング待機時間。?wait=ms で上書き可（テスト用。既定 30 秒）。
    // 注意: get("wait") は未指定だと null。Number(null)===0 なので「指定あり」を先に判定すること。
    const waitRaw = new URL(request.url).searchParams.get("wait");
    const waitParam = (waitRaw == null || waitRaw === "") ? NaN : Number(waitRaw);
    const regulars = url.searchParams.get("room") === PUBLIC_ROOM && this.env.REGULAR_WRITE_TOKEN
      ? (this.club ??= new RegularClub(this.state.storage)) : null;
    const matchWaitMs = regulars ? HUMAN_WAIT_MS : (Number.isFinite(waitParam) && waitParam >= 0) ? waitParam : 30000;
    // join は待機列へ（人間が揃うか時間切れで開始）、rejoin で同じ卓へ復帰（RoomHost が token 照合）。
    this.host.handle(wrapServerWs(server), {
      timeout: 15000, // 1手の持ち時間(ms)。超過席は CPU 代打ち(AuthorityRoom.autoSeats)へ。
      matchWaitMs,
      regulars,
      pacing: { cpuDelay: 650, cutInWait: 1700, nakiWait: 1100 },
    });
    return new Response(null, { status: 101, webSocket: client });
  }
}
