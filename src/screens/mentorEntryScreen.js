// 師のもとへ画面 (mentor-entry) — 師弟モードの入口。
//
// 入門、前回の修行の再開、保存した記録の切替とアカウント連携の入口。
//
//   import { showMentorEntry } from "./screens/mentorEntryScreen.js";
//   showMentorEntry(container, { profile, isLoggedIn, accountLabel, onCreate, onTrain, onLogin, onLogout, onBack });

import { CHARACTER_MASTER } from "../data/characterMaster.js";

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

export function showMentorEntry(
  container,
  { profile, isLoggedIn, accountLabel, onCreate, onTrain, onResume, onLogin, onLogout, onAccount, onBack } = {}
) {
  container.innerHTML = "";

  const avatars = profile?.avatars || [];
  const hasAvatars = avatars.length > 0;
  const active = avatars.find((a) => a.avatarId === profile?.activeAvatarId);
  const mentor = CHARACTER_MASTER.find((c) => c.id === (active?.mentorCharacterId || "shiyue"));
  if (mentor?.assets?.portrait) {
    const figure = elt("figure", "mentor-welcome");
    figure.append(elt("img", null, { src: mentor.assets.portrait, alt: "" }),
      elt("figcaption", null, { textContent: `師匠　${mentor.name}` }));
    container.append(figure);
  }

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
  head.appendChild(elt("p", "lead", { textContent: "あなたが弟子になるサクセスストーリー" }));
  container.appendChild(head);

  // ---- 大きな2択（ホームのメニューボタンと同じ作り＝スキン適用） ----
  const nav = elt("nav", "menu-list");

  const create = elt("button", "menu-btn", { type: "button" });
  create.appendChild(elt("span", "menu-btn-title", { textContent: "新しく弟子入りする" }));
  create.appendChild(elt("span", "menu-btn-sub", { textContent: "自分の名前と姿を決め、師匠のもとへ" }));
  create.onclick = () => onCreate?.();
  nav.appendChild(create);

  const train = elt("button", "menu-btn", { type: "button" });
  train.appendChild(elt("span", "menu-btn-title", { textContent: "修行を続ける" }));
  train.appendChild(
    elt("span", "menu-btn-sub", {
      textContent: active && onResume ? `${active.name}　／　師匠　${mentor?.name || "—"}` : hasAvatars ? "修行の記録を選んで再開" : "弟子入りすると選べます",
    })
  );
  if (hasAvatars) {
    train.onclick = active && onResume ? () => onResume(active.avatarId) : () => onTrain?.();
  } else {
    train.disabled = true;
  }
  if (hasAvatars) nav.prepend(train); else nav.append(train);
  if (active && onResume) {
    const records = elt("button", "mode-button entry-records", { type: "button", textContent: "修行の記録を選ぶ" });
    records.onclick = () => onTrain?.();
    nav.append(records);
  }

  container.appendChild(nav);

  // ---- 戻る ----
  const back = elt("button", "ghost-back", { type: "button", textContent: "← ホームへ" });
  back.onclick = () => onBack?.();
  container.appendChild(back);
}
