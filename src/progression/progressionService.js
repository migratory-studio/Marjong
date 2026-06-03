// 育成サービス — major_update_specification.md §10 / §11 / Phase 2B。
//
// 画面 → ProgressionService → ProfileRepository（§19.3）の中段。マイキャラの
// 休憩・HP 成長（キャラ Lv）・スキル Lv 強化・能力変更といった「ルール込みの
// プロフィール変換」をここに集約する。すべて純粋＆不変更新で、新しい profile を
// 返すか、不正な操作（ソウル不足・最大 Lv・日次制限）で例外を投げる。保存は
// 呼び出し側（screen）が repository.saveProfile() で行う。
//
// 対局エンジンには一切触れない（§3.1: エンジンに育成/報酬/保存の責務を持たせない）。
import { activeAvatar } from "./avatarFactory.js";
import { spendSoul, grantSoul } from "./rewardService.js";
import { skillTemplateById, templatesForMentor } from "../data/skillTemplateMaster.js";
import { nextAvatarLevel } from "../data/avatarLevelMaster.js";
import { nextSkillLevel } from "../data/skillLevelMaster.js";
import { abilityChangeCost } from "../data/abilityChangeCostMaster.js";

// 育成の調整値（バランス調整で動かす単一の出どころ）。
export const GROWTH_TUNING = {
  rest: {
    healRatio: 0.5, // 1 回の休憩で最大 HP の何割を回復するか
    soul: 80, // 休憩で得る少量ソウル（§11.2）
    bondExp: 20, // 休憩で得る絆経験値（§11.2）
  },
  bondExpPerLevel: 100, // 絆 Lv 上昇に必要な経験値（次 Lv = base * 現Lv）
};

// 端末ローカル日付 "YYYY-MM-DD"（§11.2: ローカル版は端末日付で 1 日 1 回）。
export function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// アクティブなマイキャラを updater で書き換えた新しい profile を返す（不変更新）。
function withActiveAvatar(profile, updater) {
  const av = activeAvatar(profile);
  if (!av) throw new Error("マイキャラがいません");
  const updated = { ...updater(av), updatedAt: new Date().toISOString() };
  return {
    ...profile,
    avatars: (profile.avatars || []).map((a) => (a.avatarId === av.avatarId ? updated : a)),
  };
}

// ---------------------------------------------------------------- 休憩（§11）
export function canRestToday(profile, today = localDate()) {
  return (profile.daily?.lastRestDate ?? null) !== today;
}

// 日次休憩。今日まだなら HP 回復＋絆経験値＋少量ソウル。済みなら例外。
// 大会進行中の runHp は休憩で回復しない（§11.2）が、Phase 2B 時点では runHp 自体が
// 未導入なので avatarHpCurrent のみ扱う。
export function rest(profile, today = localDate()) {
  const av = activeAvatar(profile);
  if (!av) throw new Error("マイキャラがいません");
  if (!canRestToday(profile, today)) throw new Error("今日はもう休憩しました");

  const heal = Math.round(av.avatarHpMax * GROWTH_TUNING.rest.healRatio);
  const newHp = Math.min(av.avatarHpMax, av.avatarHpCurrent + heal);

  // 絆経験値の加算と Lv 上昇（しきい値は base * 現Lv で逓増）。
  let bondLevel = av.bondLevel ?? 1;
  let bondExp = (av.bondExp ?? 0) + GROWTH_TUNING.rest.bondExp;
  while (bondExp >= GROWTH_TUNING.bondExpPerLevel * bondLevel) {
    bondExp -= GROWTH_TUNING.bondExpPerLevel * bondLevel;
    bondLevel += 1;
  }

  let next = withActiveAvatar(profile, (a) => ({
    ...a,
    avatarHpCurrent: newHp,
    bondLevel,
    bondExp,
  }));
  next = grantSoul(next, GROWTH_TUNING.rest.soul);
  next = { ...next, daily: { ...(next.daily || {}), lastRestDate: today } };

  return {
    profile: next,
    healed: newHp - av.avatarHpCurrent,
    soul: GROWTH_TUNING.rest.soul,
    bondExp: GROWTH_TUNING.rest.bondExp,
    bondUp: bondLevel > (av.bondLevel ?? 1),
    bondLevel,
  };
}

