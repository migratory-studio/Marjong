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

// --- 訓練: 鍛錬の「型」3変種＋6パラメータ全てに主の上げ方がある ---
{
  const { TRAIN_TUNING, trainOptionsFor, trainParam, ensureDay: ed } =
    await import("../src/progression/progressionService.js");
  const { avatarParams6 } = await import("../src/progression/avatarFactory.js");

  const drills = trainOptionsFor("drill");
  eq("鍛錬は3つの型を持つ", drills.length, 3);
  eq("鍛錬の型の主は火力/守備/速度", drills.map((o) => o.main).sort().join(","), ["fire", "guard", "speed"].sort().join(","));
  // 守備・速度・メンタルも含め、6 パラメータすべてに「主」の上げ方がある（伸び悩み対策の不変条件）。
  const mains = new Set(Object.values(TRAIN_TUNING).map((t) => t.main));
  for (const k of ["fire", "guard", "read", "gamble", "speed", "mental"]) {
    ok(`${k} に主の上げ方がある`, mains.has(k));
  }

  let p = freshProfile();
  p = ed(p, () => 0.5).profile;
  const before = avatarParams6(activeAvatar(p));
  const res = trainParam(p, "drill_guard", () => 0.5);
  const after = avatarParams6(activeAvatar(res.profile));
  ok("鍛錬（受け）で守備が伸びる", after.guard > before.guard);
  eq("鍛錬（受け）は1行動を消費", dayInfo(res.profile).actionsLeft, ACTIONS_PER_DAY - 1);
}

// --- 大会: 順位に応じた実戦経験（弱点パラメータから埋まる）＋途中退場は半分 ---
{
  const { applyLeagueResult } = await import("../src/progression/progressionService.js");
  const { tournamentRunConfig } = await import("../src/data/tournamentMaster.js");
  const { avatarParams6 } = await import("../src/progression/avatarFactory.js");
  const t = tournamentRunConfig("menzen-kaiken"); // T1: expByPlace=[6,5,4,3]

  // 1キーだけ極端に低くしておく → 実戦経験はそこから先に埋まる。
  let p = freshProfile();
  p = { ...p, avatars: p.avatars.map((a) => ({ ...a, params6: { ...a.params6, mental: 1 } })) };
  const res = applyLeagueResult(p, t, 1); // 最終2位
  eq("2位でも実戦経験が入る", res.exp?.total, t.expByPlace[1]);
  ok("経験は最も低いパラメータ（メンタル）から積まれる", (res.exp.gains.mental || 0) >= 1);
  eq("params6 に反映される", avatarParams6(activeAvatar(res.profile)).mental, 1 + (res.exp.gains.mental || 0));
  ok("2位は優勝扱いにならない", res.won === false);

  const ret = applyLeagueResult(p, t, 3, true); // 途中退場
  eq("途中退場は半分（最低1）", ret.exp?.total, Math.max(1, Math.floor(t.expByPlace[3] / 2)));

  // カンスト時は打ち止め（無限ループしない）。
  let full = freshProfile();
  full = { ...full, avatars: full.avatars.map((a) => ({ ...a, params6: { fire: 99, guard: 99, read: 99, gamble: 99, speed: 99, mental: 99 } })) };
  ok("全カンストなら経験は積まれない", applyLeagueResult(full, t, 0).exp === null);
}

// --- 育成フェーズ: 師弟編フィナーレ読了で覇道編へ ---
{
  const { mentorPhase } = await import("../src/progression/scenarioService.js");
  const { MENTOR_FINALE_SCENARIO } = await import("../src/data/mentorCampaignMaster.js");
  let p = freshProfile();
  eq("フィナーレ未読は師弟編", mentorPhase(p, "shiyue").id, "shitei");
  p = { ...p, scenarioProgress: [{ scenarioId: MENTOR_FINALE_SCENARIO.shiyue, readAt: "2026-01-01", version: 1 }] };
  eq("フィナーレ読了で覇道編", mentorPhase(p, "shiyue").id, "hadou");
  eq("finale 未定義の師匠は常に師弟編", mentorPhase(p, "bibi").id, "shitei");
}

