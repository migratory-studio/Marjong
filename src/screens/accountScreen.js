// アカウント画面 — ログイン中のユーザー情報とログアウト導線を提供する。
//
// mentorEntryScreen.js のスタイル/elt パターンを踏襲。
// menu-head / menu-list / menu-btn / secondary / ghost-back の汎用クラスに乗せる。
// styles.css 末尾の .account-info 定義と組み合わせて動く。
//
//   import { showAccount } from "./screens/accountScreen.js";
//   showAccount(container, { user, profile, onLogout, onBack });

const STYLE_ID = "account-screen-style";

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
.account-info-row { display: flex; flex-direction: column; gap: 2px; }
.account-info-row + .account-info-row { margin-top: 12px; }
.account-info-label { font-size: 12px; color: var(--muted); }
.account-info-value { font-size: 15px; color: var(--ink); word-break: break-all; }
`;
  document.head.appendChild(s);
}

export function showAccount(container, { user, profile, onLogout, onBack } = {}) {
  injectStyle();
  container.innerHTML = "";

  // ---- 見出し ----
  const head = elt("header", "menu-head");
  head.appendChild(elt("h1", null, { textContent: "アカウント" }));
  head.appendChild(
    elt("p", "lead", { textContent: "クラウドに保存して、どの端末からでも続きを。" })
  );
  container.appendChild(head);

  // ---- 情報ブロック ----
  const info = elt("div", "account-info");
  const rows = [
    { label: "メールアドレス", value: user?.email ?? "—" },
    { label: "保存先", value: "クラウド（ログイン中）" },
    { label: "育てた弟子", value: `${(profile?.avatars || []).length} 人` },
    { label: "ソウル", value: `${profile?.wallet?.soul ?? 0}` },
  ];
  for (const { label, value } of rows) {
    const row = elt("div", "account-info-row");
    row.appendChild(elt("span", "account-info-label", { textContent: label }));
    row.appendChild(elt("span", "account-info-value", { textContent: value }));
    info.appendChild(row);
  }
  container.appendChild(info);

  // ---- ボタン群 ----
  const nav = elt("nav", "menu-list");

  const logout = elt("button", "secondary", { type: "button", textContent: "ログアウト" });
  logout.onclick = () => onLogout?.();
  nav.appendChild(logout);

  container.appendChild(nav);

  // ---- 戻る ----
  const back = elt("button", "ghost-back", { type: "button", textContent: "← 戻る" });
  back.onclick = () => onBack?.();
  container.appendChild(back);
}
