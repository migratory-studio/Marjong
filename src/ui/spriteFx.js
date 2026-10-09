// スプライトエフェクトの再生 — src/data/effectMaster.js の FX_SHEETS（アトラス）をコマ送りで描く。
//
// ・1つの requestAnimationFrame で全エフェクトのコマを進める。コマは「経過時間 × fps」で決める
//   ＝処理落ちしても尺は原本どおり（コマが飛ぶだけ）。
// ・1回ごとに要素を作り、最後のコマを過ぎたら消す（原本の APNG と同じ「1回だけ再生」）。
// ・進行は待たない。playFx は終わったら解決する Promise を返すが、呼び出し側は await しない＝
//   連戦のテンポを殺さない（docs/character-ingame-fx-plan.md の運用メモ）。
// ・先読みが間に合っていない初回は少しだけ待ち、それでも来なければその回は出さない（遅れて出るより良い）。
// ・host（位置の基準）ごと消されたエフェクトは、次のコマで黙って片付ける（カットインの撤収など）。
//
// デバッグ: window.__fxWire = true でアトラスを描かず枠と名前だけを出す（位置・尺の確認用）。
//          window.__fxLog に再生したエフェクトの記録が積まれる（直近 200 件）。
import { FX_SHEETS, FX_FRAME, FX_PAD, FX_CELL, FX_FPS, fxSheetUrl } from "../data/effectMaster.js";

const LATE_MS = 280; // 初回の読み込み待ちの上限

const sheets = new Map(); // id -> { img, ok: null|true|false, ready: Promise<boolean> }
function sheetOf(id) {
  let s = sheets.get(id);
  if (s) return s;
  if (!FX_SHEETS[id]) return null;
  const img = new Image();
  img.decoding = "async";
  try { img.fetchPriority = "low"; } catch {}
  s = { img, ok: null };
  s.ready = new Promise((resolve) => {
    img.onload = () => {
      const done = () => { s.ok = true; resolve(true); };
      if (img.decode) img.decode().then(done, done); else done();
    };
    img.onerror = () => { s.ok = false; resolve(false); };
  });
  img.src = fxSheetUrl(id);
  sheets.set(id, s);
  return s;
}

// アトラスを先読みする（対局の開始時に卓のぶんだけ）。読み込みは低優先度＝立ち絵やBGMの邪魔をしない。
export function preloadFx(ids) {
  for (const id of ids || []) sheetOf(id);
}

const running = new Set();
let rafId = 0;
const wire = () => typeof window !== "undefined" && !!window.__fxWire;

function logFx(entry) {
  if (typeof window === "undefined") return;
  const log = (window.__fxLog ||= []);
  log.push(entry);
  if (log.length > 200) log.splice(0, log.length - 200);
}

function place(fx, f) {
  const k = fx.size / FX_FRAME;
  const col = f % fx.cols, row = Math.floor(f / fx.cols);
  fx.el.style.backgroundPosition = `${-(col * FX_CELL + FX_PAD) * k}px ${-(row * FX_CELL + FX_PAD) * k}px`;
  if (fx.wire) fx.el.dataset.frame = String(f);
}

function tick(now) {
  for (const fx of running) {
    if (!fx.el.isConnected) { running.delete(fx); fx.resolve(false); continue; }
    const f = Math.floor(((now - fx.t0) / 1000) * fx.fps);
    if (f < 0) continue; // delay 中
    if (f >= fx.frames) { fx.el.remove(); running.delete(fx); fx.resolve(true); continue; }
    if (f !== fx.frame) {
      if (fx.frame < 0) fx.el.style.visibility = "";
      fx.frame = f;
      place(fx, f);
    }
  }
  rafId = running.size ? requestAnimationFrame(tick) : 0;
}

// アトラス id を host の中の (x, y) に1回再生する。
//   host  … 位置の基準の要素（position が static でないこと）。エフェクトはその子として足す
//   x / y … host の中の中心座標。数値は px、文字列はそのまま（"50%" など）
//   size  … 表示サイズ（px）。speed … 再生速度の倍率。delay … 開始を遅らせる ms
//   rotate（deg）/ flipX / opacity / z（z-index。"auto" で DOM 順の重なりに戻す）/ cls（追加のクラス）
//   before … host の子のうち、この要素の手前（＝奥側）に差し込む（立ち絵や文字の奥に置きたいとき）
export function playFx(id, { host, x = "50%", y = "50%", size = 160, speed = 1, delay = 0, rotate = 0, flipX = false, opacity = 1, z = null, before = null, cls = "", tag = "" } = {}) {
  const def = FX_SHEETS[id];
  const s = sheetOf(id);
  if (!def || !s || !host || !host.isConnected || s.ok === false) return Promise.resolve(false);
  const start = () => new Promise((resolve) => {
    if (!host.isConnected) { resolve(false); return; }
    const el = document.createElement("div");
    el.className = "sfx" + (cls ? ` ${cls}` : "");
    el.dataset.fx = id;
    const cols = def.frames / 4;
    const k = size / FX_FRAME;
    const fx = { el, t0: performance.now() + delay, fps: FX_FPS * speed, frames: def.frames, cols, size, frame: -1, wire: wire(), resolve };
    Object.assign(el.style, {
      left: typeof x === "number" ? `${x}px` : x,
      top: typeof y === "number" ? `${y}px` : y,
      width: `${size}px`,
      height: `${size}px`,
      backgroundImage: fx.wire ? "none" : `url("${s.img.src}")`,
      backgroundSize: `${cols * FX_CELL * k}px ${4 * FX_CELL * k}px`,
      transform: `translate(-50%, -50%)${rotate ? ` rotate(${rotate}deg)` : ""}${flipX ? " scaleX(-1)" : ""}`,
      visibility: "hidden", // 最初のコマを置くまで出さない（delay の間に1コマ目が見えないように）
    });
    if (opacity !== 1) el.style.opacity = String(opacity);
    if (z != null) el.style.zIndex = String(z);
    if (fx.wire) el.classList.add("sfx-wire");
    if (before && before.parentNode === host) host.insertBefore(el, before);
    else host.appendChild(el);
    running.add(fx);
    logFx({ id, tag, at: Math.round(performance.now()), host: host.id || String(host.className || "").split(" ")[0], x, y, size });
    if (!rafId) rafId = requestAnimationFrame(tick);
  });
  if (s.ok) return start();
  // 初回で先読みが間に合っていない：少しだけ待つ。
  return Promise.race([s.ready, new Promise((r) => setTimeout(() => r(null), LATE_MS))])
    .then((ok) => (ok === true ? start() : false));
}

// 再生中のエフェクトをすべて消す（対局を抜けるときなど）。
export function clearAllFx() {
  for (const fx of running) { fx.el.remove(); fx.resolve(false); }
  running.clear();
}