// --- 師匠の修行成長（覇道編・二人三脚）: 座学/鍛錬/二人打ちで師匠も伸びる ---
{
  const { trainParam, applyDuoResult, mentorGrowthFor, gainMentorTrainExpIfHadou, MENTOR_GROWTH, ensureDay: ed } =
    await import("../src/progression/progressionService.js");
  const { MENTOR_FINALE_SCENARIO } = await import("../src/data/mentorCampaignMaster.js");
  const toHadou = (p) => ({ ...p, scenarioProgress: [{ scenarioId: MENTOR_FINALE_SCENARIO.shiyue, readAt: "2026-01-01", version: 1 }] });

  // 師弟編では師匠は伸びない。
  let p = ed(freshProfile(), () => 0.5).profile;
  ok("師弟編の座学では師匠は伸びない", trainParam(p, "study", () => 0.5).mentor === null);
  eq("初期の修行は Lv1・補正なし", mentorGrowthFor(p, "shiyue").level, 1);
  eq("初期の持ち点補正は 0", mentorGrowthFor(p, "shiyue").hpBonus, 0);

  // 覇道編の座学＝師匠に修行 exp。
  let q = ed(toHadou(freshProfile()), () => 0.5).profile;
  const tr = trainParam(q, "study", () => 0.5);
  eq("覇道編の座学で師匠も伸びる", tr.mentor?.gained, MENTOR_GROWTH.exp.study);
  eq("修行 exp が保存される", mentorGrowthFor(tr.profile, "shiyue").exp, MENTOR_GROWTH.exp.study);
  // 雀荘巡りは対象外（gainMentorTrainExpIfHadou が menu で弾く）。
  ok("雀荘巡りは師匠の修行対象外", gainMentorTrainExpIfHadou(q, "shiyue", "parlor") === null);

  // 二人打ち（覇道編）＝最も濃い修行。勝てば上乗せ。
  const duoP = { ...toHadou(freshProfile()) };
  const duoQ = ed(duoP, () => 0.5).profile;
  const win = applyDuoResult(duoQ, { finalPoints: 99999, placement: 0 });
  eq("覇道編の二人打ち勝利で修行 +3", win.mentor?.gained, MENTOR_GROWTH.exp.duo + MENTOR_GROWTH.exp.duoWin);

  // exp → Lv の畳み込みと levelUp フラグ。
  let r = toHadou(freshProfile());
  let lastLevelUp = false;
  for (let i = 0; i < MENTOR_GROWTH.expPerLevel; i++) {
    const g = gainMentorTrainExpIfHadou(r, "shiyue", "study");
    r = g.profile; lastLevelUp = g.levelUp;
  }
  eq("expPerLevel ぶん積むと Lv2", mentorGrowthFor(r, "shiyue").level, 2);
  ok("Lv が上がった回で levelUp=true", lastLevelUp === true);
  eq("Lv2 の持ち点補正", mentorGrowthFor(r, "shiyue").hpBonus, MENTOR_GROWTH.hpPerLevel);
}

// --- 師匠の段位の軌跡: 詩玥は九蓮戦の直前に八蓮極士、ビビは五蓮のまま ---
{
  const { mentorRankFor } = await import("../src/data/tournamentMaster.js");
  eq("詩玥: 宝4個では六蓮達士のまま", mentorRankFor("shiyue", 4)?.n, 6);
  eq("詩玥: 宝5個で七蓮覇士", mentorRankFor("shiyue", 5)?.n, 7);
  eq("詩玥: 宝8個（九蓮戦直前）で八蓮極士", mentorRankFor("shiyue", 8)?.n, 8);
  eq("詩玥: 八蓮極士の名前", mentorRankFor("shiyue", 8)?.name, "八蓮極士");
  eq("ビビ: 宝8個でも五蓮闘士のまま（停滞が正典）", mentorRankFor("bibi", 8)?.n, 5);
  eq("ルイナ: 軌跡なし＝五蓮のまま", mentorRankFor("kakeha_ruina", 9)?.n, 5);
  eq("引数なし（従来呼び出し）は初期段位", mentorRankFor("shiyue")?.n, 6);
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
