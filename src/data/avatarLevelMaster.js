// キャラ Lv マスタ（HP 成長 + 成長段階）— major_update_specification.md §10.2 / §16.2。
//
// 初期 MVP の育成は「HP 強化」と「スキル Lv 強化」を個別購入する方式（§10.2）。
// キャラ Lv は §10.2 のとおり「節目解放と成長段階の表示」に使い、本マスタでは
// 1 段階上げるごとに最大 HP（avatarHpMax）を引き上げる HP 成長トラックを兼ねる。
//
// soulCost はその Lv へ「到達する」ための費用（Lv1 は初期状態なので 0）。
// avatarHpMax はその Lv 到達時点の最大 HP。Lv1 は avatarFactory の初期 HP に一致させる。
// unlockIds は将来のアイテム枠・絆補正などの解放要素（Phase 5 以降）。今は空配列。
export const AVATAR_LEVEL_MASTER = [
  { avatarLevel: 1, soulCost: 0, avatarHpMax: 20000, unlockIds: [] },
  { avatarLevel: 2, soulCost: 200, avatarHpMax: 22000, unlockIds: [] },
  { avatarLevel: 3, soulCost: 300, avatarHpMax: 24000, unlockIds: [] },
  { avatarLevel: 4, soulCost: 400, avatarHpMax: 26000, unlockIds: [] },
  { avatarLevel: 5, soulCost: 600, avatarHpMax: 28000, unlockIds: [] },
  { avatarLevel: 6, soulCost: 800, avatarHpMax: 30000, unlockIds: [] },
  { avatarLevel: 7, soulCost: 1000, avatarHpMax: 32000, unlockIds: [] },
  { avatarLevel: 8, soulCost: 1300, avatarHpMax: 34000, unlockIds: [] },
  { avatarLevel: 9, soulCost: 1600, avatarHpMax: 36000, unlockIds: [] },
  { avatarLevel: 10, soulCost: 2000, avatarHpMax: 40000, unlockIds: [] },
];

export function avatarLevelEntry(level) {
  return AVATAR_LEVEL_MASTER.find((e) => e.avatarLevel === level) || null;
}

// 次の Lv のエントリ（最大なら null）。育成画面の「強化できるか/費用」表示に使う。
export function nextAvatarLevel(level) {
  return AVATAR_LEVEL_MASTER.find((e) => e.avatarLevel === level + 1) || null;
}

export function maxAvatarLevel() {
  return AVATAR_LEVEL_MASTER[AVATAR_LEVEL_MASTER.length - 1].avatarLevel;
}
