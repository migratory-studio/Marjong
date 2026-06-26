// キャラ画像の「用途別オフセット」解決ロジック（マスタドリブン）。
//
// 1枚のソース画像（icon.png / portrait.png）を、画面の用途ごとに違う枠で切り抜く。
// 同じ立ち絵でも「立ち絵カード」「対戦ホームの拡大バストアップ」では収まりが変わるため、
// 用途別に基準点（object-position）や寄せ/拡大を持てるようにする。
//
// データは characterMaster の各キャラ `imagePos`（任意）に置く：
//   imagePos: {
//     portrait: "50% 0%",                 // 立ち絵カバー切り抜き（object-position）。
//     icon:     "50% 12%",                // icon.png の顔切り抜き（object-position）。
//     home:     { x: "12%", y: "0%", zoom: 1.1 }, // 対戦ホーム拡大（translate%＋zoom）。
//   }
// すべて任意。未設定は安全に既定へフォールバックするので、1キャラだけ・1用途だけの調整でよい。
// 値の調整は開発ツール（tools/offset-tuner.html）でグラフィカルに行い、出力を貼り戻す運用。
//
// 後方互換：旧 `portraitPos`（単一の object-position）は portrait 用途の既定として温存する。
import { CHARACTER_MASTER } from "./characterMaster.js";

const DEFAULT_OBJPOS = "top center";

// 立ち絵カバー（mentor select / match intro / 詳細 / roguelite 等）の object-position。
//   imagePos.portrait → 旧 portraitPos → 既定 "top center" の順。
export function portraitPosOf(c) {
  return c?.imagePos?.portrait || c?.portraitPos || DEFAULT_OBJPOS;
}

// 立ち絵カバーのズーム（拡大率）。imagePos.portraitZoom（任意）。既定 1（無拡大）。
//   cover 画像を transform:scale で寄る／引く。クリップ容器（overflow:hidden の枠）内でだけ使う。
export function portraitZoomOf(c) {
  const z = Number(c?.imagePos?.portraitZoom);
  return z > 0 ? z : 1;
}

// 立ち絵 <img> に object-position＋ズームをまとめて適用するヘルパ（cover枠の中で使う）。
//   ※ object-fit:contain の紙芝居立ち絵には使わない（あちらは別系統）。
export function applyPortraitCrop(img, c) {
  if (!img) return;
  img.style.objectPosition = portraitPosOf(c);
  const z = portraitZoomOf(c);
  if (z !== 1) { img.style.transform = `scale(${z})`; img.style.transformOrigin = "center"; }
  else { img.style.transform = ""; }
}

// icon.png の顔アイコンの object-position（rl顔 / HPボード / autobattle席 など全アイコン共通）。
//   imagePos.icon → 既定 "top center"。立ち絵とは別ソース画像なので portraitPos へはフォールバックしない。
export function iconPosOf(c) {
  return c?.imagePos?.icon || DEFAULT_OBJPOS;
}

// テンプレ文字列(innerHTML)用の立ち絵 style 値（object-position[＋scale]）。
//   zoom:false でズームを外す（クリップ容器が無いカバー枠＝楼光アート等で transform はみ出しを避ける）。
export function portraitStyleAttr(c, { zoom = true } = {}) {
  let s = `object-position:${portraitPosOf(c)}`;
  if (zoom) { const z = portraitZoomOf(c); if (z !== 1) s += `;transform:scale(${z})`; }
  return s;
}

// 紙芝居立ち絵(contain・全身)の見せ方チューニング = 拡大/寄せ（バストアップ化の足場）。
//   imagePos.scenario = { x, y, zoom }（translate%＋scale）。未設定/既定は空文字（無変形）。
//   scenarioPlayer が img の CSS変数 --sc-tune にこの transform を流し込み、active/dim と合成する。
export function scenarioTuneOf(c) {
  const t = c?.imagePos?.scenario;
  if (!t) return "";
  const x = t.x || "0%", y = t.y || "0%", z = (t.zoom != null ? Number(t.zoom) : 1);
  const off = (x === "0%" || !t.x) && (y === "0%" || !t.y);
  if (off && z === 1) return "";
  return `translate(${x}, ${y}) scale(${z})`;
}

// 対戦ホーム拡大（バストアップ）の寄せ/拡大 { x, y, zoom }。
//   imagePos.home が中身を持てばそれを、無ければ呼び出し側の既定(fallback)を使う。
export function homeTuneOf(c, fallback = {}) {
  const t = c?.imagePos?.home;
  if (t && (t.x || t.y || t.zoom)) return t;
  return fallback || {};
}

// icon.png のオフセットを「src 末尾一致」で全アイコン表示箇所へ一括適用する CSS を生成する。
// 各アイコンは src="graphic/chars/<id>/icon.png" を共有するので、用途ごとに配線を足さなくても、
// この1枚の <style> でまとめて効く（rl顔・HPボード・autobattle席・mentor home の小顔…）。
// 立ち絵(portrait)はシナリオ毎の表情上書き等でインライン制御が要るため、ここでは扱わない。
//   ※ #app スコープでセレクタ特異度を上げ、CSS 側の `top center` 既定を確実に上書きする。
export function buildIconPosCss(characters = CHARACTER_MASTER) {
  const rules = [];
  for (const c of characters) {
    const pos = c?.imagePos?.icon;
    const icon = c?.assets?.icon;
    if (!pos || !icon) continue;
    rules.push(`#app img[src$="${icon}"]{object-position:${pos};}`);
  }
  return rules.join("\n");
}

// 生成した icon オフセット CSS を <style id="char-imagepos"> として head に注入（再呼び出しで更新）。
export function installIconPosStyles(characters = CHARACTER_MASTER, doc = (typeof document !== "undefined" ? document : null)) {
  if (!doc) return;
  let el = doc.getElementById("char-imagepos");
  if (!el) {
    el = doc.createElement("style");
    el.id = "char-imagepos";
    doc.head.appendChild(el);
  }
  el.textContent = buildIconPosCss(characters);
}
