// 育成 6 パラメータの「定義・ランク・効果」を 1 箇所に集約 — major_update_specification.md §4.6.1 / §4.6.2。
//
// 役割分担（重要）:
//   - 「数値そのもの」（しきい値・係数・勝率式）は autoBattle.js の CFG が正典。
//   - 「人にとっての意味」（名前・上げ方・何に効くか・ランク表示）は本ファイルが正典。
//   - 「上げ方」は progressionService の TRAIN_TUNING から導出する（活動コマンドが真実源）。
//
// これで「何のステータスがあり / 何で上げ / 何に直結するか」が 1 望できる。
import { PARAM_KEYS } from "./autoBattle.js";
import { TRAIN_TUNING } from "../progression/progressionService.js";

// 6 パラメータの定義。order は PARAM_KEYS の並びを使う。
export const STAT_META = {
  fire:   { label: "火力",     kana: "攻め",   command: "押す",       passive: false,
            affects: "「押す」で局を取る力と獲得点。高いほど押し切れる。" },
  guard:  { label: "守備",     kana: "受け",   command: "引く",       passive: false,
            affects: "「引く」で放銃・被害を軽減。劣勢でも削られにくい。" },
  read:   { label: "読み",     kana: "判断",   command: "様子を見る", passive: false,
            affects: "「様子を見る」の立て直し＋相手スタンスの事前開示（読み合い）。" },
  gamble: { label: "勝負勘",   kana: "胆力",   command: "能力発動",   passive: false,
            affects: "「能力発動」と博打手の一撃。高打点・一発の伸び。" },
  speed:  { label: "速度",     kana: "手作り", command: null,         passive: true,
            affects: "先制。毎局わずかに局を取りやすく、手も高くなりやすい。" },
  mental: { label: "メンタル", kana: "集中",   command: null,         passive: true,
            affects: "乱数の振れ幅を圧縮。事故が減り、優勢を守れる。" },
};

// 値(0..99) → ランク（サクセス育成風 G〜S）。しきい値はチューニング値。
export const RANK_BANDS = [
  { rank: "S", min: 90 }, { rank: "A", min: 77 }, { rank: "B", min: 64 },
  { rank: "C", min: 51 }, { rank: "D", min: 38 }, { rank: "E", min: 25 },
  { rank: "F", min: 13 }, { rank: "G", min: 0 },
];
export const PARAM_MAX = 99;

export function rankOf(value) {
  const v = Math.max(0, Math.min(PARAM_MAX, value || 0));
  return (RANK_BANDS.find((b) => v >= b.min) || RANK_BANDS[RANK_BANDS.length - 1]).rank;
}

// 各パラメータの「上げ方」を TRAIN_TUNING から導出（主/副）。活動を 1 箇所で真実源化。
// 雀荘巡りの副は「ランダム 1 種」なので、勝負勘以外には 副(運) として現れる。
export function raisedByOf(statKey) {
  const out = [];
  for (const t of Object.values(TRAIN_TUNING)) {
    if (t.main === statKey) out.push({ label: t.label, role: "主", gain: t.mainGain });
    else if (t.sub === statKey) out.push({ label: t.label, role: "副", gain: t.subGain });
    else if (t.sub === "random") out.push({ label: t.label, role: "運", gain: t.subGain });
  }
  return out;
}

// UI 用：1 パラメータぶんの表示モデルをまとめて返す。
export function statView(statKey, value) {
  const meta = STAT_META[statKey];
  return {
    key: statKey,
    label: meta.label,
    kana: meta.kana,
    passive: meta.passive,
    command: meta.command,
    affects: meta.affects,
    value: value || 0,
    rank: rankOf(value),
    pct: Math.round(((value || 0) / PARAM_MAX) * 100),
    raisedBy: raisedByOf(statKey),
  };
}

// 6 パラメータぶんの表示モデル（PARAM_KEYS 順）。params6 を渡す。
export function statViews(params6 = {}) {
  return PARAM_KEYS.map((k) => statView(k, params6[k]));
}

// ランクの高低順インデックス（G=0 … S=最大）。
const RANK_ORDER = RANK_BANDS.map((b) => b.rank).reverse();
const rankIndex = (r) => RANK_ORDER.indexOf(r);

// before→after でランクが上がったステの一覧（{key,label,from,to}）。
export function diffRankUps(before, after = {}) {
  if (!before) return [];
  const ups = [];
  for (const k of PARAM_KEYS) {
    const from = rankOf(before[k] ?? 0);
    const to = rankOf(after[k] ?? 0);
    if (rankIndex(to) > rankIndex(from)) ups.push({ key: k, label: STAT_META[k].label, from, to });
  }
  return ups;
}
