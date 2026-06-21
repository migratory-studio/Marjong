// 修行完了データ（CompletedAvatar）— docs/shitei-calendar-and-roguelite.md「修行完了データの分離」。
//
// 卒業した弟子を「対戦/ローグライトで使えるスナップショット」として凍結する純ロジック。
// 能力（skillTemplateId+skillLevel）は凍結、タイプ＝ロールは修行成果（successionResult）で確定済み。
// 保存は profile.completedAvatars[]（最大5枠）。profile 丸ごと保存に乗るので専用テーブルは不要
// （saveProfile の分解で misc(jsonb) に入る）。5枠が埋まったら手動で1枠を選んで入替。
//
// すべて純関数・イミュータブル（UI/保存/通信に非依存）。データマスタ参照のみ（純データ）。

import { presetById } from "../data/avatarPresetMaster.js";
import { skillTemplateById } from "../data/skillTemplateMaster.js";
import { skillRuntimeAbilityParams } from "../data/skillLevelMaster.js";

export const MAX_COMPLETED_AVATARS = 5;

// 弟子（育成中アバター／修行完了データ）→ 対局キャラ（CHARACTER 互換）への共通変換。
//   presetIds → 立ち絵/アイコン、skillTemplateId + skillLevel → 能力（params 付き）。
//   role/color は省略時 attacker/金（マイキャラの既定色）。startPoints＝HP。
// 育成中アバターの avatarToCharacter（main.js）もこれを使う＝変換ロジックの単一情報源。
export function deshiCharFrom(src = {}, startPoints = 25000) {
  const { id, name, profileText, presetIds, skillTemplateId, skillLevel, role, color } = src;
  const icon = presetById(presetIds?.icon)?.assetPath || "";
  const portrait = presetById(presetIds?.standing)?.assetPath || "";
  const tmpl = skillTemplateById(skillTemplateId);
  const abilityId = tmpl?.runtimeAbilityId;
  // スキル Lv → 対局反映（§10.5）: Lv エントリの runtimeParams＋回数上書きを能力 params に。
  const params = tmpl
    ? skillRuntimeAbilityParams(tmpl.levelTableId, skillLevel ?? tmpl.initialSkillLevel ?? 1)
    : {};
  return {
    id: id || "deshi",
    name: name || "弟子",
    reading: "", color: color || "#e0b85a", role: role || "attacker", bio: "",
    profile: profileText || "",
    stats: { startingPoints: startPoints },
    assets: { icon, portrait, voices: {} },
    abilities: abilityId ? [{ abilityId, params }] : [],
  };
}

// 修行完了データ → 対局キャラ。id＝completedAvatarId（CHARACTERS と衝突しない）、ロール＝
// 修行成果で確定した型、既定持ち点＝育てた最大 HP（avatarHpMax）。isCompletedAvatar フラグで
// 「弟子で打っている」ことを識別する（フリー対戦の相棒絆計上スキップ＝案A 等に使う）。
export function completedAvatarToChar(ca, startPoints) {
  const c = deshiCharFrom({
    id: ca?.completedAvatarId,
    name: ca?.name,
    profileText: ca?.profileText,
    presetIds: ca?.presetIds,
    skillTemplateId: ca?.skillTemplateId,
    skillLevel: ca?.skillLevel,
    role: ca?.role,
  }, startPoints ?? ca?.avatarHpMax ?? 25000);
  return { ...c, isCompletedAvatar: true };
}

// アクティブ弟子＋修行成果から卒業スナップショットを作る。
//   result＝evaluateSuccession(profile, av) の戻り（rank/role/months/wins/treasures）。
//   completedAt＝ISO文字列（呼び出し側で new Date().toISOString() を渡す）。
export function buildCompletedAvatar(av, result, completedAt = "") {
  return {
    completedAvatarId: `completed-${av.avatarId}`,
    sourceAvatarId: av.avatarId,
    completedAt,
    // 見た目・人物
    name: av.name,
    profileText: av.profileText || "",
    mentorCharacterId: av.mentorCharacterId,
    presetIds: { ...(av.presetIds || {}) },
    // 戦闘（凍結）
    skillTemplateId: av.skillTemplateId,
    skillLevel: av.skillLevel,
    params6: { ...(av.params6 || {}) },
    avatarLevel: av.avatarLevel,
    avatarHpMax: av.avatarHpMax,
    bondLevel: av.bondLevel ?? 1,
    // タイプ（ロール）＋成果
    role: result?.role || "attacker",
    roleLabel: result?.roleLabel || "",
    result: {
      rank: result?.rank || "満貫級",
      rankIdx: result?.rankIdx ?? 3,
      clearMonths: result?.months ?? (result?.clearMonths ?? 0),
      treasures: result?.treasures ?? 0,
      wins: result?.wins ?? 0,
    },
  };
}

// 完了データを profile に追加（5枠管理）。
//   - 同一 sourceAvatarId が既にあれば上書き（同じ弟子の再卒業）。
//   - 5枠未満なら追加。
//   - 5枠が埋まっていて replaceId 未指定なら追加せず needsReplace を返す（UIで入替先を選ぶ）。
//   - replaceId 指定なら、その枠を置換。
// 戻り値: { profile, saved, needsReplace }
export function addCompletedAvatar(profile, ca, replaceId = null) {
  const list = [...(profile.completedAvatars || [])];

  const existIdx = list.findIndex((c) => c.sourceAvatarId === ca.sourceAvatarId);
  if (existIdx >= 0) {
    list[existIdx] = ca;
    return { profile: { ...profile, completedAvatars: list }, saved: true, needsReplace: false };
  }

  if (list.length < MAX_COMPLETED_AVATARS) {
    list.push(ca);
    return { profile: { ...profile, completedAvatars: list }, saved: true, needsReplace: false };
  }

  if (replaceId) {
    const ri = list.findIndex((c) => c.completedAvatarId === replaceId);
    if (ri >= 0) {
      list[ri] = ca;
      return { profile: { ...profile, completedAvatars: list }, saved: true, needsReplace: false };
    }
  }

  // 満杯＋入替先未指定＝UIで1枠選んでもらう。
  return { profile, saved: false, needsReplace: true };
}

// 卒業した弟子をアーカイブ（修行中データに graduated フラグを立てる）。
// 完全削除はしない＝後から見返せる。弟子一覧の表示分けは別途（呼び出し側）。
export function markGraduated(profile, avatarId) {
  return {
    ...profile,
    avatars: (profile.avatars || []).map((a) => (a.avatarId === avatarId ? { ...a, graduated: true } : a)),
  };
}
