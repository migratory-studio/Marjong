// Phase 3: シナリオ解放判定 / 既読 / 初回報酬の回帰テスト（DOM不要）。
// major_update_specification.md §12.4 / §12.6。
import { createDefaultProfile } from "../src/progression/profileRepository.js";
import { buildNewAvatar, addAvatarToProfile, activeAvatar } from "../src/progression/avatarFactory.js";
import { INITIAL_MENTOR_IDS, templatesForMentor } from "../src/data/skillTemplateMaster.js";
import { buildUnlockContext, evalCondition, evaluateUnlock } from "../src/scenario/unlockEvaluator.js";
import { isScenarioRead, markScenarioRead } from "../src/progression/scenarioService.js";
import { scenariosForMentor } from "../src/screens/scenarioListScreen.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };
const eq = (label, got, want) => ok(`${label} (got=${JSON.stringify(got)}, want=${JSON.stringify(want)})`, got === want);

// 弟子付きプロフィール（師匠=shiyue）。bond/avatar Lv を直接上書きできる。
function freshProfile({ soul = 0, bondLevel = 1, avatarLevel = 1, readIds = [], tournamentsWon = 0 } = {}) {
  const mentor = INITIAL_MENTOR_IDS[0]; // shiyue
  const tmpl = templatesForMentor(mentor)[0];
  const avatar = buildNewAvatar({ name: "弟子", mentorCharacterId: mentor, skillTemplateId: tmpl.skillTemplateId, presetIds: {} });
  let p = addAvatarToProfile(createDefaultProfile(), avatar);
  p = { ...p, wallet: { ...p.wallet, soul } };
  p = { ...p, records: { ...(p.records || {}), tournamentsWon } };
  p = { ...p, avatars: p.avatars.map((a) => (a.avatarId === avatar.avatarId ? { ...a, bondLevel, avatarLevel } : a)) };
  p = { ...p, scenarioProgress: readIds.map((id) => ({ scenarioId: id, readAt: "t", version: 1 })) };
  return p;
}

// --- buildUnlockContext ---
{
  const p = freshProfile({ bondLevel: 3, avatarLevel: 5, readIds: ["a"], tournamentsWon: 2 });
  const ctx = buildUnlockContext(p);
  eq("ctx.bondLevel", ctx.bondLevel, 3);
  eq("ctx.avatarLevel", ctx.avatarLevel, 5);
  eq("ctx.tournamentWon", ctx.tournamentWon, 2);
  ok("ctx.readIds に既読が入る", ctx.readIds.has("a"));
}

// --- evalCondition: 各型 ---
{
  const ctx = buildUnlockContext(freshProfile({ bondLevel: 4, avatarLevel: 2, readIds: ["x"], tournamentsWon: 0 }));
  ok("always は常に ok", evalCondition({ type: "always" }, ctx).ok);
  ok("bond_level 達成", evalCondition({ type: "bond_level", value: 4 }, ctx).ok);
  ok("bond_level 未達", !evalCondition({ type: "bond_level", value: 5 }, ctx).ok);
  ok("avatar_level 達成", evalCondition({ type: "avatar_level", value: 2 }, ctx).ok);
  ok("scenario_read 達成", evalCondition({ type: "scenario_read", value: "x" }, ctx).ok);
  ok("scenario_read 未達", !evalCondition({ type: "scenario_read", value: "y" }, ctx).ok);
  ok("tournament_won 未実装は0で未達", !evalCondition({ type: "tournament_won", value: 1 }, ctx).ok);
  ok("未達はラベルを返す", !!evalCondition({ type: "bond_level", value: 9 }, ctx).label);
}

// --- evaluateUnlock: AND ---
{
  const ctx = buildUnlockContext(freshProfile({ bondLevel: 2, readIds: ["mentor-shiyue-bond-01"] }));
  const sc = { unlockConditions: [{ type: "scenario_read", value: "mentor-shiyue-bond-01" }, { type: "bond_level", value: 2 }] };
  ok("両条件達成で解放", evaluateUnlock(sc, ctx).unlocked);
  const sc2 = { unlockConditions: [{ type: "scenario_read", value: "mentor-shiyue-bond-01" }, { type: "bond_level", value: 9 }] };
  const r2 = evaluateUnlock(sc2, ctx);
  ok("一方未達でロック", !r2.unlocked);
  ok("未達条件が unmet に1件", r2.unmet.length === 1);
  ok("条件なしは always 扱いで解放", evaluateUnlock({}, ctx).unlocked);
}

// --- 実データ: 1話目は always 解放、2話目は親密度2+読了でゲート ---
{
  const list = scenariosForMentor("shiyue");
  ok("shiyue の bond シナリオが12本", list.length === 12);
  ok("表示順に並ぶ", list[0].scenarioId === "mentor-shiyue-bond-01");

  const ctxFresh = buildUnlockContext(freshProfile()); // bond1, 既読なし
  ok("1話は初期状態で解放", evaluateUnlock(list[0], ctxFresh, () => "").unlocked);
  ok("2話は初期状態でロック", !evaluateUnlock(list[1], ctxFresh, () => "").unlocked);

  const ctxReady = buildUnlockContext(freshProfile({ bondLevel: 2, readIds: ["mentor-shiyue-bond-01"] }));
  ok("2話は1話読了+親密度2で解放", evaluateUnlock(list[1], ctxReady, () => "").unlocked);

  // 終盤は tournament_won（未実装=0）でロックのまま
  const last = list[list.length - 1];
  ok("最終話は大会優勝ゲートでロック", !evaluateUnlock(last, buildUnlockContext(freshProfile({ bondLevel: 99, avatarLevel: 99, readIds: list.map((s) => s.scenarioId) })), () => "").unlocked);
}

// --- markScenarioRead: 既読化 + 初回報酬の二重付与防止 ---
{
  const scenario = { scenarioId: "mentor-shiyue-bond-01", scenarioVersion: 2, firstReadReward: { soul: 100 } };
  let p = freshProfile({ soul: 0 });
  ok("初期は未読", !isScenarioRead(p, scenario.scenarioId));

  const r1 = markScenarioRead(p, scenario);
  ok("初回読了で firstRead=true", r1.firstRead === true);
  eq("初回でソウル付与", r1.soul, 100);
  eq("ウォレットに反映", r1.profile.wallet.soul, 100);
  ok("既読化される", isScenarioRead(r1.profile, scenario.scenarioId));

  const r2 = markScenarioRead(r1.profile, scenario);
  ok("再読了は firstRead=false", r2.firstRead === false);
  eq("再読了でソウルは増えない", r2.profile.wallet.soul, 100);
  eq("既読は重複しない", r2.profile.scenarioProgress.length, 1);
}

console.log(fails ? `\n${fails} 件 NG` : "\nすべて PASS");
process.exit(fails ? 1 : 0);
