// テスト版の身元情報 — バージョン / 報告先 / 既知の制限を1箇所に集約する。
//
// なぜ要るか: テストプレイでは「どのビルドで踏んだ不具合か」が分からないと直せない。
// ビルド機構が無い（素の ESM）ので、バージョンはここを手で上げる運用にする。
// 修正を配ったら APP_VERSION の末尾を上げること（例: test.1 → test.2）。
//
//   import { APP_VERSION, versionLabel } from "./config/appInfo.js";

export const APP_VERSION = "0.9.0-test.1";
export const BUILD_DATE = "2026-09-08";

// 不具合・感想の受け皿（Googleフォーム / Discord 招待 / GitHub Issues など）。
// 送信先は Google フォーム「ツモノグリフ テストプレイ フィードバック」。空文字にすると
// 導線は「環境情報をコピー」だけに縮退する（壊れはしない）。
export const FEEDBACK_URL = "https://docs.google.com/forms/d/e/1FAIpQLSeP18R5mRn-TbYFhL4NVbQIboMGjtH4Ccr09bjirFkHqlJq2g/viewform";

// 報告先の呼び名（ボタン文言に出る）。FEEDBACK_URL を入れたらここも合わせる。
export const FEEDBACK_LABEL = "報告フォームを開く";

// 「バグではなく仕様（未実装）」の一覧。テスターが最初に踏むものだけを短く。
// docs/testplay-guide.md と同じ内容を、ゲーム内では要約で見せる。
// ※ここは1画面に収める都合で「最初に踏む4つ」だけ。全項目は docs/testplay-guide.md に。
export const KNOWN_LIMITS = [
  "一部のキャラ・師匠は「準備中」表示です（順に実装中）。",
  "楼光の館は第2章まで。その先は「未だ綴られぬ記憶」と出ます。",
  "タイトルロゴと楼光の館の一部グラフィックは仮素材（差し替え予定）。",
  "オンライン対戦は限定運用です（合言葉ルームでの対戦を推奨）。",
];

// 画面の隅に出す短いラベル。
export function versionLabel() {
  return `v${APP_VERSION}`;
}

// 不具合報告に貼り付けてもらう環境情報。個人を特定する情報は入れない
// （メールアドレスや表示名は載せず、「ログイン中かどうか」だけにする）。
export function buildEnvReport(extra = {}) {
  const nav = typeof navigator !== "undefined" ? navigator : {};
  const win = typeof window !== "undefined" ? window : {};
  const lines = [
    `version : ${APP_VERSION} (${BUILD_DATE})`,
    `time    : ${new Date().toISOString()}`,
    `url     : ${win.location?.href ?? "-"}`,
    `browser : ${nav.userAgent ?? "-"}`,
    `screen  : ${win.innerWidth ?? "?"}x${win.innerHeight ?? "?"} (dpr ${win.devicePixelRatio ?? "?"})`,
    `login   : ${extra.loggedIn ? "ログイン中" : "ローカル保存"}`,
    `save    : ${extra.saveSummary ?? "-"}`,
    `screenId: ${extra.screenId ?? "-"}`,
  ];
  const errs = recentErrors();
  if (errs.length) {
    lines.push("errors  :");
    for (const e of errs) lines.push(`  - ${e}`);
  }
  return lines.join("\n");
}

// index.html のインラインフックが積んだ直近エラー（新しい順に最大5件）を文字列化。
export function recentErrors(limit = 5) {
  const log = (typeof window !== "undefined" && window.__mjErrLog) || [];
  return log.slice(-limit).map((e) => `[${e.at}] ${e.kind}: ${e.message} @ ${e.where || "-"}`);
}
