// 合言葉で私設卓に入る。発行側でも同じ文字集合を使う。
import { focusDialog } from "../ui/dialogFocus.js";

export const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LEN = 4;

// 入力の正規化：大文字化し、許可文字以外を除去して最大長で切る。
export function normalizeRoomCode(raw) {
  const up = String(raw ?? "").normalize("NFKC").toUpperCase();
  let s = "";
  for (const ch of up) if (ROOM_CODE_CHARS.includes(ch)) s += ch;
  return s.slice(0, ROOM_CODE_LEN);
}

export function showRoomCodeModal({ onSubmit, onCancel } = {}) {
  const host = document.getElementById("app") || document.body;
  const overlay = document.createElement("div");
  overlay.className = "confirm-overlay";
  overlay.innerHTML = `
    <form class="room-code-dialog" role="dialog" aria-modal="true" aria-labelledby="room-code-title">
      <h2 id="room-code-title">合言葉で参加</h2>
      <label for="room-code-value">招待された4文字の合言葉</label>
      <input id="room-code-value" class="room-code-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false"
        placeholder="ABCD" aria-describedby="room-code-message">
      <p id="room-code-message" role="status"></p>
      <div class="room-code-actions">
        <button type="button" class="mode-button">戻る</button>
        <button type="submit" class="mode-choice">待合室に入る</button>
      </div>
    </form>`;
  const modal = overlay.firstElementChild;
  const input = modal.querySelector("input");
  const message = modal.querySelector("[role=status]");
  host.append(overlay);
  const cancel = () => { close(); onCancel?.(); };
  const release = focusDialog(modal, { background: host.querySelector(".screen:not(.hidden)"), initial: input, cancel });
  function close() {
    if (!overlay.isConnected) return;
    release();
    overlay.remove();
  }
  const normalize = () => {
    input.value = normalizeRoomCode(input.value);
    input.removeAttribute("aria-invalid");
    message.textContent = "";
  };
  input.addEventListener("input", e => { if (!e.isComposing) normalize(); });
  input.addEventListener("compositionend", normalize);
  modal.onsubmit = event => {
    event.preventDefault();
    const code = normalizeRoomCode(input.value);
    if (code.length < ROOM_CODE_LEN) {
      input.setAttribute("aria-invalid", "true");
      message.textContent = "合言葉を4文字入力してください。";
      input.focus();
      return;
    }
    close();
    onSubmit?.(code);
  };
  modal.querySelector("[type=button]").onclick = cancel;
  overlay.onclick = event => { if (event.target === overlay) cancel(); };
  return close;
}
