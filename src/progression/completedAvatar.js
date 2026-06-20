// 修行完了データ（CompletedAvatar）— docs/shitei-calendar-and-roguelite.md「修行完了データの分離」。
//
// 卒業した弟子を「対戦/ローグライトで使えるスナップショット」として凍結する純ロジック。
// 能力（skillTemplateId+skillLevel）は凍結、タイプ＝ロールは修行成果（successionResult）で確定済み。
// 保存は profile.completedAvatars[]（最大5枠）。profile 丸ごと保存に乗るので専用テーブルは不要
// （saveProfile の分解で misc(jsonb) に入る）。5枠が埋まったら手動で1枠を選んで入替。
//
// すべて純関数・イミュータブル（UI/保存/通信に非依存）。

export const MAX_COMPLETED_AVATARS = 5;

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
