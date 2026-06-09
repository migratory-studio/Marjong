// 雀荘マスタ — major_update_specification.md §4.6.8。
//
// 雀荘巡りの「種類（難易度）」と、その日の候補生成（決定論）。中身は §4.6.3 のオートバトル。
// ※連戦数・敵 Lv・ソウルは「種別 × シナリオ進捗」で本調整する想定。現状は仮値＋進捗で微増。
import { makeRng } from "../autobattle/autoBattle.js";

// weight=出現重み（楽勝＞拮抗＞チャレンジ≒大会中）。tone は調子チップと同じ配色を流用。
// oppLv＝相手 param の弱さ（§paramsFromLv 新スケール：0=激弱）。oppHpMax＝相手の点棒（小さいほど飛びやすい）。
// 楽勝＝相手 HP 2,600＝リャンハン（2翻）で飛ぶ。難度が上がるほど相手 HP・Lv・ソウルが増える。
// paramMain/paramSub＝勝負勘（主）/ランダム（副）の基礎上昇量（§4.6.1）。難度が上がるほど伸びも大きい。
export const PARLOR_TIERS = [
  { key: "rakushou",  label: "楽勝寄り",     tone: "good",  weight: 5.0, oppLv: 0, oppHpMax: 2600,  matches: 2, soulPerWin: 60,  paramMain: 1, paramSub: 1 },
  { key: "kikkou",    label: "拮抗気味",     tone: "ok",    weight: 3.0, oppLv: 1, oppHpMax: 6000,  matches: 3, soulPerWin: 120, paramMain: 2, paramSub: 1 },
  { key: "challenge", label: "チャレンジ",   tone: "bad",   weight: 1.2, oppLv: 2, oppHpMax: 10000, matches: 4, soulPerWin: 240, paramMain: 3, paramSub: 2 },
  { key: "taikai",    label: "大会中の雀荘", tone: "vbad",  weight: 1.0, oppLv: 3, oppHpMax: 13000, matches: 4, soulPerWin: 360, paramMain: 4, paramSub: 2, tournament: true },
];

const BY_KEY = Object.fromEntries(PARLOR_TIERS.map((t) => [t.key, t]));
export const parlorTierOf = (key) => BY_KEY[key] || PARLOR_TIERS[0];

// 雀荘の「副パラメータ」候補（主＝勝負勘は固定なので、副は勝負勘以外の5種から）。
// 各雀荘は副パラメを1つ持ち、店名でそれを“におわせる”（mob名のように決定論で選ぶ）。
export const PARLOR_SUB_PARAMS = ["fire", "guard", "read", "speed", "mental"];
// 副パラメ → 店名リスト（名前からどのパラメが伸びそうか匂う）。
export const PARLOR_NAMES = {
  fire:   ["豪打荘", "烈火クラブ", "一撃の卓", "剛腕亭", "火の手荘", "砲撃の間"],
  guard:  ["鉄壁荘", "城壁クラブ", "不落の卓", "守静亭", "盾の間", "堅城荘"],
  read:   ["心眼荘", "千里眼クラブ", "読牌の卓", "慧眼亭", "観の間", "看破荘"],
  speed:  ["疾風荘", "電光クラブ", "韋駄天の卓", "速攻亭", "瞬足の間", "風林荘"],
  mental: ["不動荘", "胆力クラブ", "平常心の卓", "鉄心亭", "静寂の間", "泰然荘"],
};

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
  const usedNames = new Set(); // 同じ日に同名が並ばないように
  for (let i = 0; i < count; i++) {
    const t = pickTier(rng);
    // 副パラメ＋店名を決定論で固定（名前で副パラメをにおわせる）。
    const subParam = PARLOR_SUB_PARAMS[Math.floor(rng() * PARLOR_SUB_PARAMS.length)];
    const pool = PARLOR_NAMES[subParam] || ["雀荘"];
    let name = pool[Math.floor(rng() * pool.length)];
    if (usedNames.has(name)) name = pool[(pool.indexOf(name) + 1) % pool.length]; // 被り回避
    usedNames.add(name);
    out.push({
      index: i,
      tier: t.key,
      label: t.label,
      tone: t.tone,
      name,
      subParam,
      matches: t.matches + Math.floor(progress / 2),
      oppLv: t.oppLv + progress,
      oppHpMax: t.oppHpMax + progress * 1500,
      soulPerWin: Math.round(t.soulPerWin * (1 + progress * 0.15)),
      paramMain: t.paramMain,
      paramSub: t.paramSub,
      tournament: !!t.tournament,
    });
  }
  return out;
}
