// デバッグモード判定 — debugstart.bat 経由の起動でのみ有効。
//
// debugstart.bat はブラウザを http://localhost:5173/?debug=1 で開く。本モジュールは
// その URL クエリ ?debug=1 を見てデバッグモードを判定する。GitHub Pages の通常リンク
// （クエリ無し）では常に false なので、公開版にデバッグ機能は出ない。
//
// サーバ(server.mjs)はクエリを無視して index.html を返すため、サーバ側は無改修。
// SPA 内では location.search が保持され、reload でもクエリは残るので、一度の判定を
// セッション中キャッシュして使う。将来のデバッグメニュー等もこの判定を共通利用する。
let cached = null;

export function isDebugMode() {
  if (cached !== null) return cached;
  let on = false;
  try {
    const v = new URLSearchParams(globalThis.location?.search || "").get("debug");
    on = v === "1" || v === "true";
  } catch {
    on = false;
  }
  cached = on;
  return on;
}
