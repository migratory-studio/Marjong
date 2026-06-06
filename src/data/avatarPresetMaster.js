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

// ── 弟子（マイキャラ）専用グラフィック ───────────────────────────────────────
// アイコン（graphic/chars/deshi_set/icon/）と立ち絵（同 standing/）は同じ番号で1対1に対応し、
// プリセット選択時は必ずペアで設定する（DESHI_PRESET_SETS が選択単位）。
// アイコン/立ち絵を個別に差し替えるのは画像アップロード機能の実装後に解禁する想定で、
// それまでマイキャラ作成画面では個別UIをグレーアウトする。
const DESHI_IDS = Array.from({ length: 11 }, (_, i) => i + 1);

const deshiIconPresets = DESHI_IDS.map((n) => ({
  presetId: `deshi-${n}-icon`,
  presetType: "icon",
  name: `弟子 ${n}`,
  assetPath: `graphic/chars/deshi_set/icon/deshi_${n}.png`,
  rarity: "normal",
  unlockConditions: [],
  isPaid: false,
  isDefault: true,
}));

const deshiStandingPresets = DESHI_IDS.map((n) => ({
  presetId: `deshi-${n}-standing`,
  presetType: "standing",
  name: `弟子 ${n}`,
  assetPath: `graphic/chars/deshi_set/standing/deshi_${n}.png`,
  objectPosition: "top center",
  rarity: "normal",
  unlockConditions: [],
  isPaid: false,
  isDefault: true,
}));

// アイコン＋立ち絵をセットにした「弟子グラフィック」プリセット。作成画面はこの単位で選ぶ。
export const DESHI_PRESET_SETS = DESHI_IDS.map((n) => ({
  setId: `deshi-${n}`,
  name: `弟子 ${n}`,
  iconPresetId: `deshi-${n}-icon`,
  standingPresetId: `deshi-${n}-standing`,
  thumbPath: `graphic/chars/deshi_set/icon/deshi_${n}.png`,
}));

// アイコン presetId から対応する弟子セットを引く（作成画面の選択状態判定に使う）。
export function deshiSetByIconPresetId(iconPresetId) {
  return DESHI_PRESET_SETS.find((s) => s.iconPresetId === iconPresetId) || null;
}

const framePresets = [
  { presetId: "frame-gold",   name: "金",   css: "#f6b352", isDefault: true },
  { presetId: "frame-jade",   name: "翠",   css: "#7bb274", isDefault: true },
  { presetId: "frame-azure",  name: "蒼",   css: "#4ea1d3", isDefault: true },
  { presetId: "frame-rose",   name: "緋",   css: "#e85d75", isDefault: true },
  { presetId: "frame-violet", name: "菫",   css: "#a78bfa", isDefault: true },
].map((p) => ({ presetType: "frame", rarity: "normal", unlockConditions: [], isPaid: false, ...p }));

export const AVATAR_PRESET_MASTER = [
  // 弟子専用グラフィックを先頭に置き、icon/standing の既定（defaultPresetIdForType）が弟子1になるようにする。
  ...deshiIconPresets,
  ...deshiStandingPresets,
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
