// 能力変更コストマスタ — major_update_specification.md §10.6 / §16.2。
//
// 能力種類変更のソウル費用。式は §10.6:
//   soulCost = baseCost
//            + avatarLevel       * levelCoefficient
//            + currentSkillLevel * skillLevelCoefficient
//            + targetRarityCost
// 変更後はスキル Lv を初期値（Lv1）へ戻すので、currentSkillLevel が高いほど
// （= 育てた能力を捨てるほど）費用が上がる調整意図。
export const ABILITY_CHANGE_COST_MASTER = {
  baseCost: 300,
  levelCoefficient: 50,
  skillLevelCoefficient: 80,
  rarityCosts: { normal: 0, rare: 200, epic: 400, legendary: 600 },
};

export function abilityChangeCost({ avatarLevel = 1, currentSkillLevel = 1, targetRarity = "normal" } = {}) {
  const m = ABILITY_CHANGE_COST_MASTER;
  const rarityCost = m.rarityCosts[targetRarity] ?? 0;
  return (
    m.baseCost +
    avatarLevel * m.levelCoefficient +
    currentSkillLevel * m.skillLevelCoefficient +
    rarityCost
  );
}
