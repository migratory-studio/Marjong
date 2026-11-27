// 固定ステージ内のダイアログ。呼び出し元の画面を一時停止し、閉じたら元の操作へ戻す。
export function focusDialog(dialog, { background, initial, cancel }) {
  const previous = document.activeElement;
  const wasInert = background?.inert;
  if (background) background.inert = true;
  const enabled = () => [...dialog.querySelectorAll("button:enabled,input:enabled,select:enabled,[tabindex='0']")]
    .filter(node => node.getClientRects().length && !node.closest("[hidden],[inert]"));
  function enter() {
    if (dialog.isConnected && !dialog.contains(document.activeElement)) {
      (initial || enabled()[0] || dialog).focus({ preventScroll: true });
    }
  }
  enter();
  const frame = requestAnimationFrame(enter);
  function onKey(event) {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); }
    if (event.key !== "Tab") return;
    const items = enabled();
    const idx = items.indexOf(document.activeElement);
    if (idx < 0 || (event.shiftKey ? idx === 0 : idx === items.length - 1)) {
      event.preventDefault();
      (event.shiftKey ? items.at(-1) : items[0])?.focus();
    }
  }
  dialog.addEventListener("keydown", onKey);
  return () => {
    cancelAnimationFrame(frame);
    dialog.removeEventListener("keydown", onKey);
    if (background) background.inert = wasInert;
    if (previous?.isConnected && !previous.closest("[inert],.hidden")) previous.focus({ preventScroll: true });
  };
}
