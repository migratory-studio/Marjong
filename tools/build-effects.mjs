// スプライトエフェクトのビルド（購入素材 → ゲーム用アトラス）。
//
//   node tools/build-effects.mjs          … effectMaster の FX_SHEETS をすべて graphic/fx/<id>.avif に書き出す
//   node tools/build-effects.mjs survey   … 原本の全色違いの「色の名前」を一覧にする（色違いの選び直し用）
//
// 原本は _assets-stock/effects/kuusou-kyokusen_gameeffect01_192/（.gitignore＝リポジトリには載せない）。
// 素材：空想曲線（こぱんだ）「ゲームエフェクト素材 01」192px 版。規約 https://kopacurve.blog.fc2.com/blog-entry-394.html
//   - 素材をそのままの状態で配布するのは禁止 → 原本の連番PNGは追跡しない。ゲームに載せるのは
//     使う色違いだけを1枚のアトラス（AVIF）に組み直したもの。
//   - 生成AI・機械学習での学習／解析への使用は禁止 → 画像を AI に見せて選ぶことはしない。
//     色違いの見分けは survey（画素の色相を数えるだけの決まった計算）で行い、選定は名前・コマ数と
//     この一覧から決める（docs/sprite-effects.md）。
//
// アトラスの並び: 1マス FX_CELL px（192px のコマ＋まわりに FX_PAD px の透明な余白）を左上から
// 横 cols 列 × 縦 4 行（原本のスプライトシートと同じ「縦4コマ」）。cols = frames / 4。
// 余白は、表示で拡縮したときに隣のコマの端が滲み込まないため。再生側（src/ui/spriteFx.js）は同じ規則で切り出す。
// 形式は AVIF（品質60）。同じ見た目の比較で パレットPNG の約半分・WebP よりも小さく、
// 暗い卓に重ねたときの誤差（PSNR）は 40dB 前後＝見た目ではほぼ区別がつかない。
import sharp from "sharp";
import { readdir, mkdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STOCK = join(ROOT, "_assets-stock", "effects", "kuusou-kyokusen_gameeffect01_192", "03_sequential_PNG_files");
const OUT = join(ROOT, "graphic", "fx");

// 原本の「種類」フォルダ（例: "07 連番png_打撃_シングル"）を番号から引く。
async function typeDir(typeNo) {
  const names = await readdir(STOCK);
  const hit = names.find((n) => n.startsWith(String(typeNo).padStart(2, "0") + " "));
  if (!hit) throw new Error(`原本に種類 ${typeNo} が無い（${STOCK}）`);
  return join(STOCK, hit);
}
const variantDir = async (typeNo, variant) =>
  join(await typeDir(typeNo), `${String(typeNo).padStart(2, "0")}_${String(variant).padStart(2, "0")}`);

async function framesOf(dir) {
  return (await readdir(dir)).filter((n) => /^\d+\.png$/.test(n)).sort((a, b) => parseInt(a) - parseInt(b));
}

// ---- survey: 色違いの色の名前 ------------------------------------------------
// 不透明かつ彩度のある画素の色相を、不透明度で重み付けして数える（白い芯・黒い縁は数えない）。
// 返すのは「いちばん多い色相帯」とその占有率、色のついた画素の割合、平均の明るさ。
const HUE_NAMES = [
  [15, "赤"], [40, "橙"], [70, "黄"], [100, "黄緑"], [160, "緑"], [200, "水色"], [250, "青"], [290, "紫"], [345, "桃"], [360, "赤"],
];
const hueName = (h) => HUE_NAMES.find(([max]) => h < max)[1];
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}
async function surveyVariant(dir) {
  const files = await framesOf(dir);
  const bins = new Map(); // 色名 → 重み
  let colored = 0, total = 0, light = 0;
  for (let fi = 0; fi < files.length; fi += 2) {
    const { data, info } = await sharp(join(dir, files[fi])).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let p = 0; p < info.width * info.height; p += 3) {
      const o = p * 4, a = data[o + 3] / 255;
      if (a < 0.15) continue;
      const [h, s, l] = rgbToHsl(data[o], data[o + 1], data[o + 2]);
      total += a; light += l * a;
      if (s < 0.25 || l > 0.92 || l < 0.08) continue;
      colored += a;
      const n = hueName(h);
      bins.set(n, (bins.get(n) || 0) + a);
    }
  }
  const ranked = [...bins.entries()].sort((x, y) => y[1] - x[1]);
  const [top, w] = ranked[0] || ["—", 0];
  const second = ranked[1];
  return {
    name: colored / Math.max(1, total) < 0.18 ? (light / Math.max(1, total) > 0.6 ? "白" : "無彩") : top,
    share: w / Math.max(1, colored),
    sub: second && second[1] / Math.max(1, colored) > 0.2 ? second[0] : "",
    coloredFrac: colored / Math.max(1, total),
    lightness: light / Math.max(1, total),
  };
}
async function survey() {
  const types = (await readdir(STOCK)).sort();
  for (const t of types) {
    const typeNo = parseInt(t);
    const vs = (await readdir(join(STOCK, t))).sort();
    const parts = [];
    for (const v of vs) {
      const r = await surveyVariant(join(STOCK, t, v));
      parts.push(`${v.split("_")[1]}=${r.name}${r.sub ? "/" + r.sub : ""}(${Math.round(r.coloredFrac * 100)}%,L${Math.round(r.lightness * 100)})`);
    }
    console.log(`${String(typeNo).padStart(2, "0")} ${t.replace(/^\d+ 連番png_/, "").padEnd(14, "　")} ${parts.join("  ")}`);
  }
}

