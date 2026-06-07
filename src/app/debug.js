// デバッグモード判定 — URL クエリ ?debug=<合言葉> でのみ有効。
//
// 合言葉は DEBUG_KEY（詩玥の口癖「ツモれば勝ち」にちなむ）。debugstart.bat も
// 本番(GitHub Pages)も同じ ?debug=<合言葉> で起動する。クエリ無し or 値違いでは
// 常に false なので、公開URLを普通にたどってもデバッグ機能は出ない。値を知っている
// 人だけが開ける軽い目隠し（推測されにくい固定文字列）であって、強い認可ではない。
//
// サーバ(server.mjs)/Pages はクエリを無視して index.html を返すため配信側は無改修。
// SPA 内では location.search が保持され、reload でもクエリは残るので、一度の判定を
// セッション中キャッシュして使う。将来のデバッグメニュー等もこの判定を共通利用する。
const DEBUG_KEY = "tsumoreba";
let cached = null;

export function isDebugMode() {
  if (cached !== null) return cached;
  let on = false;
  try {
    const v = new URLSearchParams(globalThis.location?.search || "").get("debug");
    on = v === DEBUG_KEY;
  } catch {
    on = false;
  }
  cached = on;
  return on;
}
