// 雀荘の店トレイト（軸4: 店ごとのハプニング）。
//
// トレイトは「店名 seed」で決定論固定＝同じ店は永遠に同じ性格。日替わり候補に何度か
// 出るうちに「あの店は裏が乗る」とプレイヤーが学習できる（愛着原理の蓄積×固有性）。
// 選択モーダルには hint（噂文）だけを見せ、機械的効果は隠す。場代の金額のみ明示（騙し討ち回避）。
import { makeRng } from "../autobattle/autoBattle.js";

export const PARLOR_TRAITS = [
  { id: "goshugi",  label: "ご祝儀",       hint: "勝つと祝儀が弾むらしい",             soulWinMul: 1.5 },
  { id: "badai",    label: "場代",         hint: "席料を取られるが、実入りは良いとか", entryCost: 80, soulWinMul: 1.3 },
  { id: "makanai",  label: "まかない",     hint: "うまい飯が出るともっぱらの噂",       healMul: 2.0 },
  { id: "uradora",  label: "裏ドラ濃いめ", hint: "やたらドラが乗る卓らしい",           uraRateAdd: 0.20 },
  { id: "kaoyose",  label: "常連の影",     hint: "名のある打ち手が出入りしているとか…", rareGuestAdd: 0.45 },
];

export const TRAIT_CFG = {
  traitRate: 0.55,      // トレイト持ちの店の割合（472 店中 ≒260 店に個性）
  rareGuestBase: 0.06,  // レア客の基礎出現率（試合ごと）
  rareGuestSoul: 200,   // レア客同卓で勝った（2着以内）ときのボーナスソウル／体
  rareGuestLvUp: 2,     // レア客が出た試合の相手 Lv 上乗せ（明確な格上）
  rareGuestHpMul: 2,    // レア客席の点棒倍率（モブと同じHPだと格落ち感が出るため）
};

// 店名からトレイトを決定論で引く（無印の店は null）。
export function traitOfParlor(name) {
  const rng = makeRng(`trait:${name}`);
  if (rng() >= TRAIT_CFG.traitRate) return null;
  return PARLOR_TRAITS[Math.floor(rng() * PARLOR_TRAITS.length)];
}
