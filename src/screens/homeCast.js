// トップ（ホーム）の左右立ち絵 — 起動ごとにランダムな2キャラを“出迎え”として置く。
//
// 「トップがちょっと寂しい」を、相棒候補たちが両脇に立つ画で埋める。麻雀の外でも
// キャラが“居る”ことで愛着＝固有性に効かせる狙い（CLAUDE.md / 共在感）。
//   import { mountHomeCast } from "./screens/homeCast.js";
//   mountHomeCast(document.getElementById("home-screen"));
//
// 設計メモ:
//  - 1280×720 固定・中央メニュー(幅560px)とは被らせない。左右の各ガター(約360px)に収める
//    （fixed-stage-no-scroll / 「被らないように大きく」）。
//  - 立ち絵は全身画 graphic/chars/<id>/portrait.png を object-fit:contain で丸ごと見せる。
//  - 解禁前(locked)のキャラはネタバレ回避で出さない。母集団が薄ければ重複も許容する。
//  - 起動ごと＝ページロードごとに1回だけ抽選（bootHome から呼ぶ）。装飾なのでクリックは透過。
import { CHARACTERS } from "../characters/characters.js";
import { topCastTuneOf } from "../data/imagePos.js";

// 立ち絵に使える母集団（モブ除外・解禁前キャラ除外・portrait 画像を持つもの）。
function castPool() {
  return CHARACTERS.filter((c) => !c.isMob && !c.locked && c?.assets?.portrait);
}

// 重複なしで n 体を選ぶ（母集団が足りなければある分だけ）。
function pickDistinct(pool, n) {
  const arr = pool.slice();
  const out = [];
  while (arr.length && out.length < n) {
    const i = Math.floor(Math.random() * arr.length);
    out.push(arr.splice(i, 1)[0]);
  }
  return out;
}

// 1体ぶんの立ち絵ノード（読み込み失敗時はその枠ごと消す＝トップに崩れた絵を残さない）。
function figureNode(c, side) {
  const fig = document.createElement("div");
  fig.className = `home-cast-fig is-${side}`;
  const img = document.createElement("img");
  img.src = c.assets.portrait;
  img.alt = "";
  img.decoding = "async";
  img.loading = "eager";
  img.onerror = () => fig.remove();
  // キャラ別の大きさ/位置調整（offset-tuner「トップ立ち絵」→ imagePos.topCast）。
  // 底辺基準で scale＝足元を残して頭側へ伸ばす。枠(.home-cast-fig)で外側はクリップ。
  const t = topCastTuneOf(c);
  if (t) {
    img.style.transform = `translate(${t.x}, ${t.y}) scale(${t.zoom})`;
    img.style.transformOrigin = "bottom center";
  }
  fig.appendChild(img);
  return fig;
}

export function mountHomeCast(section) {
  if (!section) return;
  // 二重マウント防止（再ブートや HMR で重ならないよう、既存を作り直す）。
  section.querySelector(".home-cast")?.remove();

  const picks = pickDistinct(castPool(), 2);
  if (!picks.length) return;

  const cast = document.createElement("div");
  cast.className = "home-cast";
  cast.setAttribute("aria-hidden", "true");
  if (picks[0]) cast.appendChild(figureNode(picks[0], "left"));
  if (picks[1]) cast.appendChild(figureNode(picks[1], "right"));

  // メニューより背面に置きたいので先頭へ差し込む（z-index は CSS 側で確定）。
  section.insertBefore(cast, section.firstChild);
}
