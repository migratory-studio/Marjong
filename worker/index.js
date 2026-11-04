// 通信対戦 L4c-2 ①c: Cloudflare Worker エントリ。
//
// WebSocket 接続(/ws?room=CODE)を、合言葉(room)ごとの MahjongRoom Durable Object へルーティングする。
// 同じ room 名のクライアントは同じ DO(=同じ卓)に入る。room 未指定は "default"。
// ローカルは `wrangler dev`、本番は `wrangler deploy`（同じコード）。
export { MahjongRoom } from "./room.js";
import { PUBLIC_ROOM } from "./regulars.js";

export default {
  async scheduled(event, env) {
    if (!env.REGULAR_WRITE_TOKEN) throw new Error("REGULAR_WRITE_TOKEN is missing");
    const room = env.ROOM.get(env.ROOM.idFromName(PUBLIC_ROOM));
    const response = await room.fetch("https://internal/regular-tick?time=" + event.scheduledTime, { method: "POST" });
    if (!response.ok) throw new Error("Regular tick failed: HTTP " + response.status);
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/regular-result/")) {
      if (request.method !== "GET" || !env.REGULAR_WRITE_TOKEN ||
          request.headers.get("x-regular-token") !== env.REGULAR_WRITE_TOKEN) return new Response(null, { status: 403 });
      return env.ROOM.get(env.ROOM.idFromName(PUBLIC_ROOM)).fetch(request);
    }
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const room = url.searchParams.get("room") || "default";
      const id = env.ROOM.idFromName(room);
      return env.ROOM.get(id).fetch(request);
    }
    return new Response("麻雀オンライン権威 (Cloudflare Worker)。/ws?room=CODE に WebSocket で接続。", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
