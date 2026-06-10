// Phase 2B: 育成サービス（休憩 / HP 成長 / スキル Lv / 能力変更）の回帰テスト（DOM不要）。
// major_update_specification.md §22.2 Phase 2 のうち 2B 範囲を確認。
import { createDefaultProfile } from "../src/progression/profileRepository.js";
import { buildNewAvatar, addAvatarToProfile, activeAvatar } from "../src/progression/avatarFactory.js";
import { spendSoul, grantSoul, grantSoulOnce, hasReward } from "../src/progression/rewardService.js";
import {
  rest, ensureDay, dayInfo, ACTIONS_PER_DAY,
  levelUpAvatar, upgradeSkill, changeAbility, abilityChangeOptions,
  avatarLevelInfo, skillLevelInfo,
} from "../src/progression/progressionService.js";
import { INITIAL_MENTOR_IDS, templatesForMentor } from "../src/data/skillTemplateMaster.js";
import { abilityChangeCost } from "../src/data/abilityChangeCostMaster.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };
const eq = (label, got, want) => ok(`${label} (got=${JSON.stringify(got)}, want=${JSON.stringify(want)})`, got === want);
const threws = (label, fn) => { let t = false; try { fn(); } catch { t = true; } ok(label, t); };

// 弟子付きプロフィールを作るヘルパ（師匠=shiyue, 能力=最初の候補）。soul を任意に積める。
function freshProfile({ soul = 0 } = {}) {
  const mentor = INITIAL_MENTOR_IDS[0];
  const tmpl = templatesForMentor(mentor)[0];
  const avatar = buildNewAvatar({ name: "弟子", mentorCharacterId: mentor, skillTemplateId: tmpl.skillTemplateId, presetIds: {} });
  let p = addAvatarToProfile(createDefaultProfile(), avatar); // 作成ボーナス込み
  p = { ...p, wallet: { ...p.wallet, soul } }; // soul を上書きして条件を固定
  return p;
}

// --- rewardService: 消費 / 付与 / 不足 / 台帳 ---
{
  let p = freshProfile({ soul: 100 });
  p = grantSoul(p, 50);
  eq("grantSoul で加算", p.wallet.soul, 150);
  p = spendSoul(p, 120);
  eq("spendSoul で減算", p.wallet.soul, 30);
  threws("spendSoul は不足で例外", () => spendSoul(p, 999));

  const r = grantSoulOnce(p, "scenario:test", 200);
  eq("grantSoulOnce 初回は付与", r.profile.wallet.soul, 230);
  ok("grantSoulOnce 初回 granted", r.granted === true);
  const r2 = grantSoulOnce(r.profile, "scenario:test", 200);
  ok("grantSoulOnce 2回目は付与しない", r2.granted === false && r2.profile.wallet.soul === 230);
  ok("hasReward で台帳判定", hasReward(r.profile, "scenario:test"));
}

// --- 休憩: 1 行動を消費（1日 = 3 行動）/ HP 回復は最大の範囲内 / ソウル・絆 ---
{
  let p = freshProfile({ soul: 0 });
  // 現在 HP を減らしておく（回復が見えるように）
  p = { ...p, avatars: p.avatars.map((a) => ({ ...a, avatarHpCurrent: 1000 })) };
  p = ensureDay(p, () => 0.5).profile;
  eq("初日は全行動が残っている", dayInfo(p).actionsLeft, ACTIONS_PER_DAY);

  const res = rest(p);
  const a = activeAvatar(res.profile);
  ok("休憩で HP が回復した", a.avatarHpCurrent > 1000);
  ok("HP は最大を超えない", a.avatarHpCurrent <= a.avatarHpMax);
  ok("休憩でソウル付与", res.profile.wallet.soul > 0);
  ok("休憩で絆経験値付与", a.bondExp > 0 || a.bondLevel > 1);
  eq("休憩は 1 行動を消費", dayInfo(res.profile).actionsLeft, ACTIONS_PER_DAY - 1);

  // 3 行動を使い切ると日が進み、ensureDay まで追加行動は不可。
  const used3 = rest(rest(res.profile).profile);
  ok("3 行動で日が進む", used3.dayAdvanced === true && used3.profile.dayCount === 2);
  threws("行動切れの rest は例外", () => rest(used3.profile));

  // 満タンからの休憩は HP を増やさない（範囲内クランプ）
  let full = ensureDay(freshProfile(), () => 0.5).profile;
  const fa = activeAvatar(full);
  eq("初期は満タン", fa.avatarHpCurrent, fa.avatarHpMax);
  const r3 = rest(full);
  eq("満タン休憩は HP 据え置き", activeAvatar(r3.profile).avatarHpCurrent, fa.avatarHpMax);
  eq("満タンでも回復量0", r3.healed, 0);
}

