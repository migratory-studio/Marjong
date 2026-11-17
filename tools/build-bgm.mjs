// BGM の暗号化ビルド — 原本 mp3（追跡外）から、配信用の暗号化ファイル .bgm を作る。
//
//   node tools/build-bgm.mjs           … _assets-stock/bgm/**/*.mp3 → sound/bgm/**/*.bgm
//   node tools/build-bgm.mjs restore   … sound/bgm/**/*.bgm → _assets-stock/bgm/**/*.mp3（PC 移行時など）
//   node tools/build-bgm.mjs check     … sound/bgm/ に生の mp3 が残っていないか確認（あれば exit 1）
//
// 曲を足すとき: 原本を _assets-stock/bgm/（シナリオ用は _assets-stock/bgm/scenario/）に置いて
// このスクリプトを実行し、できた .bgm をコミットする。コードからは従来どおり
// sound/bgm/<name>.mp3 の名前で参照する（src/ui/bgmCrypt.js が .bgm に差し替えて復号する）。
// 生の mp3 は sound/bgm/ に置かない（Pages からそのまま落とせてしまう＝PeriTune 規約の趣旨に反する）。
//
// nonce は「パス＋内容」のハッシュから決める＝同じ原本なら毎回同じ出力（再ビルドで git 差分が出ない）。
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { decryptBgm, encryptBgm } from "../src/ui/bgmCrypt.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(root, "_assets-stock", "bgm");
const OUT = join(root, "sound", "bgm");

async function walk(dir, ext) {
  let ents;
  try { ents = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, ext)));
    else if (e.name.toLowerCase().endsWith(ext)) out.push(p);
  }
  return out;
}
const rel = (p, base) => relative(base, p).split("\\").join("/");

async function build() {
  const files = await walk(SRC, ".mp3");
  if (!files.length) {
    console.error(`原本が見つかりません: ${rel(SRC, root)}/ に mp3 を置いてください（restore で .bgm から戻せます）`);
    process.exit(1);
  }
  let wrote = 0, same = 0;
  for (const f of files) {
    const r = rel(f, SRC);
    const plain = await readFile(f);
    const nonce = createHash("sha256").update(r).update(plain).digest().subarray(0, 12);
    const enc = encryptBgm(new Uint8Array(plain), new Uint8Array(nonce));
    const dest = join(OUT, r.replace(/\.mp3$/i, ".bgm"));
    let prev = null;
    try { prev = await readFile(dest); } catch { /* new */ }
    if (prev && Buffer.compare(prev, Buffer.from(enc)) === 0) { same++; continue; }
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, enc);
    wrote++;
    console.log(`  + ${rel(dest, root)}`);
  }
  console.log(`BGM: ${wrote} 件を書き出し / ${same} 件は変更なし`);
  await check();
}

async function restore() {
  const files = await walk(OUT, ".bgm");
  for (const f of files) {
    const r = rel(f, OUT);
    const dest = join(SRC, r.replace(/\.bgm$/i, ".mp3"));
    const exists = await stat(dest).then(() => true, () => false);
    if (exists) { console.log(`  = ${rel(dest, root)}（既存・スキップ）`); continue; }
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, decryptBgm(new Uint8Array(await readFile(f))));
    console.log(`  + ${rel(dest, root)}`);
  }
  console.log(`BGM: ${files.length} 件を確認`);
}

async function check() {
  const raw = await walk(OUT, ".mp3");
  if (raw.length) {
    console.error("⚠️ sound/bgm/ に生の mp3 があります（配信すると直接ダウンロードできてしまう）:");
    for (const f of raw) console.error(`  - ${rel(f, root)}`);
    console.error(`原本は ${rel(SRC, root)}/ へ移し、node tools/build-bgm.mjs で .bgm を作ってください。`);
    process.exitCode = 1;
  } else {
    console.log("check: sound/bgm/ に生の mp3 はありません");
  }
}

const cmd = process.argv[2] || "build";
if (cmd === "build") await build();
else if (cmd === "restore") await restore();
else if (cmd === "check") await check();
else { console.error(`unknown command: ${cmd}（build | restore | check）`); process.exit(2); }
