// シナリオ用 音声マスタ — BGM / SE のレジストリ（単一の出どころ）。
//
// scenarioPlayer は行の `bgmId` / `seId` を見て音を切り替える。
//   - bgmId: 値が変わった行でクロスフェード切替（同じ値の連続はそのまま継続）。
//            "bgm-none" は停止のセンチネル。
//   - seId : その行で1回だけ効果音を鳴らす（ワンショット）。
//
// すべて任意・グレースフル。ファイルが無ければ no-op（鳴らないだけで進行は崩れない）。
// 列挙の真実は scenario-forge の reference/vocab.json `bgmIdAllowlist`/`seIdAllowlist` と
// reference/audio.md。**この3者は常に同期させる**（片方だけ増やさない）。
//
// 素材の置き場（規約。置けば自動で反映）:
//   BGM … sound/bgm/scenario/<id>.mp3
//   SE  … sound/se/scenario/<id>.mp3
// 既存素材を再利用するエントリは file に実在パスを直接指定している（即・鳴る）。
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");
const BGM_DIR = "sound/bgm/scenario";
const SE_DIR = "sound/se/scenario";

// ── BGM（ループ）。label は生成器向けの「ムード」説明 ───────────────
export const BGM_MASTER = {
  "bgm-daily":   { label: "道場の日常・穏やか",        file: enc(`${BGM_DIR}/bgm-daily.mp3`) },
  "bgm-warm":    { label: "温かな師弟の語らい",        file: enc(`${BGM_DIR}/bgm-warm.mp3`) },
  "bgm-playful": { label: "軽快・コミカル（詩玥の調子）", file: enc(`${BGM_DIR}/bgm-playful.mp3`) },
  "bgm-tension": { label: "緊張・対峙・敵意",          file: enc(`${BGM_DIR}/bgm-tension.mp3`) },
  "bgm-sorrow":  { label: "切なさ・回想・哀しみ",      file: enc(`${BGM_DIR}/bgm-sorrow.mp3`) },
  "bgm-mystery": { label: "不穏・謎・違和感",          file: enc(`${BGM_DIR}/bgm-mystery.mp3`) },
  "bgm-resolve": { label: "決意・前を向く",            file: enc(`${BGM_DIR}/bgm-resolve.mp3`) },
  "bgm-battle":  { label: "対局・白熱",                file: enc(`${BGM_DIR}/bgm-battle.mp3`) },
  "bgm-victory": { label: "勝利・達成・歓喜",          file: enc(`${BGM_DIR}/bgm-victory.mp3`) },
  "bgm-night":   { label: "夜・静寂・余韻",            file: enc(`${BGM_DIR}/bgm-night.mp3`) },
  // 停止センチネル（ファイル無し）。bgmId に指定すると BGM を止める。
  "bgm-none":    { label: "停止（無音）",              file: null },
};

// ── SE（ワンショット）。一部は既存の同梱素材を再利用 ─────────────────
export const SE_MASTER = {
  // 既存・追加の同梱素材を再利用（即・鳴る）
  "se-shuffle": { label: "牌をかき混ぜる",     file: enc("sound/se/麻雀牌をまぜる.mp3") },
  "se-tile":    { label: "牌を置く",           file: enc("sound/se/dahai/牌を置く・その１.mp3") },
  "se-score":   { label: "点数表示（金額）",   file: enc("sound/se/金額表示.mp3") },
  "se-door":    { label: "戸・障子を開ける",   file: enc("sound/se/ふすまを開ける1.mp3") },
  "se-tsumo":   { label: "ツモる快音",         file: enc("sound/se/シャキーン2.mp3") },
  "se-flash":   { label: "閃光・ひらめき",     file: enc("sound/se/シャキーン1.mp3") },
  "se-step":    { label: "足音・登場",         file: enc("sound/se/畳の上を歩く.mp3") },
  "se-success": { label: "成功・前向きな締め", file: enc("sound/se/指パッチン1.mp3") },
  // 規約パス（素材が来たら自動で鳴る・未収集なら no-op）
  "se-heartbeat": { label: "鼓動・動揺",       file: enc(`${SE_DIR}/se-heartbeat.mp3`) },
  "se-impact":  { label: "ドン・衝撃ヒット",   file: enc(`${SE_DIR}/se-impact.mp3`) },
  "se-wind":    { label: "風・間（ま）",       file: enc(`${SE_DIR}/se-wind.mp3`) },
  "se-bell":    { label: "鈴・場面転換",       file: enc(`${SE_DIR}/se-bell.mp3`) },
};

export function bgmDef(id) { return id ? BGM_MASTER[id] || null : null; }
export function seDef(id) { return id ? SE_MASTER[id] || null : null; }
