// 師のもとへ画面 (mentor-entry) — 師弟モードの入口。
//
// 「新しく弟子入りする」/「修行する（続きから）」の2択と、Googleログイン導線を提供する。
// 弟子が0体のときは「修行する」を無効化する。
// 見た目はホームと同じ汎用クラス（menu-head / menu-list / menu-btn / ghost-back）に乗せ、
// styles.css 末尾の購入UIセット(gameUIset_19)スキンを自動適用する。
//
//   import { showMentorEntry } from "./screens/mentorEntryScreen.js";
//   showMentorEntry(container, { profile, isLoggedIn, accountLabel, onCreate, onTrain, onLogin, onLogout, onBack });

const STYLE_ID = "mentor-entry-style";

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

// レイアウト専用の最小スタイル（色・枠・背景はスキン側に任せ、ここでは位置だけ）。
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
.mentor-entry-account { position:absolute; top:16px; right:22px; display:flex; flex-direction:column;
  align-items:flex-end; gap:6px; text-align:right; z-index:2; }
.mentor-entry-account .mentor-entry-label { font-size:13px; color:var(--accent); max-width:300px; word-break:break-all; }
.mentor-entry-account .mentor-entry-hint { font-size:11px; color:var(--muted); max-width:240px; }
.mentor-entry-account button { padding:4px 14px; font-size:13px; }
`;
  document.head.appendChild(s);
}

export function showMentorEntry(
  container,
  { profile, isLoggedIn, accountLabel, onCreate, onTrain, onLogin, onLogout, onAccount, onBack } = {}
) {
  injectStyle();
  container.innerHTML = "";

  const avatars = profile?.avatars || [];
  const hasAvatars = avatars.length > 0;

  // ---- 右上アカウント行（ログイン状態） ----
  const account = elt("div", "mentor-entry-account");
  if (isLoggedIn) {
    account.appendChild(elt("span", "mentor-entry-label", { textContent: accountLabel || "ログイン中" }));
    const acctBtn = elt("button", "secondary", { type: "button", textContent: "アカウント" });
    acctBtn.onclick = () => onAccount?.();
    account.appendChild(acctBtn);
  } else {
    const login = elt("button", "secondary", { type: "button", textContent: "Googleでログイン" });
    login.onclick = () => onLogin?.();
    account.appendChild(login);
    account.appendChild(
      elt("span", "mentor-entry-hint", { textContent: "ログインすると弟子データを別の端末でも引き継げます" })
    );
  }
  container.appendChild(account);

  // ---- 見出し ----
  const head = elt("header", "menu-head");
  head.appendChild(elt("h1", null, { textContent: "師のもとへ" }));
  head.appendChild(elt("p", "lead", { textContent: "弟子を育てる旅へ。" }));
  container.appendChild(head);

  // ---- 大きな2択（ホームのメニューボタンと同じ作り＝スキン適用） ----
  const nav = elt("nav", "menu-list");

  const create = elt("button", "menu-btn", { type: "button" });
  create.appendChild(elt("span", "menu-btn-title", { textContent: "新しく弟子入りする" }));
  create.appendChild(elt("span", "menu-btn-sub", { textContent: "新たな弟子を作り、物語をはじめる" }));
  create.onclick = () => onCreate?.();
  nav.appendChild(create);

  const train = elt("button", "menu-btn", { type: "button" });
  train.appendChild(elt("span", "menu-btn-title", { textContent: "修行する" }));
  train.appendChild(
    elt("span", "menu-btn-sub", {
      textContent: hasAvatars ? "育てた弟子の続きから（セーブデータ）" : "まだ弟子がいません",
    })
  );
  if (hasAvatars) {
    train.onclick = () => onTrain?.();
  } else {
    train.disabled = true;
  }
  nav.appendChild(train);

  container.appendChild(nav);

  // ---- 戻る ----
  const back = elt("button", "ghost-back", { type: "button", textContent: "← ホームへ" });
  back.onclick = () => onBack?.();
  container.appendChild(back);
}
