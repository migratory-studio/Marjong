// 通信対戦 L4c-2 ①c: 卓 = 1 Durable Object（MahjongRoom）。
//
// WS の受け口だけを WebSocketPair に替え、卓ロジックは RoomHost / AuthorityRoom / redact をそのまま
// 再利用する（src/net/* は純 JS で workers で動く）。RoomHost を DO インスタンスに保持するので、
// 同じ合言葉(room)へ繋ぎ直す `intent.rejoin{token}` で**対局途中から復帰**できる（リコネクト）。
import { RoomHost } from "../src/net/onlineServer.js";
import { RegularClub } from "./regularClub.js";
import { PUBLIC_ROOM, HUMAN_WAIT_MS } from "./regulars.js";
import { APP_VERSION } from "../src/config/appInfo.js";
import { createConnectionLog, wrapServerWs } from "./connectionLog.js";

export class MahjongRoom {
  constructor(state, env) {
    this.state = state; this.env = env; this.host = new RoomHost();
    this.instanceId = crypto.randomUUID(); // メモリが作り直されたら変わる（永続IDではない）
    this.log = createConnectionLog({ instanceId: this.instanceId, build: APP_VERSION });
    this.log("instance_started");
  }

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
    const connectionId = crypto.randomUUID();
    const endpoint = wrapServerWs(server, { connectionId, log: this.log });
    endpoint.send({ type: "evt.connection", connectionId, instanceId: this.instanceId, build: APP_VERSION });
    // マッチング待機時間。?wait=ms で上書き可（テスト用。既定 30 秒）。
    // 注意: get("wait") は未指定だと null。Number(null)===0 なので「指定あり」を先に判定すること。
    const waitRaw = new URL(request.url).searchParams.get("wait");
    const waitParam = (waitRaw == null || waitRaw === "") ? NaN : Math.min(Number(waitRaw), 60000);
    const regulars = url.searchParams.get("room") === PUBLIC_ROOM && this.env.REGULAR_WRITE_TOKEN
      ? (this.club ??= new RegularClub(this.state.storage)) : null;
    const matchWaitMs = regulars ? HUMAN_WAIT_MS : (Number.isFinite(waitParam) && waitParam >= 0) ? waitParam : 30000;
    // join は待機列へ（人間が揃うか時間切れで開始）、rejoin で同じ卓へ復帰（RoomHost が token 照合）。
    this.host.handle(endpoint, {
      diagnostic: this.log,
      timeout: 15000, // 1手の持ち時間(ms)。超過席は CPU 代打ち(AuthorityRoom.autoSeats)へ。
      matchWaitMs,
      regulars,
      pacing: { cpuDelay: 650, cutInWait: 1700, nakiWait: 1100 },
    });
    return new Response(null, { status: 101, webSocket: client });
  }
}
