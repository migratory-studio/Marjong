// 楼光の館：バイオーム（"層"）マスタ — docs/shitei-calendar-and-roguelite.md「B. ローグライト」。
//
// 10階＝1層。塔の景色（背景）と固有モディファイアが帯ごとに変わる（楼光＝記憶を映す塔）。
// 完全マスタ駆動＝層は1エントリ追記で増やせる。モディファイアは run.js / main.js の既存ノブに掛けるだけ:
//   dmgTakenMul … 味方の被ダメ深度倍率(fdm)に乗る（>1=重い / <1=軽い）
//   dmgDealMul  … 味方の与ダメ深度(deal)に乗る（>1=攻め映え）
//   coinMul     … 踏破光貨に乗る
//   regenMul    … 踏破時の部分回復量に乗る
//   enemyLvAdd  … 敵Lvの底上げ/底下げ（強敵化/弱体）
//   draftBias   … ドラフトのレア度バイアス加算（0〜1）
//   hpMul       … その帯の対局中の味方HP上限に乗る（奈落＝半分。run.party.hpMax は不変＝抜ければ回復で戻る）
// 出現制御:
//   weight  … 抽選の重み（既定1）。minBand … この帯番号以降でしか出ない（影響大の層を深層限定に）。
//   帯0(F1-10)は必ず中立「平穏の廃墟」。通常(中立)層は帯1以降も確率で当選するが、深いほど出にくい。
// 任意 bgm … 層BGM。PeriTuneの曲名（→ sound/bgm/PerituneMaterial_<bgm>.mp3）か ".mp3" 込みフルファイル名。
//   未配置/未指定は朔夜(Sakuya3)にフォールバック。曲をDLして bgm を立てるだけで切替（要クレジット表記）。

import { makeRng } from "../autobattle/autoBattle.js";

export const ROGUELITE_BIOME_MASTER = [
  // index 0 ＝ 中立層。帯0は固定でこれ。帯1以降も「通常」として確率当選（深いほど低確率）。BGMは朔夜。
  { id: "ruins", name: "平穏の廃墟", bg: "bg-ruins", glyph: "🏚", color: "#9a8fb0",
    blurb: "苔むした静寂。可もなく不可もない、ひと息つける踊り場。", mods: {} },

  // ── 軽め（帯1〜）：緩急の波をつくる基本層 ──
  { id: "collapse", name: "崩落の坑", bg: "bg-basement", glyph: "🕳", color: "#c0563a", minBand: 1,
    blurb: "足元が軋む。被弾が重くのしかかる代わり、抜ければ実入りは大きい。", bgm: "Entangle",
    mods: { dmgTakenMul: 1.5, coinMul: 1.4 } },
  { id: "onsen", name: "温泉郷", bg: "bg-ryokan", glyph: "♨", color: "#74b58e", minBand: 1,
    blurb: "湯けむりの安らぎ。傷は癒え、痛みも和らぐ憩いの層。", bgm: "Shizima3",
    mods: { dmgTakenMul: 0.65, regenMul: 1.6 } },
  { id: "dusk", name: "見晴らしの屋上", bg: "bg-school-rooftop", glyph: "🌇", color: "#e8a24a", minBand: 1,
    blurb: "高く晴れた見晴らし。攻めが冴え、アガリがよく刺さる。", bgm: "Hanagoyomi2",
    mods: { dmgDealMul: 1.25 } },
  { id: "dojo", name: "鍛錬の道場", bg: "bg-dojo", glyph: "🥋", color: "#c8a14a", minBand: 1,
    blurb: "張りつめた木の匂い。打ち込むほどに冴える、攻めと整えの層。", bgm: "Kengeki",
    mods: { dmgDealMul: 1.2, regenMul: 1.2 } },

  // ── 中盤（帯2〜）：振れ幅の大きい層 ──
  { id: "festival", name: "狂騒の祭", bg: "bg-festival", glyph: "🎆", color: "#e0a23e", minBand: 2,
    blurb: "光と喧騒。光貨は雨と降るが、浮かれた心に隙が生まれる。", bgm: "Ohayashi2A",
    mods: { coinMul: 3, dmgTakenMul: 1.25 } },
  { id: "metropolis", name: "喧噪の都", bg: "bg-city", glyph: "🌃", color: "#6f8ad0", minBand: 2,
    blurb: "強者ひしめく雑踏。敵は手強いが、得る力も上等。", bgm: "Peritune_The_City_Breathes_Your_Name_loop.mp3",
    mods: { enemyLvAdd: 1, draftBias: 0.4 } },
  { id: "gamble", name: "賭場の隠れ家", bg: "bg-hideout", glyph: "🎲", color: "#b0533c", minBand: 2,
    blurb: "煙の奥、札と点棒が舞う。実入りは破格、だが気を抜けば足元を掬われる。", bgm: "Carnival_Dark",
    mods: { coinMul: 2.4, draftBias: 0.3, dmgTakenMul: 1.2 } },
  { id: "insight", name: "看破の間", bg: "bg-blackboard", glyph: "👁", color: "#5fb0c0", minBand: 2,
    blurb: "盤面が手に取るように視える。危険は先に読めるが、相手も只者ではない。", bgm: "Peritune_Bewitched_Forest_loop.mp3",
    mods: { dmgTakenMul: 0.7, enemyLvAdd: 1 } },

  // ── 深層（帯3〜）：影響力の大きい劇物 ──
  { id: "abyss", name: "奈落", bg: "bg-dungeon", glyph: "🕯", color: "#8a6fb0", minBand: 3,
    blurb: "光ひとつ届かぬ地の底。HPの器が半分に削がれる代わり、抜けた者には破格の褒美が待つ。", bgm: "Tatari",
    mods: { hpMul: 0.5, coinMul: 1.6, draftBias: 0.5 } },
];

