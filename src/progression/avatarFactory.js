// マイキャラ（UserAvatar）の組み立て — major_update_specification.md §17.2 / §10。
//
// Phase 2A は「作成して保存する」までを担う純粋関数。育成（Lv/HP/スキル強化）と
// ソウル増減の検証ロジックは Phase 2B の ProgressionService / RewardService で扱う。
//
// 初期値は仕様で数値未確定（§25）のため、ここに仮値を集約してチューニングしやすくする。
import { skillTemplateById } from "../data/skillTemplateMaster.js";

// 仮の初期値（バランス調整で動かす想定の単一の出どころ）
export const AVATAR_DEFAULTS = {
  creationSoulBonus: 500, // 初回作成ボーナス（§10.1）
  avatarLevel: 1,
  avatarHpMax: 5500, // 育成 HP の初期値（小さい数字で点棒の奪い合いを体感／§4.6.6・avatarLevelMaster Lv1 と一致）
  bondLevel: 1,
  bondExp: 0,
  itemSlotCount: 0,
  // オートバトル用 6 パラメータの初期値（§4.6.1）。低めスタートで育成の伸びしろを残す。
  // 全員フラット（＝のっぺり）を避けるため、ベースを基準にして型ごとに配分を傾ける（initialParams6）。
  // 合計は従来（≈70）を維持して初戦の出場ゲートを通せる強さを保つ（base10×6 + 6 + 4 = 70）。
  params6: { fire: 10, guard: 10, read: 10, gamble: 10, speed: 10, mental: 10 },
};

// 型（スキルテンプレート）ごとの初期ステ偏り。主 +PRIMARY / 副 +SECONDARY を加算して個性を立てる。
const AFFINITY_PRIMARY = 6;
const AFFINITY_SECONDARY = 4;

// 型に応じて配分を傾けた初期 6 パラメータを返す（作成確認プレビューと本生成で同じ値を使う）。
export function initialParams6(skillTemplateId) {
  const base = { ...AVATAR_DEFAULTS.params6 };
  const tmpl = skillTemplateById(skillTemplateId);
  const aff = tmpl?.paramAffinity || [];
  if (aff[0] && base[aff[0]] != null) base[aff[0]] += AFFINITY_PRIMARY;
  if (aff[1] && base[aff[1]] != null) base[aff[1]] += AFFINITY_SECONDARY;
  return base;
}

// アバターの 6 パラメータを安全に取り出す（旧データ・未設定は既定値で補完）。
export function avatarParams6(avatar) {
  return { ...AVATAR_DEFAULTS.params6, ...(avatar?.params6 || {}) };
}

// ざっくり一意な ID（crypto.randomUUID が無い環境でも動く簡易版）。
function genId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// 新規 UserAvatar を組み立てる（保存は呼び出し側 repository が行う）。
//   opts: { name, profileText, mentorCharacterId, skillTemplateId, presetIds }
//   presetIds: { icon, standing, background, frame }
export function buildNewAvatar({ name, profileText = "", mentorCharacterId, skillTemplateId, presetIds = {} }) {
  if (!name || !name.trim()) throw new Error("buildNewAvatar: name は必須です");
  if (!mentorCharacterId) throw new Error("buildNewAvatar: mentorCharacterId は必須です");
  const tmpl = skillTemplateById(skillTemplateId);
  if (!tmpl) throw new Error(`buildNewAvatar: 未知の skillTemplateId: ${skillTemplateId}`);
  if (!tmpl.mentorCharacterIds.includes(mentorCharacterId))
    throw new Error("buildNewAvatar: 選んだ能力種類はこの師匠では選べません");

  const now = new Date().toISOString();
  return {
    avatarId: genId("avatar"),
    name: name.trim(),
    profileText: String(profileText || "").trim(),
    mentorCharacterId,
    skillTemplateId,
    skillLevel: tmpl.initialSkillLevel ?? 1, // 育成開始は Lv1（§10.5）
    avatarLevel: AVATAR_DEFAULTS.avatarLevel,
    avatarHpMax: AVATAR_DEFAULTS.avatarHpMax,
    avatarHpCurrent: AVATAR_DEFAULTS.avatarHpMax, // 満タンで開始
    bondLevel: AVATAR_DEFAULTS.bondLevel,
    bondExp: AVATAR_DEFAULTS.bondExp,
    itemSlotCount: AVATAR_DEFAULTS.itemSlotCount,
    params6: initialParams6(skillTemplateId), // 型ごとに配分を傾けた初期ステ（§4.6.1）

    equippedItemInstanceIds: [],
    presetIds: {
      icon: presetIds.icon ?? null,
      standing: presetIds.standing ?? null,
      background: presetIds.background ?? null,
      frame: presetIds.frame ?? null,
    },
    abilityChangedCount: 0,
    // 弟子ごとに独立な進行状態（既読/段位/育成日数）。新弟子はゼロから（[[avatarRun]]）。
    run: { scenarioProgress: [], records: {}, daily: {} },
    createdAt: now,
    updatedAt: now,
  };
}

// 新規マイキャラをプロフィールへ反映した「新しいプロフィール」を返す（不変更新）。
// 初回作成ボーナスのソウルを加算し、activeAvatarId を設定する。
export function addAvatarToProfile(profile, avatar) {
  return {
    ...profile,
    activeAvatarId: avatar.avatarId,
    avatars: [...(profile.avatars || []), avatar],
    wallet: { ...(profile.wallet || {}), soul: (profile.wallet?.soul ?? 0) + AVATAR_DEFAULTS.creationSoulBonus },
    // 新弟子をアクティブにする＝進行状態の作業コピーも初期化（新弟子の run は空）。
    // これが無いと保存時の flush で旧弟子の進行が新弟子へ写ってしまう（[[avatarRun]]）。
    scenarioProgress: [],
    records: {},
    daily: {},
  };
}

export function activeAvatar(profile) {
  if (!profile || !profile.activeAvatarId) return null;
  return (profile.avatars || []).find((a) => a.avatarId === profile.activeAvatarId) || null;
}
