// 相棒絆レベルアップ報酬 — マスタドリブン。[[bond-display-hybrid-policy]] / [[orb-shop-system]]
//
// 「無二の相棒」(Lv8) を関係の頂点＝意味の到達点とし、そこまでは演出のみ。
// Lv9 以降は絆を上げ続ける実感を「宝珠」で返す（Lvは無限に伸びる・逓増）。
// 報酬は type で付与処理を分岐＝宝珠以外（背景/BGM/ボイス解禁など）も後から足せる拡張型。
//
// 付与のタイミングは「対戦ホームでレベルアップ演出を見た瞬間」（celebratedLevel 消化時）。
// 仕様: 演出＝そのキャラを相棒にした対戦ホームで出す（companionBond.js の consume 系が使う）。

// Lv → 報酬定義。値はマスタで固定（20〜30を手で制御）。無限に伸びるので上限Lv以降は据え置き。
const BOND_REWARDS = {
  9:  { type: "orb", amount: 20 },
  10: { type: "orb", amount: 22 },
  11: { type: "orb", amount: 24 },
  12: { type: "orb", amount: 26 },
  13: { type: "orb", amount: 28 },
  14: { type: "orb", amount: 30 },
};
// Lv15 以降（＝BOND_REWARDS 未定義の高Lv）はこの既定値で据え置く。
const HIGH_LEVEL_DEFAULT = { type: "orb", amount: 30 };

// 到達 Lv の報酬を返す。Lv8 までは報酬なし（演出のみ）＝ null。
export function bondRewardForLevel(level) {
  const lv = Number(level) || 0;
  if (lv < 9) return null;
  return BOND_REWARDS[lv] || HIGH_LEVEL_DEFAULT;
}

// 報酬付与のディスパッチャ（純関数・新しい profile を返す）。type ごとに付与先を分岐。
// 未知 type は無視（前方互換）。将来: "bg"→unlockedBackgrounds, "bgm"→unlockedBgms, "voice" など。
export function applyBondReward(profile, reward) {
  if (!profile || !reward) return profile;
  switch (reward.type) {
    case "orb":
      return { ...profile, orbs: (profile.orbs | 0) + (Number(reward.amount) | 0) };
    default:
      return profile;
  }
}

// 報酬の短い表示ラベル（演出・トースト用）。type ごとに人が読める文言へ。
export function bondRewardLabel(reward) {
  if (!reward) return "";
  switch (reward.type) {
    case "orb": return `宝珠 +${Number(reward.amount) | 0}`;
    default:    return "";
  }
}
