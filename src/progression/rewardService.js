// 報酬・ウォレット操作の集約 — major_update_specification.md §17.5 / §19.6。
//
// ソウル増減と報酬台帳（rewardLedger）の更新をここに集約する。Phase 6 で
// サーバー検証（§19.6: ウォレットと報酬台帳はクライアントから直接更新させない）へ
// 差し替えるとき、呼び出し側を変えずに本サービスだけ置き換えられるようにする。
//
// すべて不変更新（新しい profile を返す）。Phase 2B では休憩のソウル付与や
// 育成・能力変更の支払いがここを通る。シナリオ初回報酬の二重付与防止（§12.6）も
// rewardLedger 経由でここに集約する（Phase 3 から利用）。

// ソウル消費。残高不足は例外（呼び出し側で UI に出す）。
export function spendSoul(profile, amount) {
  if (!(amount >= 0)) throw new Error("spendSoul: amount は 0 以上である必要があります");
  const have = profile.wallet?.soul ?? 0;
  if (have < amount) throw new Error("ソウルが足りません");
  return { ...profile, wallet: { ...(profile.wallet || {}), soul: have - amount } };
}

// ソウル付与。負値は 0 に丸める。
export function grantSoul(profile, amount) {
  const have = profile.wallet?.soul ?? 0;
  return { ...profile, wallet: { ...(profile.wallet || {}), soul: have + Math.max(0, amount) } };
}

// 報酬台帳に ledgerKey があるか（= すでに付与済みか）。
export function hasReward(profile, ledgerKey) {
  return (profile.rewardLedger || []).includes(ledgerKey);
}

// ledgerKey 単位で 1 回だけソウルを付与する（§12.6 二重付与防止）。
// 既に付与済みなら { profile, granted:false } を返し、ソウルも台帳も変えない。
export function grantSoulOnce(profile, ledgerKey, amount) {
  if (hasReward(profile, ledgerKey)) return { profile, granted: false };
  const ledgered = { ...profile, rewardLedger: [...(profile.rewardLedger || []), ledgerKey] };
  return { profile: grantSoul(ledgered, amount), granted: true };
}
