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
//   （任意）: { skillLevel }              cond.skillLevelMin の評価に使う
//   （任意）: { voiceSet }               cond.voiceSet 専用セリフを解放
//   ── 相棒絆＋プレイヤー履歴（仕様: docs/companion-bond-and-history.md §2/§3） ──
//   { companionBondLevel }   profile.companionBonds[相棒id].level → cond.companionBondMin で段階解放
//   { winStreak }            playerHistory.winStreak  → cond.winStreakMin
//   { loseStreak }           playerHistory.loseStreak → cond.loseStreakMin
//   { lastHandResult }       matchTalk.lastHandResult（"agari"|"dealIn"|"tsumoLoss"|"draw"|null）
//                            → cond.lastHandResult で前の局の結果参照
//   { playStyleTag }         topPlayStyle(playerHistory) → cond.playStyleTag で多用打ち筋参照
//   { firstMeet }            まだ一度も一緒に打っていない（totalMatches===0） → cond.firstMeet で初対面の出迎え
//   { bossMemoryTier }       楼光の館・ボスが覚えている段階（"first"|"rematch"|"revenge"）→ cond.bossMemoryTier
//                            （bossMemory.js の bossMemoryTier(profile.roguelite.bossTally[charId]) で算出）
//   ── 楼光の館・相棒が潜行履歴に反応（提案B スライス2・固有性。供給は main.js rlVoiceCtx） ──
//   { rlChapter }            登っている記憶（大章）id → cond.rlChapter（章ごとの専用セリフ）
//   { rlMainCluster }        このランの最多流派 → cond.rlMainCluster（"flush"|"guard"|"tempo"|"value"|"gamble"）
//   { rlRetreatHabit }       過去の撤退回数（撤退癖）→ cond.rlRetreatHabitMin
//   { rlCleared }            この潜行での踏破数（勢い）→ cond.rlClearedMin
//   { rlDeepRun }            自己ベスト更新中か → cond.rlDeepRun
//   { rlReached }            ラン終了時の到達階（別れ際の見守り）→ cond.rlReachedMin（P8＝物語ゲートではなくフレーバー差のみ）
//   ── 双方向（プレイヤーが返す2択。提案B §3.2-5・供給は main.js） ──
//   { resolveChoice }        別れ際の2択で選んだ手（"climb"|"rest"）→ cond.resolveChoice（キャラの返し）
//   { rlResolveClimb }       「また登る」を選んだ通算回数 → cond.rlResolveClimbMin（挑み続ける性分を覚えている）
//
import { CHARACTER_VOICE_MASTER } from "./characterVoiceMaster.js";

