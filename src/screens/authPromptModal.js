// 認証おすすめモーダル (auth-prompt) — 初回起動時に「ログイン推奨」をやさしく説明する。
//
// ログインなしでも遊べるが、ローカルストレージ保存ゆえの引き継ぎ・消失リスクを正直に伝える。
// #app（スケールされた固定ステージ）内にオーバーレイで重ねる。装飾は styles.css の
// 購入UIセットスキン（.auth-modal=panel枠 / button.primary・secondary=btn枠）に乗せる。
//
//   import { showAuthPrompt } from "./screens/authPromptModal.js";
//   showAuthPrompt({ onLogin, onLocal });   // どちらを押しても自動で閉じる

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

export function showAuthPrompt({ onLogin, onLocal } = {}) {
  const host = document.getElementById("app") || document.body;
  const overlay = elt("div", "auth-modal-overlay");
  const close = () => overlay.remove();

  const modal = elt("div", "auth-modal");

  modal.appendChild(elt("h2", "auth-modal-title", { textContent: "ようこそ！" }));
  modal.appendChild(elt("p", "auth-modal-lead", { textContent: "はじめる前に、ひとつだけ。" }));

  // おすすめ（ログイン）
  modal.appendChild(
    elt("p", "auth-modal-rec", {
      textContent:
        "おすすめは Googleログイン。育てた弟子がクラウドに残るから、別の端末でも続きから打てるよ。",
    })
  );

  // ゆるいけど正直な注意書き（1画面に収めるため要点3つに圧縮・スクロール解消）。
  const warn = elt("div", "auth-modal-warn");
  warn.appendChild(elt("p", "auth-modal-warn-h", { textContent: "ログインなしでも遊べるけど…" }));
  const ul = elt("ul", "auth-modal-warn-list");
  for (const line of [
    "弟子データはこのブラウザだけに保存（履歴やキャッシュを消すと消えちゃう）",
    "別の端末には引き継げない",
    "あとからログインへ引っ越すのは少し手間",
  ]) {
    ul.appendChild(elt("li", null, { textContent: line }));
  }
  warn.appendChild(ul);
  modal.appendChild(warn);

  // ボタン
  const btns = elt("div", "auth-modal-btns");
  const login = elt("button", "primary", { type: "button", textContent: "Googleでログイン（おすすめ）" });
  login.onclick = () => { close(); onLogin?.(); };
  const local = elt("button", "secondary", { type: "button", textContent: "このまま遊ぶ（ローカル保存）" });
  local.onclick = () => { close(); onLocal?.(); };
  btns.appendChild(login);
  btns.appendChild(local);
  modal.appendChild(btns);

  overlay.appendChild(modal);
  host.appendChild(overlay);
  return close;
}
