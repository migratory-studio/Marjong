// 通信対戦 L4c-2 ①: WebSocket クライアント・トランスポート（ブラウザ / Node 共通）。
//
// createLoopback / socketTransport と同じ I/F（{ send, onMessage, onClose, close }）を、組込 WebSocket
// で提供する。ブラウザはもちろん Node 18+/24 も組込 WebSocket クライアントを持つので**依存ゼロ**。
// サーバ側はローカル=`ws`(src/net/wsServer.js)、本番=Cloudflare Durable Object(WebSocketPair) と
// 差し替えるが、このクライアントは両方に対してそのまま使える。
//
// メッセージは 1 WS フレーム = 1 JSON。onMessage 前に届いた分はキューしてハンドラ設定時に流す。
import { connectionDiagnostics } from "./connectionDiagnostics.js";
import { diagnosticFields, closeReason } from "./diagnosticFields.js";

export function connectWebSocket(url, { timeout = 10000, diagnostics = connectionDiagnostics } = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let lastReceivedAt = startedAt, localClose = false;
    let context = { attemptId: crypto.randomUUID() };
    let progress = {};
    const log = (event, fields = {}) => {
      try { diagnostics?.record(event, { ...context, ...progress, ...fields,
        aliveMs: Date.now() - startedAt, silenceMs: Date.now() - lastReceivedAt,
        networkOnline: typeof navigator !== "undefined" ? navigator.onLine : undefined,
        visibility: typeof document !== "undefined" ? document.visibilityState : undefined,
      }); } catch { /* 診断の失敗は接続に影響させない */ }
    };
    log("ws_connect");
    let ws;
    try { ws = new WebSocket(url); } catch (e) { log("ws_error"); reject(e); return; }
    let opened = false;
    let closed = null;
    const closeHandlers = new Set();
    const timer = setTimeout(() => {
      log("ws_timeout", { readyState: ws.readyState });
      localClose = true;
      reject(new Error("websocket connection timed out"));
      try { ws.close(); } catch { /* connecting/closed */ }
    }, timeout);
    let handler = null;
    let queue = [];
    const deliver = (msg) => { if (handler) handler(msg); else queue.push(msg); };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data)); } catch { return; }
      if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;
      lastReceivedAt = Date.now();
      progress = diagnosticFields({ ...progress, lastEvent: msg.type, lastSeq: msg.seq ?? progress.lastSeq,
        handNumber: msg.handNumber ?? progress.handNumber, phase: msg.pub?.phase ?? progress.phase, turn: msg.pub?.turn ?? progress.turn });
      if (msg.type === "evt.connection") {
        context = { ...context, ...diagnosticFields({ connectionId: msg.connectionId, instanceId: msg.instanceId }) };
        log("server_connection", { build: msg.build });
      }
      if (msg.type === "welcome") {
        context = { ...context, ...diagnosticFields({ matchId: msg.matchId }) };
        log("match_welcome", { seat: msg.seat, rejoined: !!msg.rejoined });
      }
      if (msg.type === "evt.rejoinFailed") log("rejoin_missing");
      if (msg.type === "evt.gameOver") log("match_finished");
      deliver(msg);
    };
    ws.onopen = () => {
      opened = true;
      clearTimeout(timer);
      log("ws_open");
      resolve({
        send: (msg) => { try { ws.send(JSON.stringify(msg)); } catch { log("ws_send_failed", { readyState: ws.readyState }); } },
        onMessage: (fn) => { handler = fn; const q = queue; queue = []; for (const m of q) fn(m); },
        onClose: (fn) => { closeHandlers.add(fn); if (closed) fn(closed); },
        close: () => { localClose = true; try { ws.close(); } catch { /* already closed */ } },
      });
    };
    ws.onclose = (ev) => {
      clearTimeout(timer);
      closed = ev;
      log("ws_close", { code: ev.code, wasClean: ev.wasClean, reason: closeReason(ev.reason), localClose, readyState: ws.readyState });
      if (!opened) reject(new Error("websocket closed before opening"));
      for (const fn of closeHandlers) fn(ev);
    };
    ws.onerror = (e) => {
      log("ws_error", { readyState: ws.readyState });
      clearTimeout(timer);
      reject(e instanceof Error ? e : new Error("websocket error"));
    };
  });
}
