// 相棒絆（companion bond）＋ プレイヤー履歴 — 純ロジック（UI/保存/通信に非依存）。
//
// 仕様: docs/companion-bond-and-history.md（ステップ1）
//
// 設計原則:
//  - すべて純関数 / イミュータブル / 副作用なし。テスト可能。
//  - profile の更新は新しいオブジェクトを返す（スプレッド展開）。
//  - 係数は progressionService.js の GROWTH_TUNING と共通語彙を使う。

import { GROWTH_TUNING } from "./progressionService.js";

// ── 絆Lvの計算 ─────────────────────────────────────────────────────────────
//
// 師弟絆（gainBond in progressionService.js:63-71）と同じ式:
//   次Lv閾値 = bondExpPerLevel * 現Lv（逓増）
// 例: Lv1→2 に 40exp / Lv2→3 に 80exp / Lv3→4 に 120exp …
//
// 戻り値: { level, exp }
//   level = 到達した絆Lv（1始まり）
//   exp   = その Lv での残り exp（次Lv への進捗）
export function companionLevelFromExp(totalExp) {
  let level = 1;
  let exp = Math.max(0, Math.floor(totalExp));
  while (exp >= GROWTH_TUNING.bondExpPerLevel * level) {
    exp -= GROWTH_TUNING.bondExpPerLevel * level;
    level += 1;
  }
  return { level, exp };
}

// ── 対局結果を profile に反映（イミュータブル） ─────────────────────────────
//
// 引数:
//   profile         — 現在の profile オブジェクト
//   companionId     — 対局中の相棒キャラ id（例 "shiyue"）
//   placement       — 着順 0始まり（0=1位、numPlayers-1=ラス）
//   numPlayers      — 対局人数（2/3/4）
//   styleTags       — detectPlayStyle の結果（string[]）
//   treasureJustCleared — 九蓮達成と同時か（§4: +120 加算）
//
// 戻り値: 新しい profile
export function applyMatchToCompanion(
  profile,
  { companionId, placement, numPlayers = 4, styleTags = [], treasureJustCleared = false }
) {
  // ---- 1. companion exp 加算 ----
  const bonds = { ...(profile.companionBonds ?? {}) };
  const current = bonds[companionId] ?? { level: 1, exp: 0 };

  // 着順ごとの exp 配分（仕様§4）
  // ラスを最初に判定してから中間順位を評価する（2人戦で placement===1 が "2位" に誤判定されないように）。
  const isLast   = placement === numPlayers - 1;
  const is3rd    = placement === numPlayers - 2 && numPlayers >= 4; // 4人戦のみ3位が存在
  const baseExp =
    placement === 0 ? 12 :   // 1位
    isLast          ? 2  :   // ラス（何人でも最下位）
    is3rd           ? 3  :   // 3位（4人戦）
                      6;    // 2位（3人/4人戦の中間）
  const expGain = baseExp + (treasureJustCleared ? 120 : 0);

  // 累積 exp → level 再計算
  const prevTotalExp = accumulateExp(current.level, current.exp);
  const newTotalExp = prevTotalExp + expGain;
  const { level: newLevel, exp: newExp } = companionLevelFromExp(newTotalExp);

  bonds[companionId] = { level: newLevel, exp: newExp };

  // ---- 2. playerHistory 更新 ----
  const hist = { ...(profile.playerHistory ?? defaultPlayerHistory()) };
  const won  = placement === 0;
  const lost = placement === numPlayers - 1;

  const winStreak  = won  ? hist.winStreak + 1  : 0;
  const loseStreak = lost ? hist.loseStreak + 1 : 0;
  const maxWinStreak = Math.max(hist.maxWinStreak ?? 0, winStreak);

  // styleCounts 加算
  const styleCounts = { ...(hist.styleCounts ?? {}) };
  for (const tag of styleTags) {
    styleCounts[tag] = (styleCounts[tag] ?? 0) + 1;
  }

  const newHist = {
    winStreak,
    loseStreak,
    maxWinStreak,
    lastPlacement: placement,
    totalMatches: (hist.totalMatches ?? 0) + 1,
    styleCounts,
  };

  return {
    ...profile,
    companionBonds: bonds,
    playerHistory: newHist,
  };
}

// ── 打ち筋タグ検出 ────────────────────────────────────────────────────────
//
// 1対局のスナップショットから打ち筋タグを返す（仕様§5）。
//
// 引数:
//   player     — game.players[humanIndex]（Player インスタンス or 同形のオブジェクト）
//   lastResult — game.lastResult（和了/流局の最終形）
//
// 戻り値: string[]（重複なし）
//   "riichi"    — リーチ宣言あり
//   "meld"      — 鳴き2つ以上
//   "aggressive"— 自分が和了 or 高打点志向（自分が和了者）
//   "defensive" — 放銃せず & 和了せず（ベタオリ的）
export function detectPlayStyle(player, lastResult) {
  const tags = new Set();

  if (!player || !lastResult) return [];

  // riichi: プレイヤー本人がリーチ宣言していた
  if (player.riichi) tags.add("riichi");

  // meld: 鳴き 2 以上（暗槓は鳴きにカウントしない設計もあるが、melds.length で統一）
  if ((player.melds?.length ?? 0) >= 2) tags.add("meld");

  const playerIdx = player.index ?? -1;

  // aggressive: 自分が和了者
  if (lastResult.winner != null && lastResult.winner === playerIdx) {
    tags.add("aggressive");
  }

  // defensive: 自分が放銃者でなく、かつ和了者でもない（ベタオリ/引き）
  const dealIn = lastResult.loser != null && lastResult.loser === playerIdx;
  const won    = lastResult.winner != null && lastResult.winner === playerIdx;
  if (!dealIn && !won) {
    tags.add("defensive");
  }

  return [...tags];
}

// ── 多用する打ち筋を返す ──────────────────────────────────────────────────
//
// playerHistory.styleCounts の最頻タグを返す。
// 母数不足（totalMatches<5 or 最頻タグの比率<0.4）のうちは null。
//
// 戻り値: string | null
export function topPlayStyle(playerHistory) {
  if (!playerHistory) return null;
  const total = playerHistory.totalMatches ?? 0;
  if (total < 5) return null;

  const counts = playerHistory.styleCounts ?? {};
  const entries = Object.entries(counts);
  if (!entries.length) return null;

  // 最頻タグを探す
  let topTag = null;
  let topCount = 0;
  for (const [tag, cnt] of entries) {
    if (cnt > topCount) { topCount = cnt; topTag = tag; }
  }

  if (!topTag) return null;
  if (topCount / total < 0.4) return null;

  return topTag;
}

// ── 内部ユーティリティ ────────────────────────────────────────────────────

// { level, exp } → 通算 exp（逆変換用。Lv1のbase=0）
function accumulateExp(level, exp) {
  let total = 0;
  const base = GROWTH_TUNING.bondExpPerLevel;
  // Lv1からlevel-1まで蓄積（Lv N を超えるのに必要な exp = base * N）
  for (let lv = 1; lv < level; lv++) {
    total += base * lv;
  }
  return total + exp;
}

// playerHistory の初期値（createDefaultProfile と同期）
export function defaultPlayerHistory() {
  return {
    winStreak: 0,
    loseStreak: 0,
    maxWinStreak: 0,
    lastPlacement: null,
    totalMatches: 0,
    styleCounts: {},
  };
}
