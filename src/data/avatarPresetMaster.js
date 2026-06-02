// マイキャラ見た目プリセットマスタ — major_update_specification.md §8.2 / §16.2。
//
// 初期はプリセット選択式（自由アップロードなし）。保存するのは presetId だけで、
// 画像本体は静的ファイル配信（または CSS 値）に解決する。マイキャラ専用素材は未制作のため、
// 当面は既存キャラ画像の流用（icon / standing）＋ CSS（background / frame）で構成する。
// 専用素材が用意できたら assetPath を差し替えるだけで済む。
//
// presetType: "icon" | "standing" | "background" | "frame"
//   - icon / standing … assetPath に画像パス（無ければ後でフォールバック描画）
//   - background      … css に CSS background 値
//   - frame           … css に枠色（CSS color）
import { CHARACTER_MASTER } from "./characterMaster.js";

// 既存13キャラのアイコン／立ち絵を流用したプリセット（流用元キャラ名を表示名に使う）。
const charIconPresets = CHARACTER_MASTER.map((c, i) => ({
  presetId: `icon-${c.id}`,
  presetType: "icon",
  name: c.name,
  assetPath: `graphic/chars/${c.id}/icon.png`,
  rarity: "normal",
  unlockConditions: [],
  isPaid: false,
  isDefault: i < 6, // 先頭6体を初期所持にしておく（全員解放でも可、ここでは控えめに）
}));

const charStandingPresets = CHARACTER_MASTER.map((c, i) => ({
  presetId: `standing-${c.id}`,
  presetType: "standing",
  name: c.name,
  assetPath: `graphic/chars/${c.id}/portrait.png`,
  // 立ち絵の切り抜き基準（characterMaster.portraitPos があれば踏襲）
  objectPosition: c.portraitPos || "top center",
  rarity: "normal",
  unlockConditions: [],
  isPaid: false,
  isDefault: i < 6,
}));

const backgroundPresets = [
  { presetId: "bg-dojo",       name: "道場",     css: "linear-gradient(160deg,#2a2018 0%,#3c2c20 55%,#1c140e 100%)", isDefault: true },
  { presetId: "bg-dojo-night", name: "道場（夜）", css: "linear-gradient(160deg,#10141f 0%,#1b2233 60%,#0a0d15 100%)", isDefault: true },
  { presetId: "bg-table",      name: "卓上",     css: "radial-gradient(circle at 50% 40%,#246048 0%,#163a2b 80%)",   isDefault: true },
  { presetId: "bg-street",     name: "街角",     css: "linear-gradient(160deg,#33384a 0%,#4a5168 60%,#20242f 100%)", isDefault: true },
].map((p) => ({ presetType: "background", rarity: "normal", unlockConditions: [], isPaid: false, ...p }));

const framePresets = [
  { presetId: "frame-gold",   name: "金",   css: "#f6b352", isDefault: true },
  { presetId: "frame-jade",   name: "翠",   css: "#7bb274", isDefault: true },
  { presetId: "frame-azure",  name: "蒼",   css: "#4ea1d3", isDefault: true },
  { presetId: "frame-rose",   name: "緋",   css: "#e85d75", isDefault: true },
  { presetId: "frame-violet", name: "菫",   css: "#a78bfa", isDefault: true },
].map((p) => ({ presetType: "frame", rarity: "normal", unlockConditions: [], isPaid: false, ...p }));

export const AVATAR_PRESET_MASTER = [
  ...charIconPresets,
  ...charStandingPresets,
  ...backgroundPresets,
  ...framePresets,
];

export function presetsOfType(presetType) {
  return AVATAR_PRESET_MASTER.filter((p) => p.presetType === presetType);
}

export function presetById(presetId) {
  return AVATAR_PRESET_MASTER.find((p) => p.presetId === presetId) || null;
}

// 初期所持プリセットID（isDefault）。新規プロフィール作成時に unlockedPresetIds へ入れる。
export function defaultPresetIds() {
  return AVATAR_PRESET_MASTER.filter((p) => p.isDefault).map((p) => p.presetId);
}

// 各種別の既定（先頭の初期所持プリセット）。マイキャラ作成フォームの初期選択に使う。
export function defaultPresetIdForType(presetType) {
  const found = AVATAR_PRESET_MASTER.find((p) => p.presetType === presetType && p.isDefault);
  return found ? found.presetId : null;
}
