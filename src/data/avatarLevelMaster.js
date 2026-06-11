// キャラ Lv マスタ（HP 成長 + 成長段階）— major_update_specification.md §10.2 / §16.2。
//
// 初期 MVP の育成は「HP 強化」と「スキル Lv 強化」を個別購入する方式（§10.2）。
// キャラ Lv は §10.2 のとおり「節目解放と成長段階の表示」に使い、本マスタでは
// 1 段階上げるごとに最大 HP（avatarHpMax）を引き上げる HP 成長トラックを兼ねる。
//
// soulCost はその Lv へ「到達する」ための費用（Lv1 は初期状態なので 0）。
// avatarHpMax はその Lv 到達時点の最大 HP。Lv1 は avatarFactory の初期 HP に一致させる。
// unlockIds は将来のアイテム枠・絆補正などの解放要素（Phase 5 以降）。今は空配列。
// HP（点棒）は小さい数字で「奪い合い」を体感させる方針（§4.6.6 経済再調整）。
// 初期は低く（Lv1=5,500）、育成（キャラ Lv）で徐々に上げる＝高打点に耐えられるようになる。
export const AVATAR_LEVEL_MASTER = [
  { avatarLevel: 1, soulCost: 0, avatarHpMax: 5500, unlockIds: [] },
  { avatarLevel: 2, soulCost: 200, avatarHpMax: 7000, unlockIds: [] },
  { avatarLevel: 3, soulCost: 300, avatarHpMax: 8500, unlockIds: [] },
  { avatarLevel: 4, soulCost: 400, avatarHpMax: 10000, unlockIds: [] },
  { avatarLevel: 5, soulCost: 600, avatarHpMax: 12000, unlockIds: [] },
  { avatarLevel: 6, soulCost: 800, avatarHpMax: 14000, unlockIds: [] },
  { avatarLevel: 7, soulCost: 1000, avatarHpMax: 16500, unlockIds: [] },
  { avatarLevel: 8, soulCost: 1300, avatarHpMax: 19000, unlockIds: [] },
  { avatarLevel: 9, soulCost: 1600, avatarHpMax: 22000, unlockIds: [] },
  { avatarLevel: 10, soulCost: 2000, avatarHpMax: 26000, unlockIds: [] },
  // Lv11〜20: 覇道編〜九蓮宝士後の長期育成枠（師弟編中にカンストしない逃がし）。
  // HP はグンと伸ばす方針（点棒＝HP の「厚み」。大会の宝は増減で決まるので勝ち確にはならない）。
  // Lv11〜20 は「宝の解禁制」: 宝（大会優勝）を1つ獲るたびに上限が1つ開く（requireTreasures）。
  //   - 物語との融合: 宝を集めるほど打ち手の“器”が広がる（点棒＝HP＝器）。
  //   - 経済との両立: 購入機会が宝1個ごとに分散するので、スキルLv（超越帯・計28,800）と
  //     財布を食い合わず、どちらも終盤までに完走できる（回帰=test/leveldesign.mjs）。
  { avatarLevel: 11, soulCost: 1200, avatarHpMax: 29500, requireTreasures: 2, unlockIds: [] },
  { avatarLevel: 12, soulCost: 1400, avatarHpMax: 33000, requireTreasures: 3, unlockIds: [] },
  { avatarLevel: 13, soulCost: 1600, avatarHpMax: 36500, requireTreasures: 4, unlockIds: [] },
  { avatarLevel: 14, soulCost: 1800, avatarHpMax: 40000, requireTreasures: 5, unlockIds: [] },
  { avatarLevel: 15, soulCost: 2000, avatarHpMax: 44000, requireTreasures: 6, unlockIds: [] },
  { avatarLevel: 16, soulCost: 2200, avatarHpMax: 48000, requireTreasures: 7, unlockIds: [] },
  { avatarLevel: 17, soulCost: 2400, avatarHpMax: 52000, requireTreasures: 8, unlockIds: [] },
  { avatarLevel: 18, soulCost: 2600, avatarHpMax: 56000, requireTreasures: 9, unlockIds: [] },
  { avatarLevel: 19, soulCost: 2800, avatarHpMax: 60500, requireTreasures: 9, unlockIds: [] },
  { avatarLevel: 20, soulCost: 3000, avatarHpMax: 65000, requireTreasures: 9, unlockIds: [] },
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
