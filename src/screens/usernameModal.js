// ユーザーネーム入力モーダル (username) — 通信対戦の入場ゲートで使う。
//
// ログイン済でもユーザーネーム未設定の人に、最初に名前を入力してもらう。確定すると保存先
// （profile.profile.displayName）へ書く処理は呼び出し側（main.js）が onSubmit で行う。
// #app（固定ステージ）内にオーバーレイで重ねる。装飾は confirm-modal スキン＋ av-input。
//
//   import { showUsernameModal } from "./screens/usernameModal.js";
//   showUsernameModal({ initial, onSubmit:(name)=>{}, onCancel:()=>{} });

export const USERNAME_MIN = 1;
export const USERNAME_MAX = 12;

// 表記ゆれ・前後空白を整える（全角空白も除去）。表示用の最終形を返す。
export function normalizeUsername(raw) {
  return String(raw ?? "").replace(/[\s　]+/g, " ").trim();
}

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

export function showUsernameModal({ initial = "", onSubmit, onCancel } = {}) {
  const host = document.getElementById("app") || document.body;
  const overlay = elt("div", "confirm-overlay");
  const close = () => overlay.remove();

  const modal = elt("div", "confirm-modal username-modal");
  modal.appendChild(elt("h2", "confirm-title", { textContent: "ユーザーネームを決めよう" }));
  modal.appendChild(
    elt("p", "confirm-msg", {
      textContent: `通信対戦で表示される名前だよ（${USERNAME_MIN}〜${USERNAME_MAX}文字）。あとから変えられるよ。`,
    })
  );

  const input = elt("input", "av-input username-input", {
    type: "text",
    value: normalizeUsername(initial),
    maxLength: USERNAME_MAX,
    placeholder: "なまえ",
    autocomplete: "off",
  });
  modal.appendChild(input);

  const err = elt("p", "username-err", { textContent: "" });
  modal.appendChild(err);

  const btns = elt("div", "confirm-btns");
  const cancel = elt("button", "secondary", { type: "button", textContent: "やめる" });
  const ok = elt("button", "primary", { type: "button", textContent: "これにする" });
  btns.appendChild(cancel);
  btns.appendChild(ok);
  modal.appendChild(btns);

  const validate = () => {
    const name = normalizeUsername(input.value);
    if (name.length < USERNAME_MIN) return { ok: false, msg: "名前を入力してね" };
    if (name.length > USERNAME_MAX) return { ok: false, msg: `${USERNAME_MAX}文字までだよ` };
    return { ok: true, name };
  };

  const submit = () => {
    const v = validate();
    if (!v.ok) { err.textContent = v.msg; input.focus(); return; }
    close();
    onSubmit?.(v.name);
  };

  ok.onclick = submit;
  cancel.onclick = () => { close(); onCancel?.(); };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  input.addEventListener("input", () => { err.textContent = ""; });

  overlay.appendChild(modal);
  host.appendChild(overlay);
  // 入力欄へフォーカス（固定ステージのスケール後に効くよう次フレームで）。
  requestAnimationFrame(() => input.focus());
  return close;
}
