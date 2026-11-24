import { diagnosticFields, diagnosticError, closeReason } from "../src/net/diagnosticFields.js";

export function createConnectionLog(context, output = console) {
  const base = diagnosticFields(context);
  return (event, fields = {}) => {
    try {
      const entry = { scope: "mahjong-online", at: new Date().toISOString(), event, ...base, ...diagnosticFields(fields) };
      const method = /error|failed|crashed/.test(event) ? "error" : "info";
      output[method](entry);
    } catch { /* 診断の失敗では対局を止めない */ }
  };
}

// 送受信の全payloadは記録せず、接続の寿命と復帰結果だけ残す。
export function wrapServerWs(ws, { connectionId, log }) {
  let handler = null;
  let queue = [];
  let matchId;
  const startedAt = Date.now();
  let lastReceivedAt = startedAt;
  const report = (event, fields = {}) => log(event, { connectionId, matchId,
    aliveMs: Date.now() - startedAt, silenceMs: Date.now() - lastReceivedAt, ...fields });
  const deliver = (msg) => {
    try { if (handler) handler(msg); else if (queue.length < 64) queue.push(msg); }
    catch (error) { report("ws_handler_error", diagnosticError(error)); }
  };
  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      const text = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data);
      if (text.length > 16384) return;
      msg = JSON.parse(text);
    } catch { return; }
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;
    lastReceivedAt = Date.now();
    deliver(msg);
  });
  ws.addEventListener("close", (ev) => report("ws_closed", {
    code: ev.code, wasClean: ev.wasClean, reason: closeReason(ev.reason) }));
  ws.addEventListener("error", () => report("ws_error"));
  report("ws_accepted");
  return {
    connectionId,
    send: (msg) => {
      if (msg.type === "welcome") {
        matchId = diagnosticFields(msg).matchId;
        report(msg.rejoined ? "seat_rejoined" : "seat_joined", { seat: msg.seat });
      }
      if (msg.type === "evt.rejoinFailed") report("rejoin_missing");
      try { ws.send(JSON.stringify(msg)); }
      catch (error) { report("ws_send_failed", diagnosticError(error)); }
    },
    onMessage: (fn) => { handler = fn; const queued = queue; queue = []; for (const msg of queued) deliver(msg); },
    onClose: (fn) => ws.addEventListener("close", fn),
    close: (code = 1000, reason = "") => {
      report("ws_close_requested", { code, reason: closeReason(reason) });
      try { ws.close(code, reason); } catch { /* already closed */ }
    },
  };
}
