// 雀荘マスタ — major_update_specification.md §4.6.8。
//
// 雀荘巡りの「種類（難易度）」と、その日の候補生成（決定論）。中身は §4.6.3 のオートバトル。
// ※連戦数・敵 Lv・ソウルは「種別 × シナリオ進捗」で本調整する想定。現状は仮値＋進捗で微増。
import { makeRng } from "../autobattle/autoBattle.js";

// weight=出現重み（楽勝＞拮抗＞チャレンジ≒大会中）。tone は調子チップと同じ配色を流用。
export const PARLOR_TIERS = [
  { key: "rakushou",  label: "楽勝寄り",     tone: "good",  weight: 5.0, oppLv: 1, matches: 2, soulPerWin: 60 },
  { key: "kikkou",    label: "拮抗気味",     tone: "ok",    weight: 3.0, oppLv: 3, matches: 3, soulPerWin: 120 },
  { key: "challenge", label: "チャレンジ",   tone: "bad",   weight: 1.2, oppLv: 5, matches: 4, soulPerWin: 240 },
  { key: "taikai",    label: "大会中の雀荘", tone: "vbad",  weight: 1.0, oppLv: 6, matches: 4, soulPerWin: 360, tournament: true },
];

const BY_KEY = Object.fromEntries(PARLOR_TIERS.map((t) => [t.key, t]));
export const parlorTierOf = (key) => BY_KEY[key] || PARLOR_TIERS[0];

// 重み付きで 1 種類引く。
function pickTier(rng) {
  const sum = PARLOR_TIERS.reduce((a, t) => a + t.weight, 0);
  let r = rng() * sum;
  for (const t of PARLOR_TIERS) { if ((r -= t.weight) < 0) return t; }
  return PARLOR_TIERS[0];
}

// その日の候補（既定 3 つ）。dayCount をシードに決定論生成（同じ日は何度開いても同じ）。
// progress（シナリオ進捗・当面 0）で連戦数・敵 Lv・ソウルをスケール。
export function rollDailyParlors(dayCount, progress = 0, count = 3) {
  const rng = makeRng(`parlor:${dayCount}`);
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = pickTier(rng);
    out.push({
      index: i,
      tier: t.key,
      label: t.label,
      tone: t.tone,
      matches: t.matches + Math.floor(progress / 2),
      oppLv: t.oppLv + progress,
      soulPerWin: Math.round(t.soulPerWin * (1 + progress * 0.15)),
      tournament: !!t.tournament,
    });
  }
  return out;
}