// ------------------------------------------------- キャラ Lv（HP 成長）（§10.2）
export function avatarLevelInfo(profile) {
  const av = activeAvatar(profile);
  if (!av) return null;
  return {
    current: av.avatarLevel,
    currentHpMax: av.avatarHpMax,
    next: nextAvatarLevel(av.avatarLevel), // null なら最大
  };
}

// キャラ Lv を 1 上げ、最大 HP を引き上げる。増えたぶんは現在 HP にも加算する。
export function levelUpAvatar(profile) {
  const av = activeAvatar(profile);
  if (!av) throw new Error("マイキャラがいません");
  const next = nextAvatarLevel(av.avatarLevel);
  if (!next) throw new Error("キャラ Lv は最大です");

  let p = spendSoul(profile, next.soulCost);
  const hpGain = Math.max(0, next.avatarHpMax - av.avatarHpMax);
  p = withActiveAvatar(p, (a) => ({
    ...a,
    avatarLevel: next.avatarLevel,
    avatarHpMax: next.avatarHpMax,
    avatarHpCurrent: a.avatarHpCurrent + hpGain,
  }));
  return { profile: p, avatarLevel: next.avatarLevel, hpGain, cost: next.soulCost };
}

// ------------------------------------------------------- スキル Lv 強化（§10.5）
export function skillLevelInfo(profile) {
  const av = activeAvatar(profile);
  if (!av) return null;
  const tmpl = skillTemplateById(av.skillTemplateId);
  return {
    current: av.skillLevel,
    tableId: tmpl?.levelTableId ?? null,
    next: tmpl ? nextSkillLevel(tmpl.levelTableId, av.skillLevel) : null, // null なら最大
  };
}

export function upgradeSkill(profile) {
  const av = activeAvatar(profile);
  if (!av) throw new Error("マイキャラがいません");
  const tmpl = skillTemplateById(av.skillTemplateId);
  if (!tmpl) throw new Error("能力種類が不正です");
  const next = nextSkillLevel(tmpl.levelTableId, av.skillLevel);
  if (!next) throw new Error("スキル Lv は最大です");

  let p = spendSoul(profile, next.soulCost);
  p = withActiveAvatar(p, (a) => ({ ...a, skillLevel: next.skillLevel }));
  return { profile: p, skillLevel: next.skillLevel, cost: next.soulCost };
}

// ------------------------------------------------------- 能力種類変更（§10.6）
// 師匠は変えず、許可候補（現能力を除く）から選ぶ。各候補の費用を添えて返す。
export function abilityChangeOptions(profile) {
  const av = activeAvatar(profile);
  if (!av) return [];
  return templatesForMentor(av.mentorCharacterId)
    .filter((t) => t.skillTemplateId !== av.skillTemplateId)
    .map((t) => ({
      template: t,
      cost: abilityChangeCost({
        avatarLevel: av.avatarLevel,
        currentSkillLevel: av.skillLevel,
        targetRarity: t.rarity,
      }),
    }));
}

// 能力種類を変更する。ソウルを消費し、スキル Lv を初期値（Lv1）へ戻し（§10.6）、
// 変更回数を加算する（能力変更シナリオの解放条件に使える）。師匠は変えない。
export function changeAbility(profile, targetSkillTemplateId) {
  const av = activeAvatar(profile);
  if (!av) throw new Error("マイキャラがいません");
  const tmpl = skillTemplateById(targetSkillTemplateId);
  if (!tmpl || !tmpl.isEnabled) throw new Error("選べない能力種類です");
  if (!tmpl.mentorCharacterIds.includes(av.mentorCharacterId))
    throw new Error("この師匠では選べない能力です");
  if (tmpl.skillTemplateId === av.skillTemplateId) throw new Error("すでにその能力です");

  const cost = abilityChangeCost({
    avatarLevel: av.avatarLevel,
    currentSkillLevel: av.skillLevel,
    targetRarity: tmpl.rarity,
  });
  let p = spendSoul(profile, cost);
  p = withActiveAvatar(p, (a) => ({
    ...a,
    skillTemplateId: tmpl.skillTemplateId,
    skillLevel: tmpl.initialSkillLevel ?? 1, // §10.6 スキル Lv リセット
    abilityChangedCount: (a.abilityChangedCount ?? 0) + 1,
  }));
  return { profile: p, cost, skillTemplateId: tmpl.skillTemplateId };
}
