// スプライトエフェクト（購入素材）の台帳と選定表の回帰テスト（DOM不要）。
// Run: node test/spritefx.mjs
//
// 選定表は src/data/effectMaster.js、理由は docs/sprite-effects.md。ここでは次を機械的に守る:
//   - 台帳の形（縦4コマ＝frames は 4 の倍数）と、書き出し済みのアトラスが揃っていること
//   - キューが存在する種類・色を指していること（固定色が黙って別の色へ寄らない）
//   - キャラを足したときに演出が抜けないこと：
//       手動能力 → 発動の絵（cast。null＝出さない、と明示してあれば可）
//       和了点を動かす能力（scoreFxLabel） → 和了画面の点数に重ねる絵（scoreUp / scoreDown）
//       守り（guardLabel）／呪い（curseLabel） → ダメージカードの行に重ねる絵（guard / curse）
//   - 全キャラの色が、和了・リーチの色違い（衝撃・ショックウェーブ）に解決できること
//   - 先読み（fxSheetsForTable）が実在のアトラスだけを返し、めったに出ない演出（lazy）は含めないこと
import { existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FX_TYPES, FX_SHEETS, FX_CUES, ABILITY_FX, FX_CELL, colorKeyOf, fxSheetId, cueSheetId, fxSheetsForTable } from "../src/data/effectMaster.js";
import { ABILITY_MASTER, abilityDef } from "../src/data/abilityMaster.js";
import { CHARACTER_MASTER } from "../src/data/characterMaster.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond) => { console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); if (!cond) fails++; };

// ── 台帳の形 ──
for (const [kind, t] of Object.entries(FX_TYPES)) {
  ok(`${kind}: コマ数 ${t.frames} は縦4コマで割り切れる`, Number.isInteger(t.frames / 4) && t.frames > 0);
  ok(`${kind}: 色違いが1つ以上`, Object.keys(t.variants).length > 0);
}

// ── アトラスの実在（書き出し忘れ／消し忘れ）──
const fxDir = join(ROOT, "graphic", "fx");
for (const id of Object.keys(FX_SHEETS)) {
  const p = join(fxDir, `${id}.avif`);
  ok(`${id}.avif が書き出されている`, existsSync(p) && statSync(p).size > 0);
}
const onDisk = existsSync(fxDir) ? readdirSync(fxDir).filter((f) => f.endsWith(".avif")).map((f) => f.slice(0, -5)) : [];
const stale = onDisk.filter((id) => !FX_SHEETS[id]);
ok(`台帳に無いアトラスが残っていない${stale.length ? `（${stale.join(", ")}）` : ""}`, stale.length === 0);

// アトラスの寸法（sharp があれば）：横 frames/4 マス × 縦 4 マス、1マス FX_CELL px
let sharp = null;
try { sharp = (await import("sharp")).default; } catch {}
if (sharp) {
  for (const [id, s] of Object.entries(FX_SHEETS)) {
    const m = await sharp(join(fxDir, `${id}.avif`)).metadata();
    ok(`${id}: ${s.frames / 4 * FX_CELL}x${4 * FX_CELL}・透過あり`, m.width === (s.frames / 4) * FX_CELL && m.height === 4 * FX_CELL && m.hasAlpha);
  }
}

// ── キューの参照先 ──
const checkCue = (label, cue) => {
  if (cue === null) return; // 明示的に「出さない」
  ok(`${label}: 種類 ${cue?.fx} が台帳にある`, !!FX_TYPES[cue?.fx]);
  if (!FX_TYPES[cue?.fx]) return;
  const c = cue.color || "";
  if (!c.startsWith("@")) ok(`${label}: 固定色 ${c} の色違いが載っている`, FX_TYPES[cue.fx].variants[c] != null);
  ok(`${label}: 大きさ ${cue.size}px が 60〜700 の範囲`, cue.size >= 60 && cue.size <= 700);
};
for (const [k, cue] of Object.entries(FX_CUES)) checkCue(`共通 ${k}`, cue);
for (const [id, set] of Object.entries(ABILITY_FX)) {
  ok(`${id}: 能力マスタに実在する`, !!ABILITY_MASTER[id]);
  for (const [k, cue] of Object.entries(set)) checkCue(`${abilityDef(id).name} ${k}`, cue);
}

// ── キャラを足しても演出が抜けない ──
const usedAbilities = new Set(CHARACTER_MASTER.flatMap((c) => (c.abilities || []).map((a) => a.abilityId)));
for (const id of usedAbilities) {
  const def = abilityDef(id);
  const set = ABILITY_FX[id];
  if (def.activation === "manual") ok(`${def.name}: 発動の絵がある（または null で明示）`, !!set && Object.prototype.hasOwnProperty.call(set, "cast"));
  if (def.scoreFxLabel?.up) ok(`${def.name}: 和了画面で点数が増える一行に絵がある`, !!set?.scoreUp);
  if (def.scoreFxLabel?.down) ok(`${def.name}: 和了画面で点数が減る一行に絵がある`, !!set?.scoreDown);
  if (def.guardLabel) ok(`${def.name}: 守り切った行に絵がある`, !!set?.guard);
  if (def.curseLabel) ok(`${def.name}: 呪われた行に絵がある`, !!set?.curse);
}

// ── キャラの色 ──
for (const c of CHARACTER_MASTER) {
  const key = colorKeyOf(c.color);
  ok(`${c.name}（${c.color}）→ ${key}: ロンの衝撃は自分の色そのもの`, fxSheetId("impact", key) === `impact-${key}`);
  ok(`${c.name}: ツモ・リーチの波紋が引ける`, !!FX_SHEETS[cueSheetId(FX_CUES.tsumoWave, { winner: c })]);
}
ok("灰色（彩度の低い色）は白に寄る", colorKeyOf("#7f8c99") === "white" && colorKeyOf("#5b6b78") === "white");
ok("色が読めないときも白で落ちる", colorKeyOf("") === "white" && colorKeyOf("rebeccapurple") === "white");

// ── 先読み ──
const pre = fxSheetsForTable(CHARACTER_MASTER);
ok("先読みは実在のアトラスだけ", pre.every((id) => !!FX_SHEETS[id]));
const lazyIds = Object.values(FX_CUES).filter((cue) => cue.lazy).map((cue) => cueSheetId(cue));
const lazyOnly = lazyIds.filter((id) => !Object.values(FX_CUES).some((cue) => !cue.lazy && !cue.color?.startsWith("@") && cueSheetId(cue) === id));
ok(`めったに出ない演出（${lazyOnly.join(", ")}）は先読みしない`, lazyOnly.every((id) => !fxSheetsForTable([]).includes(id)));
const one = fxSheetsForTable([CHARACTER_MASTER.find((c) => c.id === "shiyue")]);
ok("詩玥の卓：赤の衝撃・赤の波紋・攻撃力アップ（赤）を先読みする", ["impact-red", "wave-red", "atkup-red"].every((id) => one.includes(id)));

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
