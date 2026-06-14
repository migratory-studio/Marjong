// 通信対戦 L4c-2 ①: ローカル WebSocket サーバ（Node・devDependency `ws` 使用）。
//
// ローカル開発/テスト専用。socketTransport(TCP) の WebSocket 版で、各接続を transport 端点として
// 渡す（serveRoom はトランスポート非依存なのでそのまま使える）。**本番は Cloudflare Durable Object
// の WebSocketPair に置き換える**ので、この `ws` 依存は本番ビルドには載らない（devDependency）。
//
// ブラウザは絶対にこのモジュールを import しないこと（`ws`/node は読めない）。クライアントは
// 依存ゼロの wsTransport.js を使う。
import { WebSocketServer } from "ws";

function wrapWs(socket) {
  let handler = null;
  let queue = [];
  const deliver = (msg) => { if (handler) handler(msg); else queue.push(msg); };
  socket.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    deliver(msg);
  });
  return {
    send: (msg) => { try { socket.send(JSON.stringify(msg)); } catch { /* closed */ } },
    onMessage: (fn) => { handler = fn; const q = queue; queue = []; for (const m of q) fn(m); },
    onClose: (fn) => socket.on("close", fn),
    close: () => { try { socket.close(); } catch { /* already closed */ } },
  };
}

// port=0 で空きポート。onConnection(endpoint) で各接続を受ける。
export function createWsServer(port = 0) {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port, host: "127.0.0.1" });
    wss.once("error", reject);
    wss.once("listening", () => {
      resolve({
        port: wss.address().port,
        onConnection: (cb) => wss.on("connection", (sock) => cb(wrapWs(sock))),
        close: () => new Promise((r) => wss.close(r)),
      });
    });
  });
}
