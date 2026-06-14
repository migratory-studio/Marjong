// 合言葉入力モーダル — 通信対戦「合言葉で参加」の動線で使う。
//
// ホストが発行した合言葉（4文字・大文字英数）を入力して同じルームへ入る。確定すると onSubmit(code)
// を呼ぶ（呼び出し側 main.js が openOnlineLobby("room", { joinCode }) へ繋ぐ）。装飾は username
// モーダルと同じ confirm-modal スキン＋ av-input を流用する。
//
//   import { showRoomCodeModal } from "./screens/roomCodeModal.js";
//   showRoomCodeModal({ onSubmit:(code)=>{}, onCancel:()=>{} });

// 合言葉に使う文字（紛らわしい 0/O・1/I を除外）。onlineLobbyScreen.makeCode と一致させる。
export const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LEN = 4;

// 入力の正規化：大文字化し、許可文字以外を除去して最大長で切る。
export function normalizeRoomCode(raw) {
  const up = String(raw ?? "").toUpperCase();
  let s = "";
  for (const ch of up) if (ROOM_CODE_CHARS.includes(ch)) s += ch;
  return s.slice(0, ROOM_CODE_LEN);
}

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

export function showRoomCodeModal({ onSubmit, onCancel } = {}) {
  const host = document.getElementById("app") || document.body;
  const overlay = elt("div", "confirm-overlay");
  const close = () => overlay.remove();

  const modal = elt("div", "confirm-modal username-modal");
  modal.appendChild(elt("h2", "confirm-title", { textContent: "合言葉で参加" }));
  modal.appendChild(
    elt("p", "confirm-msg", { textContent: `相手がホストした合言葉（${ROOM_CODE_LEN}文字）を入力してね。` })
  );

  const input = elt("input", "av-input username-input room-code-input", {
    type: "text",
    value: "",
    maxLength: ROOM_CODE_LEN,
    placeholder: "ABCD",
    autocomplete: "off",
    autocapitalize: "characters",
    spellcheck: false,
  });
  modal.appendChild(input);

  const err = elt("p", "username-err", { textContent: "" });
  modal.appendChild(err);

  const btns = elt("div", "confirm-btns");
  const cancel = elt("button", "secondary", { type: "button", textContent: "やめる" });
  const ok = elt("button", "primary", { type: "button", textContent: "入室する" });
  btns.appendChild(cancel);
  btns.appendChild(ok);
  modal.appendChild(btns);

  const submit = () => {
    const code = normalizeRoomCode(input.value);
    if (code.length < ROOM_CODE_LEN) { err.textContent = `${ROOM_CODE_LEN}文字で入力してね`; input.focus(); return; }
    close();
    onSubmit?.(code);
  };

  ok.onclick = submit;
  cancel.onclick = () => { close(); onCancel?.(); };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  // 入力のたび許可文字へ正規化（大文字化・記号除去）。
  input.addEventListener("input", () => { input.value = normalizeRoomCode(input.value); err.textContent = ""; });

  overlay.appendChild(modal);
  host.appendChild(overlay);
  requestAnimationFrame(() => input.focus());
  return close;
}