// --- HP 成長（キャラ Lv）: ソウル不足は不可 / 成功で最大HP増加 ---
{
  const info0 = avatarLevelInfo(freshProfile());
  const cost2 = info0.next.soulCost;

  let poor = freshProfile({ soul: cost2 - 1 });
  threws("ソウル不足でキャラLv強化不可", () => levelUpAvatar(poor));

  let rich = freshProfile({ soul: cost2 });
  const before = activeAvatar(rich);
  const res = levelUpAvatar(rich);
  const after = activeAvatar(res.profile);
  eq("キャラLvが上がる", after.avatarLevel, before.avatarLevel + 1);
  ok("最大HPが増える", after.avatarHpMax > before.avatarHpMax);
  ok("増えたぶん現在HPも増える", after.avatarHpCurrent === before.avatarHpCurrent + (after.avatarHpMax - before.avatarHpMax));
  eq("ソウルを消費", res.profile.wallet.soul, 0);
}

// --- スキル Lv 強化: ソウル不足は不可 / 成功で Lv+1 ---
{
  const info0 = skillLevelInfo(freshProfile());
  const cost2 = info0.next.soulCost;

  let poor = freshProfile({ soul: cost2 - 1 });
  threws("ソウル不足でスキルLv強化不可", () => upgradeSkill(poor));

  let rich = freshProfile({ soul: cost2 });
  const before = activeAvatar(rich);
  const res = upgradeSkill(rich);
  eq("スキルLvが上がる", activeAvatar(res.profile).skillLevel, before.skillLevel + 1);
  eq("ソウルを消費", res.profile.wallet.soul, 0);
}

// --- 能力変更: 費用 / スキルLvリセット / 変更回数 / 師匠不変 ---
{
  let p = freshProfile({ soul: 0 });
  // 先にスキルを Lv3 まで上げて、リセットが効くことを見る
  p = { ...p, wallet: { ...p.wallet, soul: 99999 } };
  p = upgradeSkill(p).profile; // ->2
  p = upgradeSkill(p).profile; // ->3
  eq("事前にスキルLv3", activeAvatar(p).skillLevel, 3);

  const opts = abilityChangeOptions(p);
  ok("変更候補は現能力を除く", opts.length >= 1 && opts.every((o) => o.template.skillTemplateId !== activeAvatar(p).skillTemplateId));
  const target = opts[0];
  // 費用式の一致確認
  const expectCost = abilityChangeCost({ avatarLevel: activeAvatar(p).avatarLevel, currentSkillLevel: activeAvatar(p).skillLevel, targetRarity: target.template.rarity });
  eq("提示費用が式と一致", target.cost, expectCost);

  const beforeMentor = activeAvatar(p).mentorCharacterId;
  const soulBefore = p.wallet.soul;
  const res = changeAbility(p, target.template.skillTemplateId);
  const a = activeAvatar(res.profile);
  eq("能力種類が変わる", a.skillTemplateId, target.template.skillTemplateId);
  eq("能力変更でスキルLvが1に戻る", a.skillLevel, 1);
  eq("変更回数を加算", a.abilityChangedCount, 1);
  eq("師匠は変わらない", a.mentorCharacterId, beforeMentor);
  eq("変更費用を消費", res.profile.wallet.soul, soulBefore - target.cost);

  // ソウル不足では変更不可
  let poor = freshProfile({ soul: 0 });
  const opt = abilityChangeOptions(poor)[0];
  threws("ソウル不足で能力変更不可", () => changeAbility(poor, opt.template.skillTemplateId));

  // 別師匠の能力には変えられない
  threws("他師匠の能力へは変更不可", () => changeAbility(freshProfile({ soul: 99999 }), "tmpl-iron-guard"));
}

// --- 雀荘巡り: 店トレイトの経済整合（ご祝儀/場代/レア客ボーナス・visitParlor extras）---
{
  const { visitParlor, parlorState } = await import("../src/progression/progressionService.js");
  const { traitOfParlor, TRAIT_CFG, PARLOR_TRAITS } = await import("../src/data/parlorTraitMaster.js");

  // トレイトは店名 seed で決定論（同じ店は常に同じ）。
  ok("traitOfParlor は決定論", JSON.stringify(traitOfParlor("雀荘テスト")) === JSON.stringify(traitOfParlor("雀荘テスト")));
  // 既知トレイトのみ返る（または null）。
  const ids = new Set(PARLOR_TRAITS.map((t) => t.id));
  ok("traitOfParlor は既知トレイトか null", ["A", "B", "雀", "東風荘"].every((n) => {
    const t = traitOfParlor(n);
    return t === null || ids.has(t.id);
  }));

  // visitParlor の経済: soul = round(soulPerWin×wins×soulWinMul) + rareWins×rareGuestSoul − entryCost。
  const p = freshProfile({ soul: 500 });
  const cand = parlorState(p).candidates[0];
  const wins = 2, rareWins = 1;
  const expected = Math.round(cand.soulPerWin * wins * (cand.trait?.soulWinMul || 1))
    + rareWins * TRAIT_CFG.rareGuestSoul - (cand.trait?.entryCost || 0);
  const res = visitParlor(p, 0, wins, Math.random, { rareWins });
  eq("visitParlor のソウル純増（トレイト込み）", res.soul, expected);
  eq("財布に純増が反映", res.profile.wallet.soul, 500 + expected);
  eq("rareWins が結果に乗る", res.rareWins, rareWins);
  eq("rareBonus の額", res.rareBonus, rareWins * TRAIT_CFG.rareGuestSoul);
  ok("trait が結果に同梱（null 可）", "trait" in res);
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
