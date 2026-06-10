// シナリオ既読・初回報酬 — major_update_specification.md §12.6 / Phase 3。
//
// 既読状態は profile.scenarioProgress（{ scenarioId, readAt, version }[]）で持つ。
// 初回読了報酬は rewardService.grantSoulOnce（rewardLedger）で二重付与を防ぐ。
// 師匠の bond シナリオは初回読了で絆経験値も入る（物語の節目＝距離が縮まる。
// 「読む → 絆が育つ → 次の章が近づく」の循環をつくる・GROWTH_TUNING.scenarioBondExp）。
// すべて不変更新。保存は呼び出し側（screen）が repository.saveProfile で行う。
import { grantSoulOnce } from "./rewardService.js";
import { activeAvatar } from "./avatarFactory.js";
import { GROWTH_TUNING, gainBond } from "./progressionService.js";
import { SCENARIO_MASTER } from "../data/scenarioMaster.js";
import { buildUnlockContext, evaluateUnlock } from "../scenario/unlockEvaluator.js";

const ledgerKey = (scenarioId) => `scenario-first-read:${scenarioId}`;

export function isScenarioRead(profile, scenarioId) {
  return (profile?.scenarioProgress || []).some((p) => p.scenarioId === scenarioId);
}

// シナリオを既読化し、初回だけ firstReadReward.soul と（師匠の bond シナリオなら）絆を付与する。
// 返り値: { profile, firstRead, soul, bondUp }。既読なら profile 不変・firstRead=false。
export function markScenarioRead(profile, scenario) {
  const id = scenario.scenarioId;
  if (isScenarioRead(profile, id)) return { profile, firstRead: false, soul: 0, bondUp: false };

  let progressed = {
    ...profile,
    scenarioProgress: [
      ...(profile.scenarioProgress || []),
      { scenarioId: id, readAt: new Date().toISOString(), version: scenario.scenarioVersion ?? 1 },
    ],
  };

  // 絆: 自分の師匠の bond シナリオを初めて読んだときだけ。
  const av = activeAvatar(progressed);
  let bondUp = false;
  if (av && scenario.scenarioType === "bond" && scenario.mentorCharacterId === av.mentorCharacterId) {
    const bond = gainBond(av, GROWTH_TUNING.scenarioBondExp);
    bondUp = bond.bondUp;
    progressed = {
      ...progressed,
      avatars: (progressed.avatars || []).map((a) =>
        a.avatarId === av.avatarId ? { ...a, bondLevel: bond.bondLevel, bondExp: bond.bondExp } : a),
    };
  }

  const amount = scenario.firstReadReward?.soul ?? 0;
  const { profile: next, granted } = grantSoulOnce(progressed, ledgerKey(id), amount);
  return { profile: next, firstRead: granted, soul: granted ? amount : 0, bondUp };
}

// ------------------------------------------------- 解禁済み・未読の章（モーダル通知と大会ゲートの共通土台）

// アクティブ師匠の bond 章のうち「解禁済みなのに未読」のもの（sortOrder 順）。
// 前話読了が条件に入っているため、通常は高々1件（イベント章は対象外）。
export function unlockedUnreadScenarios(profile) {
  const av = activeAvatar(profile);
  if (!av) return [];
  const ctx = buildUnlockContext(profile);
  return SCENARIO_MASTER
    .filter((s) => s.isEnabled && s.scenarioType === "bond" && s.mentorCharacterId === av.mentorCharacterId)
    .filter((s) => !isScenarioRead(profile, s.scenarioId) && evaluateUnlock(s, ctx).unlocked)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// 大会ストーリーゲート：前の大会優勝（tournament_won）で解禁された章が未読なら、
// その章を返す（＝読むまで次の大会に挑めない）。なければ null。
export function tournamentStoryGate(profile) {
  return unlockedUnreadScenarios(profile)
    .find((s) => (s.unlockConditions || []).some((c) => c.type === "tournament_won")) || null;
}

// 解禁通知（モーダル）をまだ出していない章。出したら markUnlockNotified で記録する。
export function unnotifiedUnlocks(profile) {
  const seen = new Set(profile?.scenarioUnlockNotified || []);
  return unlockedUnreadScenarios(profile).filter((s) => !seen.has(s.scenarioId));
}

export function markUnlockNotified(profile, scenarioIds) {
  const seen = new Set([...(profile?.scenarioUnlockNotified || []), ...scenarioIds]);
  return { ...profile, scenarioUnlockNotified: [...seen] };
}

// 「第n話」表示用：師匠の bond 章リスト内での話数（1始まり）。見つからなければ null。
export function episodeNumberOf(profile, scenarioId) {
  const av = activeAvatar(profile);
  if (!av) return null;
  const list = SCENARIO_MASTER
    .filter((s) => s.isEnabled && s.scenarioType === "bond" && s.mentorCharacterId === av.mentorCharacterId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const idx = list.findIndex((s) => s.scenarioId === scenarioId);
  return idx >= 0 ? idx + 1 : null;
}
