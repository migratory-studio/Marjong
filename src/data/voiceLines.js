// セリフ解決ロジック — マスタ(characterVoiceMaster)から状況に合うセリフを1つ選ぶ。
//
// 使い方:
//   pickVoiceLine("shiyue", "agari", { isYakuman:false, score:12000 }) -> "ツモッ! ..."
//   一致候補が複数あればランダムに1つ返す。一致無し/未定義キャラは null。
//
// ctx に積む値（イベント別に必要なものだけでOK。足りなければ既定値で評価）:
//   agari   : { isYakuman, score }
//   damage  : { dmgAmount, hpFrac }      hpFrac = 被弾後の持ち点 / 開始持ち点
//   matchEnd: { rankIndex, numPlayers }  rankIndex = 0始まり(0=1位)
//   （任意 / 追々）: { skillLevel }       cond.skillLevelMin の評価に使う
//
import { CHARACTER_VOICE_MASTER } from "./characterVoiceMaster.js";

// ── 条件の“段階(tier)”を ctx の生値から導出する。マスタの cond と同じ語彙を返す。──
export function scoreTierOf({ isYakuman = false, score = 0 } = {}) {
  if (isYakuman) return "yakuman";
  return score >= 10000 ? "high" : "low";
}
export function dmgTierOf({ dmgAmount = 0, hpFrac = 1 } = {}) {
  if (hpFrac <= 0.2) return "pinch"; // 残りわずか（被弾サイズより優先）
  if (dmgAmount >= 8000) return "big";
  if (dmgAmount >= 3900) return "mid";
  return "small";
}
export function rankTierOf({ rankIndex = 0, numPlayers = 4 } = {}) {
  if (rankIndex <= 0) return "top";
  if (rankIndex >= numPlayers - 1) return "bottom";
  return rankIndex <= (numPlayers - 1) / 2 ? "upper" : "lower";
}

// 1件の cond が ctx を満たすか。条件キーを増やすときはここに1行足すだけ。
function condMatches(cond, ctx) {
  if (!cond) return true;
  if (cond.scoreTier && cond.scoreTier !== scoreTierOf(ctx)) return false;
  if (cond.dmgTier && cond.dmgTier !== dmgTierOf(ctx)) return false;
  if (cond.rankTier && cond.rankTier !== rankTierOf(ctx)) return false;
  // 拡張: スキルLv下限（ctx.skillLevel 未供給なら満たさない扱い）。
  if (cond.skillLevelMin != null && !(Number(ctx.skillLevel) >= cond.skillLevelMin)) return false;
  // 拡張: セリフセット（シナリオが ctx.voiceSet を指定したとき専用セリフを解放）。
  // voiceSet 指定のある行は ctx.voiceSet が一致したときだけ候補。指定なしの行は
  // 常に候補＝フォールバック。これにより「一致すれば専用／無ければ通常」が成立する。
  if (cond.voiceSet && cond.voiceSet !== ctx.voiceSet) return false;
  return true;
}

// event と cond に一致するセリフから1つをランダムに返す（無ければ null）。
export function pickVoiceLine(charId, event, ctx = {}) {
  const entries = CHARACTER_VOICE_MASTER[charId] || [];
  const matches = entries.filter((e) => e.event === event && condMatches(e.cond, ctx));
  if (!matches.length) return null;
  return matches[(Math.random() * matches.length) | 0].text;
}
