// スタッフロール — エピローグ（九蓮優勝後の最終章）を読み終えたあとに流れる。
//
// 文言は creditsMaster.js（CREDITS_MASTER）が正典＝人や役職が増えたらマスタに足すだけ。
// キャストは CHARACTER_MASTER から自動生成し、最後に弟子（プレイヤーの名前）を置く
// ＝固有性ピラー（"私"がこの物語の登場人物だった、を一行で示す）。
// rAF でゆっくり縦スクロールし、クリックで倍速・スキップボタンで即終了できる。
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { CREDITS_MASTER } from "../data/creditsMaster.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SPEED = 46;        // px/秒（通常）
const FAST_MULT = 4;     // クリック押下中の倍速

export function showCreditsRoll(host, { deshiName = "", mentorId = null, onDone = null } = {}) {
  const M = CREDITS_MASTER;
  const row = (k, v) => `<div class="cr-row"><span class="cr-k">${esc(k)}</span><span class="cr-v">${v}</span></div>`;

  // キャスト＝キャラマスタ全員（読みつき）＋最後に弟子（あなた）。
  const castRows = CHARACTER_MASTER.map((c) =>
    row("", `${esc(c.name)}${c.reading ? `<small>${esc(c.reading)}</small>` : ""}`)).join("");
  // スタッフ等＝マスタの sections をそのまま並べる。
  const sectionsHtml = (M.sections || []).map((sec) => `
      <div class="cr-section">${esc(sec.heading)}</div>
      ${(sec.rows || []).map((r) => row(r.role || "", esc(r.name || ""))).join("")}`).join("");
  const lastLines = M.lastLineByMentor?.[mentorId] || M.lastLineDefault || [];

  const ov = document.createElement("div");
  ov.className = "credits-roll";
  ov.innerHTML = `
    <div class="cr-scrim"></div>
    <div class="cr-scroll">
      <div class="cr-title">${esc(M.title)}</div>
      <div class="cr-subtitle">${esc(M.subtitle)}</div>

      <div class="cr-section">キャスト</div>
      ${castRows}
      ${row("", `${esc(deshiName || "弟子")}<small>そして——あなた</small>`)}
      ${sectionsHtml}

      <div class="cr-fin">${esc(M.fin)}</div>
      <div class="cr-lastline">${lastLines.map((l) => esc(l)).join("<br>")}</div>
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
