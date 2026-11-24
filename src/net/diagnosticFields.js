// 診断には決めた項目だけを残す。手牌・Intent・token・URL・名前は取り込まない。
const IDS = ["pageId", "attemptId", "connectionId", "instanceId", "matchId"];
const NUMBERS = ["code", "readyState", "attempt", "aliveMs", "silenceMs", "lastSeq", "handNumber", "turn", "seat"];
const BOOLEANS = ["wasClean", "localClose", "networkOnline", "persisted", "rejoined"];
const ENUMS = {
  visibility: ["visible", "hidden", "prerender"],
  state: ["idle", "reconnecting", "connected", "failed"],
  reason: ["missing", "connection", "timeout", "empty", "other", "rejoin_missing", "replaced", "match_crashed"],
  phase: ["await-discard", "await-calls", "hand-over", "game-over"],
  lastEvent: ["welcome", "evt.connection", "evt.snapshot", "evt.rejoinFailed", "evt.gameOver", "evt.awaitDiscard", "evt.awaitCalls", "evt.turn", "evt.autoOn", "evt.autoOff", "handStarted", "tileDrawn", "tileDiscarded", "riichiDeclared", "meldCalled", "abilityUsed", "handWon", "handDrawn"],
  errorName: ["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError"],
};
export function diagnosticFields(fields = {}) {
  const out = {};
  for (const key of IDS) if (typeof fields[key] === "string" && /^[a-f0-9-]{36}$/i.test(fields[key])) out[key] = fields[key];
  for (const key of NUMBERS) if (Number.isFinite(fields[key])) out[key] = fields[key];
  for (const key of BOOLEANS) if (typeof fields[key] === "boolean") out[key] = fields[key];
  for (const [key, values] of Object.entries(ENUMS)) if (values.includes(fields[key])) out[key] = fields[key];
  if (typeof fields.build === "string" && /^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/i.test(fields.build)) out.build = fields.build;
  if (Array.isArray(fields.frames)) out.frames = fields.frames.filter((v) => /^[a-zA-Z0-9_.-]+\.m?js:\d+:\d+$/.test(v)).slice(0, 8);
  return out;
}

export function diagnosticError(error) {
  return diagnosticFields({ errorName: error?.name || "Error",
    // メッセージやフルパスは残さず、例外の位置だけ記録する。
    frames: String(error?.stack || "").split("\n").slice(1)
      .flatMap((line) => line.match(/[a-zA-Z0-9_.-]+\.m?js:\d+:\d+/g) || []),
  });
}

export function closeReason(reason) {
  return ["rejoin_missing", "replaced", "match_crashed"].includes(reason) ? reason : reason ? "other" : "empty";
}
