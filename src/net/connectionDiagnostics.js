import { diagnosticFields, diagnosticError } from "./diagnosticFields.js";

const KEY = "mahjong-online-diagnostics-v1";
const LIMIT = 120;
const MAX_AGE = 24 * 60 * 60 * 1000;
const EVENTS = new Set(["page_loaded", "page_hidden", "page_shown", "visibility_changed", "network_online", "network_offline",
  "ws_connect", "ws_open", "ws_timeout", "ws_error", "ws_close", "ws_send_failed", "server_connection", "match_welcome",
  "rejoin_missing", "reconnect_attempt", "reconnect_state", "reconnect_timeout", "match_finished", "browser_error"]);

export function createConnectionDiagnostics({ storage = () => sessionStorage, now = () => Date.now() } = {}) {
  let entries = null;
  let context = {};
  function read() {
    if (entries === null) {
      try {
        const saved = JSON.parse(storage().getItem(KEY));
        entries = Array.isArray(saved) ? saved.filter((e) => e && EVENTS.has(e.event) && Number.isFinite(e.at))
          .slice(-LIMIT).map((e) => ({ event: e.event, at: e.at, ...diagnosticFields(e) })) : [];
      } catch { entries = []; }
    }
    entries = entries.filter((e) => now() - e.at >= 0 && now() - e.at <= MAX_AGE);
    return entries;
  }
  return {
    context(fields) { context = diagnosticFields({ ...context, ...fields }); },
    record(event, fields = {}) {
      if (!EVENTS.has(event)) return;
      const rows = read();
      rows.push({ at: now(), event, ...context, ...diagnosticFields(fields) });
      entries = rows.slice(-LIMIT);
      try { storage().setItem(KEY, JSON.stringify(entries)); } catch { /* 診断保存失敗で対局を止めない */ }
    },
    report() { return read().map(({ at, ...e }) => `${new Date(at).toISOString()} ${JSON.stringify(e)}`).join("\n"); },
  };
}

export const connectionDiagnostics = createConnectionDiagnostics();

let installed = false;
export function installConnectionDiagnostics(build) {
  if (installed || typeof window === "undefined") return;
  installed = true;
  connectionDiagnostics.context({ pageId: crypto.randomUUID(), build });
  const environment = () => ({ networkOnline: navigator.onLine, visibility: document.visibilityState });
  connectionDiagnostics.record("page_loaded", environment());
  for (const [type, event] of [["online", "network_online"], ["offline", "network_offline"], ["pagehide", "page_hidden"], ["pageshow", "page_shown"]]) {
    window.addEventListener(type, (e) => connectionDiagnostics.record(event, { ...environment(), persisted: e.persisted }));
  }
  document.addEventListener("visibilitychange", () => connectionDiagnostics.record("visibility_changed", environment()));
  window.addEventListener("error", (e) => {
    if (e.error) connectionDiagnostics.record("browser_error", { ...environment(), ...diagnosticError(e.error) });
  });
  window.addEventListener("unhandledrejection", (e) => connectionDiagnostics.record("browser_error", {
    ...environment(), ...diagnosticError(e.reason),
  }));
}