// ---- build: アトラスの書き出し ----------------------------------------------
async function buildSheet(id, sheet) {
  const dir = await variantDir(sheet.type, sheet.variant);
  const files = await framesOf(dir);
  if (files.length !== sheet.frames) throw new Error(`${id}: コマ数が台帳(${sheet.frames})と原本(${files.length})で違う`);
  const cols = sheet.frames / 4;
  if (!Number.isInteger(cols)) throw new Error(`${id}: frames は 4 の倍数にすること（縦4コマ）`);
  const { FX_FRAME, FX_PAD, FX_CELL } = FX;
  for (const f of files) {
    const m = await sharp(join(dir, f)).metadata();
    if (m.width !== FX_FRAME || m.height !== FX_FRAME) throw new Error(`${id}/${f}: ${m.width}x${m.height}（${FX_FRAME}px のはず）`);
  }
  const composites = files.map((f, i) => ({ input: join(dir, f), left: (i % cols) * FX_CELL + FX_PAD, top: Math.floor(i / cols) * FX_CELL + FX_PAD }));
  const out = join(OUT, `${id}.avif`);
  // composite と avif を1本のパイプラインにすると合成前の下地が符号化されることがあるので、一度 PNG に落とす。
  const atlas = await sharp({ create: { width: cols * FX_CELL, height: 4 * FX_CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites).png().toBuffer();
  await sharp(atlas).avif({ quality: 60, effort: 6 }).toFile(out);
  return (await stat(out)).size;
}
let FX = null; // src/data/effectMaster.js（ビルド時に読む）
async function build() {
  FX = await import(pathToFileURL(join(ROOT, "src", "data", "effectMaster.js")).href);
  const { FX_SHEETS } = FX;
  await mkdir(OUT, { recursive: true });
  let sum = 0;
  for (const [id, sheet] of Object.entries(FX_SHEETS)) {
    const size = await buildSheet(id, sheet);
    sum += size;
    console.log(`${id.padEnd(18)} ${String(sheet.type).padStart(2, "0")}_${String(sheet.variant).padStart(2, "0")} ${sheet.frames}f  ${(size / 1024).toFixed(0)}KB`);
  }
  console.log(`合計 ${(sum / 1024).toFixed(0)}KB / ${Object.keys(FX_SHEETS).length} 枚 → graphic/fx/`);
}

const cmd = process.argv[2] || "build";
if (cmd === "survey") await survey();
else await build();
