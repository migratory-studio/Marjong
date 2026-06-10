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

// --- シナリオ解禁の通知と大会ストーリーゲート（scenarioService）---
{
  const { markScenarioRead, unlockedUnreadScenarios, tournamentStoryGate, unnotifiedUnlocks, markUnlockNotified, episodeNumberOf } =
    await import("../src/progression/scenarioService.js");
  const { SCENARIO_MASTER } = await import("../src/data/scenarioMaster.js");
  const mentor = activeAvatar(freshProfile()).mentorCharacterId;
  const chapters = SCENARIO_MASTER
    .filter((s) => s.isEnabled && s.scenarioType === "bond" && s.mentorCharacterId === mentor)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // 新規プロフィール: 解禁済み未読 = 第1話のみ（第2話以降は前話読了が必要）。
  let p = freshProfile();
  const pend0 = unlockedUnreadScenarios(p);
  eq("新規は第1話だけが解禁済み未読", pend0.map((s) => s.scenarioId).join(), chapters[0].scenarioId);
  eq("episodeNumberOf は1始まり", episodeNumberOf(p, chapters[0].scenarioId), 1);
  ok("新規に大会ストーリーゲートは無い", tournamentStoryGate(p) === null);

  // 通知の記録: 一度 markUnlockNotified したら unnotifiedUnlocks に出ない（未読のままでも）。
  eq("未通知の解禁 = 第1話", unnotifiedUnlocks(p).length, 1);
  p = markUnlockNotified(p, [chapters[0].scenarioId]);
  eq("通知済みは再度出ない", unnotifiedUnlocks(p).length, 0);

  // 第1話を読むと既読化し、解禁済み未読から消える（次話は条件未達なら出ない）。
  p = markScenarioRead(p, chapters[0]).profile;
  ok("読了した章は解禁済み未読から消える", !unlockedUnreadScenarios(p).some((s) => s.scenarioId === chapters[0].scenarioId));

  // 大会ストーリーゲート: 1〜10話既読＋優勝1回 → won ゲートの第11話が「読むまで挑戦不可」として返る。
  const kouhenIdx = chapters.findIndex((s) => (s.unlockConditions || []).some((c) => c.type === "tournament_won"));
  if (kouhenIdx >= 0) {
    let q = freshProfile();
    q = {
      ...q,
      scenarioProgress: chapters.slice(0, kouhenIdx).map((s) => ({ scenarioId: s.scenarioId, readAt: "2026-01-01", version: 1 })),
      records: { ...(q.records || {}), tournamentsWon: 1 },
    };
    eq("優勝で解禁された未読章がゲートに出る", tournamentStoryGate(q)?.scenarioId, chapters[kouhenIdx].scenarioId);
    // その章を読めばゲート解除（次の won 章は優勝数が足りず未解禁）。
    q = markScenarioRead(q, chapters[kouhenIdx]).profile;
    ok("読了でゲート解除", tournamentStoryGate(q) === null);
  }

  // 形式導入ゲート（step.requireScenario）: 団体戦・大三剣はマモリ加入章(ep11)読了が前提。
  {
    const { campaignFor } = await import("../src/data/mentorCampaignMaster.js");
    const dai = campaignFor("shiyue").find((st) => st.id === "daisanken");
    eq("大三剣に requireScenario が設定されている", dai?.requireScenario, "mentor-shiyue-bond-11");
    // ep11 未読なら大三剣はブロック（前提章へ誘導 or locked 足止め）。
    let q = freshProfile();
    q = { ...q,
      scenarioProgress: chapters.slice(0, 10).map((s) => ({ scenarioId: s.scenarioId, readAt: "2026-01-01", version: 1 })),
      records: { ...(q.records || {}), tournamentsWon: 1 } };
    ok("ep11 未読だと大三剣はストーリーゲートで止まる", tournamentStoryGate(q, dai) !== null);
    // ep11 を読めば、大三剣の前提ゲートは解除される。
    q = markScenarioRead(q, chapters[10]).profile; // chapters[10] = 第11話
    ok("ep11 読了で大三剣の前提ゲート解除", tournamentStoryGate(q, dai) === null);
    // requireScenario が無いステップ（menzen）には前提ゲートはかからない。
    const menzen = campaignFor("shiyue").find((st) => st.id === "menzen-kaiken");
    ok("menzen に前提ゲートは無い", tournamentStoryGate(freshProfile(), menzen) === null);
  }
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
