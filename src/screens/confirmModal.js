// 汎用 確認モーダル (confirm) — 取り返しのつかない操作の前に挟む。
//
// 削除など破壊的操作で再利用する。#app（固定ステージ）内にオーバーレイで重ねる。
// 装飾は styles.css の購入UIセットスキン（.confirm-modal=panel枠 / button=btn枠）に乗せる。
//
//   import { showConfirm } from "./screens/confirmModal.js";
//   showConfirm({ title, message, confirmLabel, danger, onConfirm, onCancel });

import { focusDialog } from "../ui/dialogFocus.js";

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

export function showConfirm({
  title = "確認",
  message = "",
  confirmLabel = "OK",
  cancelLabel = "やめる",
  danger = false,
  background,
  onConfirm,
  onCancel,
} = {}) {
  const host = document.getElementById("app") || document.body;
  const overlay = elt("div", "confirm-overlay");
  let release;
  const close = () => { release?.(); overlay.remove(); };

  const modal = elt("div", "confirm-modal");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", title);
  modal.appendChild(elt("h2", "confirm-title", { textContent: title }));
  // message は改行を活かす（\n で段落）。
  const msg = elt("p", "confirm-msg");
  for (const [i, line] of String(message).split("\n").entries()) {
    if (i > 0) msg.appendChild(document.createElement("br"));
    msg.appendChild(document.createTextNode(line));
  }
  modal.appendChild(msg);

  const btns = elt("div", "confirm-btns");
  const cancel = elt("button", "secondary", { type: "button", textContent: cancelLabel });
  cancel.onclick = () => { close(); onCancel?.(); };
  const ok = elt("button", danger ? "primary danger" : "primary", { type: "button", textContent: confirmLabel });
  ok.onclick = () => { close(); onConfirm?.(); };
  btns.appendChild(cancel);
  btns.appendChild(ok);
  modal.appendChild(btns);

  overlay.appendChild(modal);
  host.appendChild(overlay);
  if (background) release = focusDialog(modal, { background, initial: cancel, cancel: () => cancel.click() });
  return close;
}