// ── 条件の“段階(tier)”を ctx の生値から導出する。マスタの cond と同じ語彙を返す。──
export function scoreTierOf({ isYakuman = false, score = 0 } = {}) {
  if (isYakuman) return "yakuman";
  if (score >= 10000) return "high";   // 跳満以上の大物手
  if (score >= 5200) return "mid";     // 満貫帯(8000)含む、手応えのある和了
  return "low";                        // 食い仕掛け/リーチのみ等の小場
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
  // ── 相棒絆＋プレイヤー履歴（仕様: docs/companion-bond-and-history.md §3） ──
  // companionBondMin: 相棒絆 Lv 下限。未供給時は Lv1 とみなす（未対局でも既定で通る）。
  // ※ 師弟側の bondMin（avatar.bondLevel）とは別物＝名前で区別する。
  if (cond.companionBondMin != null && !((Number(ctx.companionBondLevel) || 1) >= cond.companionBondMin)) return false;
  // winStreakMin: 連勝数下限。ctx.winStreak 未供給なら 0 とみなす。
  if (cond.winStreakMin   != null && !(Number(ctx.winStreak)  >= cond.winStreakMin))  return false;
  // loseStreakMin: 連敗数下限。ctx.loseStreak 未供給なら 0 とみなす。
  if (cond.loseStreakMin  != null && !(Number(ctx.loseStreak) >= cond.loseStreakMin)) return false;
  // lastHandResult: 前の局の結果（"agari"|"dealIn"|"tsumoLoss"|"draw"）。未供給は不一致扱い。
  if (cond.lastHandResult && cond.lastHandResult !== ctx.lastHandResult) return false;
  // playStyleTag: 多用する打ち筋タグ（"riichi"|"meld"|"aggressive"|"defensive"）。未供給は不一致扱い。
  if (cond.playStyleTag   && cond.playStyleTag   !== ctx.playStyleTag)   return false;
  // firstMeet: 初対面か（対戦ホームの出迎え用）。true/false を ctx.firstMeet と厳密一致で評価。
  if (cond.firstMeet != null && Boolean(ctx.firstMeet) !== cond.firstMeet) return false;
  // buffFamily: 楼光の館のバフ系統（"attack"|"defense"|"sustain"|"ability"|"ally"）。未供給は不一致扱い。
  if (cond.buffFamily && cond.buffFamily !== ctx.buffFamily) return false;
  // bossMemoryTier: 楼光の館・ボスが"覚えている"段階（"first"|"rematch"|"revenge"）。
  // ctx.bossMemoryTier（bossMemory.js の bossMemoryTier で算出）と一致したときだけ候補。未供給は不一致扱い。
  if (cond.bossMemoryTier && cond.bossMemoryTier !== ctx.bossMemoryTier) return false;
  // pairWith: 楼光の館・ボス2人が特定コンビのときだけ出る掛け合い口上（rlBossIntroPair/Reply）。
  // ctx.pairWith＝同卓のもう一人の charId。一致したときだけ候補（未供給は不一致扱い）。
  if (cond.pairWith && cond.pairWith !== ctx.pairWith) return false;
  // ── 楼光の館・相棒が「あなたの潜行履歴」に反応（提案B スライス2／固有性）。供給は src/main.js の rlVoiceCtx ──
  // rlChapter: 登っている記憶（大章）id。章ごとの専用セリフを解放。未供給は不一致扱い。
  if (cond.rlChapter && cond.rlChapter !== ctx.rlChapter) return false;
  // rlMainCluster: このランで最多の流派（"flush"|"guard"|"tempo"|"value"|"gamble"）。未供給は不一致扱い。
  if (cond.rlMainCluster && cond.rlMainCluster !== ctx.rlMainCluster) return false;
  // rlRetreatHabitMin: 過去の撤退回数の下限（撤退癖）。ctx.rlRetreatHabit 未供給なら 0。
  if (cond.rlRetreatHabitMin != null && !(Number(ctx.rlRetreatHabit) >= cond.rlRetreatHabitMin)) return false;
  // rlClearedMin: この潜行での踏破数（勢い／連勝）の下限。ctx.rlCleared 未供給なら 0。
  if (cond.rlClearedMin != null && !(Number(ctx.rlCleared) >= cond.rlClearedMin)) return false;
  // rlDeepRun: 自己ベスト（過去最深）を更新中か。true/false を ctx.rlDeepRun と厳密一致で評価。
  if (cond.rlDeepRun != null && Boolean(ctx.rlDeepRun) !== cond.rlDeepRun) return false;
  // ── 楼光の館・双方向（プレイヤーが返す2択）（提案B §3.2-5。供給は main.js） ──
  // resolveChoice: 別れ際の2択で選んだ手（"climb"=また登る / "rest"=今は休む）。キャラの“返し”を出し分ける。
  if (cond.resolveChoice && cond.resolveChoice !== ctx.resolveChoice) return false;
  // rlResolveClimbMin: 「また登る」を選んだ通算回数の下限（＝挑み続ける性分をキャラが覚えている）。未供給は0。
  if (cond.rlResolveClimbMin != null && !(Number(ctx.rlResolveClimb) >= cond.rlResolveClimbMin)) return false;
  // rlReachedMin / rlReachedMax: ラン終了時の到達階の下限／上限（別れ際の見守り＝深さ帯でフレーバーを変える）。
  // ※ P8 厳守：これは物語フラグのゲートではなく“別れ際のフレーバー差”のみ。無指定行が常にフォールバックで残る。
  // 浅い帯=rlReachedMax(励まし)／深い帯=rlReachedMin(誇り)／中間=無指定。ctx.rlReached 未供給なら下限0扱い・上限は不一致。
  if (cond.rlReachedMin != null && !(Number(ctx.rlReached) >= cond.rlReachedMin)) return false;
  if (cond.rlReachedMax != null && !(Number(ctx.rlReached) <= cond.rlReachedMax)) return false;
  return true;
}

// 直近に返したセリフ（charId:event ごと）。連続で同一文を返さない＝重複回避（蓄積の手触り）。
const _recentLine = new Map();

// event と cond に一致するセリフから1つをランダムに返す（無ければ null）。
// 候補が2つ以上あるときは、直前に返した文を避けて選ぶ（同じセリフの連発を防ぐ）。
export function pickVoiceLine(charId, event, ctx = {}) {
  const entries = CHARACTER_VOICE_MASTER[charId] || [];
  const matches = entries.filter((e) => e.event === event && condMatches(e.cond, ctx));
  if (!matches.length) return null;
  const key = `${charId}:${event}`;
  const prev = _recentLine.get(key);
  let pool = matches;
  if (matches.length > 1 && prev != null) {
    const filtered = matches.filter((m) => m.text !== prev);
    if (filtered.length) pool = filtered;
  }
  const text = pool[(Math.random() * pool.length) | 0].text;
  _recentLine.set(key, text);
  return text;
}
