// テスト版の窓口モーダル — 「これはバグ？」を「既知です」に変え、感想の返し先を示す。
//
// テストプレイでは、遊べることと同じくらい「返ってくること」が大事。ここが
// 唯一の受け皿になる（設定 → テスト版について / 不具合を報告、エラートーストの
// 「報告する」からも開く）。
//
//   import { showSupportModal, showResetConfirm } from "./screens/supportModal.js";
//   showSupportModal({ env: buildEnvReport({...}) });
import { APP_VERSION, BUILD_DATE, FEEDBACK_URL, FEEDBACK_LABEL, KNOWN_LIMITS } from "../config/appInfo.js";

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

// クリップボードへ。https/localhost 以外や許可なしの環境では textarea 経由で退避する。
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* 下のフォールバックへ */ }
  try {
    const ta = elt("textarea", null, { value: text });
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}

// テスト版の案内＋報告導線。env は buildEnvReport() の文字列（呼び出し側で組む）。
export function showSupportModal({ env = "", onReset } = {}) {
  const host = document.getElementById("app") || document.body;
  document.getElementById("support-modal-overlay")?.remove(); // 二重表示を防ぐ
  const overlay = elt("div", "auth-modal-overlay", { id: "support-modal-overlay" });
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  const modal = elt("div", "auth-modal sup-modal");
  modal.appendChild(elt("h2", "auth-modal-title", { textContent: "テスト版について" }));
  modal.appendChild(elt("p", "sup-ver", { textContent: `v${APP_VERSION}（${BUILD_DATE}）` }));
  modal.appendChild(
    elt("p", "auth-modal-lead", {
      textContent: "遊んでくれてありがとう。気づいたこと・詰まったところを、なんでも教えてください。",
    })
  );

  // 既知の未実装（＝報告しなくていいもの）。先に見せて報告の空振りを減らす。
  const known = elt("div", "auth-modal-warn");
  known.appendChild(elt("p", "auth-modal-warn-h", { textContent: "既知の未実装（バグではありません）" }));
  const ul = elt("ul", "auth-modal-warn-list");
  for (const line of KNOWN_LIMITS) ul.appendChild(elt("li", null, { textContent: line }));
  known.appendChild(ul);
  modal.appendChild(known);

  // 報告のしかた。URL 未設定でも「環境情報をコピー」だけで成立させる。
  const btns = elt("div", "auth-modal-btns");
  if (FEEDBACK_URL) {
    const open = elt("button", "primary", { type: "button", textContent: FEEDBACK_LABEL });
    open.onclick = () => window.open(FEEDBACK_URL, "_blank", "noopener");
    btns.appendChild(open);
  }
  const copy = elt("button", "secondary", { type: "button", textContent: "環境情報をコピー" });
  copy.onclick = async () => {
    const ok = await copyText(env);
    copy.textContent = ok ? "コピーしました" : "コピーできませんでした";
    setTimeout(() => { copy.textContent = "環境情報をコピー"; }, 1800);
  };
  btns.appendChild(copy);
  modal.appendChild(btns);

  modal.appendChild(
    elt("p", "sup-note", {
      textContent: FEEDBACK_URL
        ? "不具合の報告には、環境情報をコピーして貼り付けてもらえると助かります。"
        : "不具合の報告には、環境情報をコピーして、テスト案内に書かれた連絡先へ貼り付けてください。",
    })
  );

  // 環境情報の中身は隠さない（何を送るかが見えないと不安なので、そのまま見せる）。
  const det = elt("details", "sup-env");
  det.appendChild(elt("summary", null, { textContent: "コピーされる内容を見る" }));
  det.appendChild(elt("pre", "sup-env-pre", { textContent: env }));
  modal.appendChild(det);

  if (onReset) {
    const reset = elt("button", "sup-reset-link", { type: "button", textContent: "セーブデータを初期化する…" });
    reset.onclick = () => { close(); onReset(); };
    modal.appendChild(reset);
  }

  const back = elt("button", "sup-close", { type: "button", textContent: "閉じる" });
  back.onclick = close;
  modal.appendChild(back);

  overlay.appendChild(modal);
  host.appendChild(overlay);
  return close;
}

// セーブデータ初期化の確認。破壊操作なので「何が消えるか」を具体的に書く。
// loggedIn のときはクラウド側も消える＝取り返しがつかないことを明示する。
export function showResetConfirm({ loggedIn = false, onConfirm } = {}) {
  const host = document.getElementById("app") || document.body;
  document.getElementById("reset-modal-overlay")?.remove();
  const overlay = elt("div", "auth-modal-overlay", { id: "reset-modal-overlay" });
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  const modal = elt("div", "auth-modal sup-modal");
  modal.appendChild(elt("h2", "auth-modal-title", { textContent: "セーブデータを初期化" }));
  modal.appendChild(elt("p", "auth-modal-lead", { textContent: "この操作は元に戻せません。" }));

  const warn = elt("div", "auth-modal-warn");
  warn.appendChild(elt("p", "auth-modal-warn-h", { textContent: "消えるもの" }));
  const ul = elt("ul", "auth-modal-warn-list");
  for (const line of [
    "育てた弟子・修行の進行・シナリオの既読",
    "相棒との絆・対局の履歴・宝珠と解禁したもの",
    "楼光の館の中断中のラン",
    loggedIn ? "クラウド（ログイン中のアカウント）に保存されたデータも消えます" : "この端末（ブラウザ）に保存されたデータ",
  ]) ul.appendChild(elt("li", null, { textContent: line }));
  warn.appendChild(ul);
  modal.appendChild(warn);

  const btns = elt("div", "auth-modal-btns");
  const go = elt("button", "primary sup-danger", { type: "button", textContent: "初期化して最初から" });
  go.onclick = () => { close(); onConfirm?.(); };
  const cancel = elt("button", "secondary", { type: "button", textContent: "やめる" });
  cancel.onclick = close;
  btns.appendChild(go);
  btns.appendChild(cancel);
  modal.appendChild(btns);

  overlay.appendChild(modal);
  host.appendChild(overlay);
  return close;
}
