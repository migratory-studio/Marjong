// 楼光の館：バイオーム（"層"）マスタ — docs/shitei-calendar-and-roguelite.md「B. ローグライト」。
//
// 10階ごとに塔の景色＝層が変わる（楼光の館＝記憶を映す塔）。各層は背景＋固有モディファイアを持ち、
// その帯(10階)の全フロアに乗る。完全マスタ駆動＝層は1エントリ追記で増やせる。
// モディファイアは run.js / main.js の既存ノブに掛けるだけ（新規メカ無し）:
//   dmgTakenMul … 味方の被ダメ深度倍率(fdm)に乗る（>1=重い / <1=軽い）
//   dmgDealMul  … 味方の与ダメ深度(deal)に乗る（>1=攻め映え）
//   coinMul     … 踏破光貨に乗る
//   regenMul    … 踏破時の部分回復量に乗る
//   enemyLvAdd  … 敵Lvの底上げ（強敵化）
//   draftBias   … ドラフトのレア度バイアス加算（0〜1）

import { makeRng } from "../autobattle/autoBattle.js";

export const ROGUELITE_BIOME_MASTER = [
  // index 0 ＝ 最初の帯(F1-10)固定の中立層（とっつき）。
  { id: "ruins", name: "平穏の廃墟", bg: "bg-ruins", glyph: "🏚", color: "#9a8fb0",
    blurb: "苔むした静寂。可もなく不可もない、登攀のはじまり。", mods: {} },
  { id: "collapse", name: "崩落の坑", bg: "bg-basement", glyph: "🕳", color: "#c0563a",
    blurb: "足元が軋む。被弾が重くのしかかる代わり、抜ければ実入りは大きい。",
    mods: { dmgTakenMul: 1.5, coinMul: 1.4 } },
  { id: "festival", name: "狂騒の祭", bg: "bg-festival", glyph: "🎆", color: "#e0a23e",
    blurb: "光と喧騒。光貨は雨と降るが、浮かれた心に隙が生まれる。",
    mods: { coinMul: 3, dmgTakenMul: 1.25 } },
  { id: "onsen", name: "温泉郷", bg: "bg-ryokan", glyph: "♨", color: "#74b58e",
    blurb: "湯けむりの安らぎ。傷は癒え、痛みも和らぐ憩いの層。",
    mods: { dmgTakenMul: 0.65, regenMul: 1.6 } },
  { id: "dusk", name: "黄昏の屋上", bg: "bg-school-rooftop", glyph: "🌇", color: "#e8884a",
    blurb: "茜の見晴らし。攻めが冴え、アガリがよく刺さる。",
    mods: { dmgDealMul: 1.25 } },
  { id: "metropolis", name: "喧噪の都", bg: "bg-city", glyph: "🌃", color: "#6f8ad0",
    blurb: "強者ひしめく雑踏。敵は手強いが、得る力も上等。",
    mods: { enemyLvAdd: 1, draftBias: 0.4 } },
];

export const biomeById = (id) => ROGUELITE_BIOME_MASTER.find((b) => b.id === id) || ROGUELITE_BIOME_MASTER[0];

// 階→帯番号（0始まり）。F1-10=帯0 / F11-20=帯1 …
export function bandOfFloor(floor = 1) { return Math.floor((Math.max(1, floor) - 1) / 10); }

// 帯→その層（決定論：seed×帯）。帯0は必ず中立「平穏の廃墟」。直前の帯と同じ層は避ける。
export function biomeForBand(seed, band) {
  if (band <= 0) return ROGUELITE_BIOME_MASTER[0];
  const pool = ROGUELITE_BIOME_MASTER.slice(1); // 中立(ruins)以外から抽選
  const rng = makeRng(`${seed}:biome:${band}`);
  let pick = pool[Math.floor(rng() * pool.length)];
  if (band > 1) { // 直前帯と被ったら1回引き直す（連続回避）
    const prev = biomeForBand(seed, band - 1);
    if (pick.id === prev.id) pick = pool[(pool.indexOf(pick) + 1) % pool.length];
  }
  return pick;
}

export function biomeForFloor(seed, floor = 1) { return biomeForBand(seed, bandOfFloor(floor)); }
export function biomeOf(run) { return biomeForFloor(run?.seed, run?.floor || 1); }
export function biomeMods(run) { return biomeOf(run)?.mods || {}; }

// 層効果を「人間語チップ」へ（入場演出用）。tone は describeOutcome と同系統。
export function biomeEffectChips(biome) {
  const m = biome?.mods || {};
  const out = [];
  const pct = (v) => Math.round(Math.abs(v - 1) * 100);
  if (m.dmgTakenMul && m.dmgTakenMul !== 1) out.push(m.dmgTakenMul > 1
    ? { t: `被ダメ +${pct(m.dmgTakenMul)}%`, tone: "loss" } : { t: `被ダメ −${pct(m.dmgTakenMul)}%`, tone: "hp" });
  if (m.dmgDealMul && m.dmgDealMul > 1) out.push({ t: `与ダメ +${pct(m.dmgDealMul)}%`, tone: "atk" });
  if (m.coinMul && m.coinMul !== 1) out.push({ t: `光貨 ×${(+m.coinMul).toFixed(m.coinMul % 1 ? 1 : 0)}`, tone: "coin" });
  if (m.regenMul && m.regenMul > 1) out.push({ t: `回復 +${pct(m.regenMul)}%`, tone: "hp" });
  if (m.enemyLvAdd) out.push({ t: `敵Lv +${m.enemyLvAdd}`, tone: "loss" });
  if (m.draftBias) out.push({ t: "レア度UP", tone: "skill" });
  if (!out.length) out.push({ t: "特殊効果なし", tone: "gain" });
  return out;
}
