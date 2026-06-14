// 通信対戦 L4c: 実ソケット・トランスポート（ローカル実回線の検証用 / WS・Durable Object のスタンドイン）。
//
// createLoopback と同じ I/F（{ send, onMessage }）を、実ソケット越しに提供する。これにより既存の
// AuthorityRoom / ClientSession を一切変えず「実回線」で疎通検証できる。本番の transport は
// WebSocket → Cloudflare Durable Object に差し替える（同 I/F）。ここでは依存追加ゼロ・自前 WS
// フレーミングのリスクゼロのため、Node 組込 `net`(TCP) ＋ 改行区切り JSON を採用する。
//
// onMessage 前に届いたメッセージはキューして、ハンドラ設定時にまとめて流す（接続直後の welcome
// 取りこぼし防止）。受信は部分フレームをバッファし、改行で 1 メッセージずつ復元する。
import net from "node:net";

function wrapSocket(socket) {
  socket.setEncoding("utf8");
  let buf = "";
  let handler = null;
  let queue = [];
  const deliver = (msg) => { if (handler) handler(msg); else queue.push(msg); };
  socket.on("data", (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      deliver(msg);
    }
  });
  return {
    send: (msg) => { try { socket.write(JSON.stringify(msg) + "\n"); } catch { /* socket closed */ } },
    onMessage: (fn) => { handler = fn; const q = queue; queue = []; for (const m of q) fn(m); },
    onClose: (fn) => socket.on("close", fn),
    close: () => { try { socket.end(); } catch { /* already closed */ } },
  };
}

// サーバを起動。onConnection(endpoint) で各接続を transport 端点として受け取る。port=0 で空きポート。
export function createSocketServer(port = 0) {
  let onConn = null;
  const server = net.createServer((socket) => { if (onConn) onConn(wrapSocket(socket)); });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      resolve({
        port: server.address().port,
        onConnection: (cb) => { onConn = cb; },
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

// クライアント接続。解決値は transport 端点（{ send, onMessage, onClose, close }）。
export function connectSocket(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => resolve(wrapSocket(socket)));
    socket.once("error", reject);
  });
}
