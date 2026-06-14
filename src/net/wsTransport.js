// 通信対戦 L4c-2 ①: WebSocket クライアント・トランスポート（ブラウザ / Node 共通）。
//
// createLoopback / socketTransport と同じ I/F（{ send, onMessage, onClose, close }）を、組込 WebSocket
// で提供する。ブラウザはもちろん Node 18+/24 も組込 WebSocket クライアントを持つので**依存ゼロ**。
// サーバ側はローカル=`ws`(src/net/wsServer.js)、本番=Cloudflare Durable Object(WebSocketPair) と
// 差し替えるが、このクライアントは両方に対してそのまま使える。
//
// メッセージは 1 WS フレーム = 1 JSON。onMessage 前に届いた分はキューしてハンドラ設定時に流す。
export function connectWebSocket(url) {
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WebSocket(url); } catch (e) { reject(e); return; }
    let handler = null;
    let queue = [];
    const deliver = (msg) => { if (handler) handler(msg); else queue.push(msg); };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data)); } catch { return; }
      deliver(msg);
    };
    ws.onopen = () => resolve({
      send: (msg) => { try { ws.send(JSON.stringify(msg)); } catch { /* closed */ } },
      onMessage: (fn) => { handler = fn; const q = queue; queue = []; for (const m of q) fn(m); },
      onClose: (fn) => ws.addEventListener("close", fn),
      close: () => { try { ws.close(); } catch { /* already closed */ } },
    });
    ws.onerror = (e) => reject(e instanceof Error ? e : new Error("websocket error"));
  });
}