export const biomeById = (id) => ROGUELITE_BIOME_MASTER.find((b) => b.id === id) || ROGUELITE_BIOME_MASTER[0];
const NEUTRAL = ROGUELITE_BIOME_MASTER[0];

// 階→帯番号（0始まり）。F1-10=帯0 / F11-20=帯1 …
export function bandOfFloor(floor = 1) { return Math.floor((Math.max(1, floor) - 1) / 10); }

// 中立(通常)層の抽選重み：深いほど下がる（後半ほど"何もなし"が出にくい）。
function neutralWeight(band) { return Math.max(0.4, 2.6 - band * 0.55); }

// 帯→その層（決定論：seed×帯）。帯0は必ず中立。minBand ゲート＋通常層の深度減衰＋直前帯と被り回避。
// reroll：巡りの賽で引き直した回数（>0 で別の層になる）。0 は従来と同一の seed 文字列＝後方互換。
export function biomeForBand(seed, band, reroll = 0) {
  if (band <= 0) return NEUTRAL;
  const rng = makeRng(`${seed}:biome:${band}${reroll ? `:r${reroll}` : ""}`);
  const prev = band > 1 ? biomeForBand(seed, band - 1) : null;
  const cand = [];
  for (const b of ROGUELITE_BIOME_MASTER) {
    if ((b.minBand || 0) > band) continue;          // 出現帯ゲート（影響大の層は深層限定）
    if (prev && b.id === prev.id) continue;          // 直前帯と同じ層は避ける（連続回避）
    const w = b.id === NEUTRAL.id ? neutralWeight(band) : (b.weight != null ? b.weight : 1);
    if (w > 0) cand.push({ b, w });
  }
  if (!cand.length) return NEUTRAL;
  const total = cand.reduce((s, c) => s + c.w, 0);
  let r = rng() * total;
  for (const c of cand) { r -= c.w; if (r <= 0) return c.b; }
  return cand[cand.length - 1].b;
}

export function biomeForFloor(seed, floor = 1, reroll = 0) { return biomeForBand(seed, bandOfFloor(floor), reroll); }
export function biomeOf(run) {
  const band = bandOfFloor(run?.floor || 1);
  const reroll = run?.biomeRerolls?.[band] || 0; // 巡りの賽で引き直した回数（帯ごと）
  return biomeForFloor(run?.seed, run?.floor || 1, reroll);
}
export function biomeMods(run) { return biomeOf(run)?.mods || {}; }

// 層効果を「人間語チップ」へ（入場演出用）。tone は describeOutcome と同系統。
export function biomeEffectChips(biome) {
  const m = biome?.mods || {};
  const out = [];
  const pct = (v) => Math.round(Math.abs(v - 1) * 100);
  if (m.hpMul && m.hpMul !== 1) out.push({ t: `HP最大 −${pct(m.hpMul)}%`, tone: "loss" });
  if (m.dmgTakenMul && m.dmgTakenMul !== 1) out.push(m.dmgTakenMul > 1
    ? { t: `被ダメ +${pct(m.dmgTakenMul)}%`, tone: "loss" } : { t: `被ダメ −${pct(m.dmgTakenMul)}%`, tone: "hp" });
  if (m.dmgDealMul && m.dmgDealMul > 1) out.push({ t: `与ダメ +${pct(m.dmgDealMul)}%`, tone: "atk" });
  if (m.coinMul && m.coinMul !== 1) out.push({ t: `光貨 ×${(+m.coinMul).toFixed(m.coinMul % 1 ? 1 : 0)}`, tone: "coin" });
  if (m.regenMul && m.regenMul > 1) out.push({ t: `回復 +${pct(m.regenMul)}%`, tone: "hp" });
  if (m.enemyLvAdd) out.push({ t: `敵Lv ${m.enemyLvAdd > 0 ? "+" : ""}${m.enemyLvAdd}`, tone: m.enemyLvAdd > 0 ? "loss" : "gain" });
  if (m.draftBias) out.push({ t: "レア度UP", tone: "skill" });
  if (!out.length) out.push({ t: "特殊効果なし", tone: "gain" });
  return out;
}
