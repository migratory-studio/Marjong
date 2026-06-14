// 通信対戦 L4c-2 ①c: Cloudflare Worker エントリ。
//
// WebSocket 接続(/ws?room=CODE)を、合言葉(room)ごとの MahjongRoom Durable Object へルーティングする。
// 同じ room 名のクライアントは同じ DO(=同じ卓)に入る。room 未指定は "default"。
// ローカルは `wrangler dev`、本番は `wrangler deploy`（同じコード）。
export { MahjongRoom } from "./room.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
