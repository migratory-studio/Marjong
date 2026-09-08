// 例外の受け皿（見せる側）— index.html のインラインフックが記録した例外を、
// 控えめなトーストにして「動かなくなった」を「報告できる」に変える。
//
// 方針:
//  - 進行は止めない。対局中に全画面モーダルを出すと体験のほうが壊れるので、
//    右下に小さく出して自動で引っ込む（報告ボタンだけ残す）。
//  - 画像/音声の読み込み失敗（kind:"asset"）は本体がフォールバック済み＝出さない。
//  - 同じセッションで出しすぎない（うるさいと、かえって報告されなくなる）。
//
//   import { initErrorGuard } from "./app/errorGuard.js";
//   initErrorGuard({ onReport: () => openSupport() });
const MAX_TOASTS = 3;   // 1セッションで出す上限
const DWELL_MS = 9000;  // 自動で引っ込むまで

let shown = 0;

export function initErrorGuard({ onReport } = {}) {
  if (typeof window === "undefined") return;

  const toast = (entry) => {
    if (entry.kind === "asset") return;      // 素材欠けは本体が吸収する
    if (shown >= MAX_TOASTS) return;
    shown += 1;
    const host = document.getElementById("app") || document.body;
    document.getElementById("err-toast")?.remove();

    const box = document.createElement("div");
    box.id = "err-toast";
    box.className = "err-toast";
    box.setAttribute("role", "status");
    box.innerHTML = `
      <div class="err-toast-h">⚠ エラーが発生しました</div>
      <div class="err-toast-m"></div>
      <div class="err-toast-btns">
        <button type="button" class="err-toast-report">報告する</button>
        <button type="button" class="err-toast-reload">再読み込み</button>
        <button type="button" class="err-toast-close" aria-label="閉じる">×</button>
      </div>`;
    // メッセージは textContent で入れる（例外文にHTMLが混ざっても壊れない）。
    box.querySelector(".err-toast-m").textContent = entry.message.slice(0, 120);
    box.querySelector(".err-toast-report").onclick = () => { box.remove(); onReport?.(); };
    box.querySelector(".err-toast-reload").onclick = () => location.reload();
    box.querySelector(".err-toast-close").onclick = () => box.remove();
    host.appendChild(box);
    // rAF ではなく setTimeout でフェードを始める。バックグラウンドのタブでは rAF が
    // 止まるため、戻ってきたときには自動消滅タイマー（setTimeout）だけが進んでいて
    // 「一度も見えないまま消えた」ことになる。
    setTimeout(() => box.classList.add("show"), 16);
    setTimeout(() => { box.classList.remove("show"); setTimeout(() => box.remove(), 400); }, DWELL_MS);
  };

  window.__mjOnError = toast;
  // 起動前（このモジュールが動くより先）に出ていた例外があれば、最後の1件だけ拾う。
  const log = window.__mjErrLog || [];
  if (log.length) toast(log[log.length - 1]);
}
