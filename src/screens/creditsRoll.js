// スタッフロール — エピローグ（九蓮優勝後の最終章）を読み終えたあとに流れる。
//
// 物語を最後まで歩いた人への「締めの儀式」。キャストの最後に弟子（プレイヤーの名前）を
// 置くのは固有性ピラー（"私"がこの物語の登場人物だった、を一行で示す）。
// rAF でゆっくり縦スクロールし、クリックで倍速・スキップボタンで即終了できる。
import { CHARACTER_MASTER } from "../data/characterMaster.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SPEED = 46;        // px/秒（通常）
const FAST_MULT = 4;     // クリック押下中の倍速

export function showCreditsRoll(host, { deshiName = "", onDone = null } = {}) {
  const cast = CHARACTER_MASTER
    .map((c) => ({ name: c.name, reading: c.reading || "" }));
  const row = (k, v) => `<div class="cr-row"><span class="cr-k">${esc(k)}</span><span class="cr-v">${v}</span></div>`;
  const castRows = cast.map((c) =>
    row("", `${esc(c.name)}${c.reading ? `<small>${esc(c.reading)}</small>` : ""}`)).join("");

  const ov = document.createElement("div");
  ov.className = "credits-roll";
  ov.innerHTML = `
    <div class="cr-scrim"></div>
    <div class="cr-scroll">
      <div class="cr-title">九蓮宝士</div>
      <div class="cr-subtitle">— ツモれば、ふたりの勝ち —</div>

      <div class="cr-section">キャスト</div>
      ${castRows}
      ${row("", `${esc(deshiName || "弟子")}<small>そして——あなた</small>`)}

      <div class="cr-section">スタッフ</div>
      ${row("企画・原案・ディレクション", esc("乃木回遊"))}
      ${row("シナリオ・世界観", esc("乃木回遊"))}
      ${row("ゲームデザイン・開発", esc("乃木回遊"))}
      ${row("UI素材", esc("こぱんだ屋"))}
      ${row("開発協力", esc("Claude（Anthropic）"))}

      <div class="cr-section">Special Thanks</div>
      ${row("", esc("卓を囲んでくれた、すべての打ち手たちへ"))}

      <div class="cr-fin">Thank you for playing!</div>
      <div class="cr-lastline">「——ツモれば勝ち、ダヨ。<br>　また打とうネ、相棒。」</div>
    </div>
    <button type="button" class="cr-skip">スキップ ▶</button>
    <div class="cr-hint">クリックで早送り</div>`;
  host.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));

  const scroll = ov.querySelector(".cr-scroll");
  const stageH = host.clientHeight || 720;
  let y = stageH;                 // 画面下から登場
  let fast = false;
  let raf = null;
  let last = null;
  let done = false;

  const finish = () => {
    if (done) return; done = true;
    if (raf) cancelAnimationFrame(raf);
    ov.classList.remove("is-open");
    setTimeout(() => { ov.remove(); onDone?.(); }, 450);
  };
  const tick = (ts) => {
    if (last == null) last = ts;
    const dt = Math.min(100, ts - last); last = ts;
    y -= (SPEED * (fast ? FAST_MULT : 1) * dt) / 1000;
    scroll.style.transform = `translateY(${y}px)`;
    // 全文が抜けきったら少し置いて終了。
    if (y < -scroll.offsetHeight - 40) { setTimeout(finish, 600); return; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  ov.addEventListener("mousedown", () => { fast = true; });
  ov.addEventListener("mouseup", () => { fast = false; });
  ov.addEventListener("mouseleave", () => { fast = false; });
  ov.querySelector(".cr-skip").addEventListener("click", (e) => { e.stopPropagation(); finish(); });
}
