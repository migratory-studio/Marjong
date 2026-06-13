// 同期競合モーダル — ログイン時にローカルとクラウド両方に弟子がいるとき表示。
//
// confirmModal.js の構造を踏襲。.confirm-overlay/.confirm-modal スキンを再利用。
//
//   import { showSyncConflict } from "./screens/syncConflictModal.js";
//   showSyncConflict({ localCount, cloudCount, onUseCloud, onMerge });

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

export function showSyncConflict({ localCount = 0, cloudCount = 0, onUseCloud, onMerge } = {}) {
  const host = document.getElementById("app") || document.body;
  const overlay = elt("div", "confirm-overlay");
  const close = () => overlay.remove();

  const modal = elt("div", "confirm-modal");
  modal.appendChild(elt("h2", "confirm-title", { textContent: "セーブデータの確認" }));

  // 本文（\n→br）
  const msg = elt("p", "confirm-msg");
  const lines = [
    `この端末には育てた弟子が ${localCount} 人、クラウドには ${cloudCount} 人います。`,
    "どちらで続けますか？",
  ];
  for (const [i, line] of lines.entries()) {
    if (i > 0) msg.appendChild(document.createElement("br"));
    msg.appendChild(document.createTextNode(line));
  }
  modal.appendChild(msg);

  // 注記（ボタンの上）
  const note = elt("p", "sync-conflict-note", {
    textContent: "※この端末の弟子は消えません。ログアウトすればまた会えます。",
  });
  modal.appendChild(note);

  const btns = elt("div", "confirm-btns");

  const useCloud = elt("button", "secondary", {
    type: "button",
    textContent: "クラウドのデータで続ける",
  });
  useCloud.onclick = () => { close(); onUseCloud?.(); };

  const merge = elt("button", "primary", {
    type: "button",
    textContent: "この端末の弟子も連れていく",
  });
  merge.onclick = () => { close(); onMerge?.(); };

  btns.appendChild(useCloud);
  btns.appendChild(merge);
  modal.appendChild(btns);

  overlay.appendChild(modal);
  host.appendChild(overlay);
  return close;
}
