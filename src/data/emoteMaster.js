// エモート（感情アイコン）素材レジストリ — シナリオ紙芝居用。
//
// 各エモートは「スプライトシート1枚（横 cols × 縦 rows のフレーム並び）」で表現する。
// scenarioPlayer が行の emoteId を見て、話者の頭上付近にアニメ表示する（JSでフレーム送り）。
// CSS/JS のみ・依存なし。追加方法: 素材を graphic/emo/sheet/ に置き、ここに1エントリ足すだけ。
//
// 素材仕様（graphic/emo/03_スプライトシート/スプライトシート_設定.txt より）:
//   1コマ 400×400px / FPS 30。標準は 40コマ（横5×縦8）。
//   例外: emo_015=50コマ(5×10)、emo_017/020/021/023=60コマ(6×10)。
//   方向違い(L/R)がある素材は L（左向き）を採用。
//
// loop の指針:
//   false … 一拍の「リアクション」（！ ？ ひらめき 等）。最終フレームで静止して頭上に残す。
//   true  … 持続する「ムード」（♪ Zzz 汗 もやもや 等）。次の行へ進むまで繰り返す。
//
// 各 emoteId の使いどころは scenario-forge の reference/emotes.md にも記載。
const SHEET = "graphic/emo/sheet";
const STD = { frameW: 400, frameH: 400, cols: 5, rows: 8, frameCount: 40, fps: 30, size: 160 };
const BIG50 = { frameW: 400, frameH: 400, cols: 5, rows: 10, frameCount: 50, fps: 30, size: 160 };
const BIG60 = { frameW: 400, frameH: 400, cols: 6, rows: 10, frameCount: 60, fps: 30, size: 160 };

export const EMOTE_MASTER = {
  // ── 気づき・驚き系 ───────────────────────────────
  notice:   { ...STD, emoteId: "notice",   label: "ハッ（気づき）",   sheet: `${SHEET}/emo_001_L_ss.png`, loop: false },
  surprise: { ...STD, emoteId: "surprise", label: "！（驚き）",       sheet: `${SHEET}/emo_002_ss.png`,   loop: false },
  shock:    { ...STD, emoteId: "shock",    label: "‼（衝撃）",        sheet: `${SHEET}/emo_003_ss.png`,   loop: false },
  question: { ...STD, emoteId: "question", label: "？（疑問）",       sheet: `${SHEET}/emo_006_ss.png`,   loop: false },
  confused: { ...STD, emoteId: "confused", label: "！？（困惑）",     sheet: `${SHEET}/emo_007_ss.png`,   loop: false },
  impact:   { ...STD, emoteId: "impact",   label: "ドン（衝撃ヒット）", sheet: `${SHEET}/emo_025_ss.png`,   loop: false },

  // ── ひらめき・前向き系 ───────────────────────────
  idea:     { ...STD, emoteId: "idea",     label: "ひらめき（電球）", sheet: `${SHEET}/emo_004_ss.png`,   loop: false },
  joy:      { ...STD, emoteId: "joy",      label: "わーい（星はじけ）", sheet: `${SHEET}/emo_005_ss.png`,   loop: true },
  sparkle:  { ...STD, emoteId: "sparkle",  label: "キラキラ（憧れ）", sheet: `${SHEET}/emo_024_ss.png`,   loop: true },
  music:    { ...STD, emoteId: "music",    label: "♪（ご機嫌）",      sheet: `${SHEET}/emo_016_ss.png`,   loop: true },
  flower:   { ...STD, emoteId: "flower",   label: "花（にこにこ）",   sheet: `${SHEET}/emo_009_ss.png`,   loop: true },
  love:     { ...STD, emoteId: "love",     label: "ハート（好意）",   sheet: `${SHEET}/emo_008_ss.png`,   loop: true },

  // ── 怒り・苛立ち系 ───────────────────────────────
  anger:    { ...STD, emoteId: "anger",    label: "怒筋（イラッ）",   sheet: `${SHEET}/emo_011_ss.png`,   loop: false },
  temper:   { ...STD, emoteId: "temper",   label: "こめかみ（ぐぬぬ）", sheet: `${SHEET}/emo_019_L_ss.png`, loop: false },
  flare:    { ...STD, emoteId: "flare",    label: "ムカッ（怒り炎）", sheet: `${SHEET}/emo_026_L_ss.png`, loop: false },
  tension:  { ...STD, emoteId: "tension",  label: "ピリッ（緊張・敵意）", sheet: `${SHEET}/emo_018_L_ss.png`, loop: false },

  // ── 焦り・動揺系 ─────────────────────────────────
  sweat:    { ...STD, emoteId: "sweat",    label: "汗（気まずい）",   sheet: `${SHEET}/emo_012_ss.png`,   loop: true },
  fluster:  { ...STD, emoteId: "fluster",  label: "あせあせ（汗飛び）", sheet: `${SHEET}/emo_013_L_ss.png`, loop: false },
  dizzy:    { ...STD, emoteId: "dizzy",    label: "目回り（くらくら）", sheet: `${SHEET}/emo_022_ss.png`,   loop: true },

  // ── 落ち込み・気抜け系 ───────────────────────────
  muddle:   { ...STD,   emoteId: "muddle",   label: "もやもや（混乱）", sheet: `${SHEET}/emo_010_ss.png`, loop: true },
  heartbreak:{ ...BIG50, emoteId: "heartbreak", label: "ガーン（失望）", sheet: `${SHEET}/emo_015_ss.png`, loop: false },
  gloom:    { ...BIG60, emoteId: "gloom",    label: "どんより（落胆）", sheet: `${SHEET}/emo_020_ss.png`, loop: true },
  dazed:    { ...BIG60, emoteId: "dazed",    label: "ぽや〜（放心）",   sheet: `${SHEET}/emo_017_ss.png`, loop: true },
  sleepy:   { ...BIG60, emoteId: "sleepy",   label: "Zzz（眠い・退屈）", sheet: `${SHEET}/emo_021_ss.png`, loop: true },
  silence:  { ...BIG60, emoteId: "silence",  label: "…（沈黙・絶句）",  sheet: `${SHEET}/emo_023_ss.png`, loop: false },

  // ── 発話 ─────────────────────────────────────────
  speak:    { ...STD, emoteId: "speak",    label: "吹き出し（言いたい）", sheet: `${SHEET}/emo_014_L_ss.png`, loop: false },
};

export function emoteDef(emoteId) {
  return EMOTE_MASTER[emoteId] || null;
}
