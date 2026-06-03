// シナリオ既読・初回報酬 — major_update_specification.md §12.6 / Phase 3。
//
// 既読状態は profile.scenarioProgress（{ scenarioId, readAt, version }[]）で持つ。
// 初回読了報酬は rewardService.grantSoulOnce（rewardLedger）で二重付与を防ぐ。
// すべて不変更新。保存は呼び出し側（screen）が repository.saveProfile で行う。
import { grantSoulOnce } from "./rewardService.js";

const ledgerKey = (scenarioId) => `scenario-first-read:${scenarioId}`;

export function isScenarioRead(profile, scenarioId) {
  return (profile?.scenarioProgress || []).some((p) => p.scenarioId === scenarioId);
}

// シナリオを既読化し、初回だけ firstReadReward.soul を 1 回付与する。
// 返り値: { profile, firstRead, soul }。既読なら profile 不変・firstRead=false。
export function markScenarioRead(profile, scenario) {
  const id = scenario.scenarioId;
  if (isScenarioRead(profile, id)) return { profile, firstRead: false, soul: 0 };

  const progressed = {
    ...profile,
    scenarioProgress: [
      ...(profile.scenarioProgress || []),
      { scenarioId: id, readAt: new Date().toISOString(), version: scenario.scenarioVersion ?? 1 },
    ],
  };
  const amount = scenario.firstReadReward?.soul ?? 0;
  const { profile: next, granted } = grantSoulOnce(progressed, ledgerKey(id), amount);
  return { profile: next, firstRead: granted, soul: granted ? amount : 0 };
}
