// 師弟モード（詩玥編）レベルデザイン回帰 — DOM 不要・決定論。
//
// 時間の縮尺：1ターン（コード上の day）＝ゲーム内「ひと月」。九蓮宝士到達≈28ヶ月（2年4ヶ月）。
// 「標準的な遊び方」（ひと月=休憩1＋修行2、ときどき二人打ち/雀荘、章は解禁され次第読む、
// キャラLvはソウルが貯まり次第強化、大会は勝ち目が出たら挑む）を 50 ヶ月ぶん自動プレイし、
// 章の解禁月・大会の優勝月・絆/キャラLv の伸びが設計レンジに収まることを検証する。
// ソウル/絆/敵の強さ（oppLv カーブ）をいじったら、まずここで答え合わせする。
//
// 大会の勝敗は実エンジン（人間が打つ）なので確率モデル化はせず、
// 「総合力比 ratio >= WIN_RATIO で優勝できる」という保守的な近似で日数を見積もる。
// （実際は出場ゲート=大劣勢回避 0.62 を超えれば腕次第でもっと早く勝てる）
import { makeRng, paramsFromLv, evaluateTier } from "../src/autobattle/autoBattle.js";
import { createDefaultProfile } from "../src/progression/profileRepository.js";
import { buildNewAvatar, addAvatarToProfile, activeAvatar, avatarParams6 } from "../src/progression/avatarFactory.js";
import {
  ensureDay, dayInfo, rest, trainParam, visitParlor, applyDuoResult,
  parlorState, levelUpAvatar, avatarLevelInfo, upgradeSkill, skillLevelInfo,
  tournamentGate, applyLeagueResult,
} from "../src/progression/progressionService.js";
import { templatesForMentor } from "../src/data/skillTemplateMaster.js";
import { SCENARIO_MASTER } from "../src/data/scenarioMaster.js";
import { buildUnlockContext, evaluateUnlock } from "../src/scenario/unlockEvaluator.js";
import { markScenarioRead, tournamentStoryGate } from "../src/progression/scenarioService.js";
import { campaignFor, nextTreasureStep, isMentorEpilogue, mentorSkillLevel, MENTOR_SKILL_TRACK, MENTOR_SKILL_BASE } from "../src/data/mentorCampaignMaster.js";
import { tournamentRunConfig } from "../src/data/tournamentMaster.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };

const DAYS = 50;
const WIN_RATIO = 0.85;   // 「無理なく優勝できる」総合力比の近似しきい値
const UNIT_CARRY = 1.12;  // ペア/団体＝師匠（格上）が同卓して戦力を担ぐぶんの持ち上げ
const rng = makeRng("leveldesign-shiyue");

// 弟子（詩玥門下）を新規作成。
const tmpl = templatesForMentor("shiyue")[0];
const avatar0 = buildNewAvatar({ name: "弟子", mentorCharacterId: "shiyue", skillTemplateId: tmpl.skillTemplateId, presetIds: {} });
let p = addAvatarToProfile(createDefaultProfile(), avatar0);

const shiyueChapters = SCENARIO_MASTER
  .filter((s) => s.isEnabled && s.mentorCharacterId === "shiyue")
  .sort((a, b) => a.sortOrder - b.sortOrder);

const readDay = {};   // scenarioId -> 読了月
const winDay = [];    // n個目の宝 -> 優勝月
const bondDay = {};   // 絆Lv -> 到達月
const skillDay = {};  // スキルLv -> 到達月
const note = [];      // 日次サマリ（表示用）

const paramTotal = (o) => Object.values(o).reduce((a, b) => a + b, 0);

// 解禁済み・未読の章をぜんぶ読む（読了は行動を消費しない）。
function readUnlocked(day) {
  for (;;) {
    const ctx = buildUnlockContext(p);
    const next = shiyueChapters.find((s) => !readDay[s.scenarioId] && evaluateUnlock(s, ctx).unlocked);
    if (!next) return;
    const res = markScenarioRead(p, next);
    p = res.profile;
    readDay[next.scenarioId] = day;
  }
}

// ソウルが貯まり次第キャラ Lv を上げる（予備を少し残す＝スキル強化ぶんの保守化）。
// Lv11〜 は宝の解禁制（requireTreasures）。未解禁なら買わずにスキルへ回す。
function buyLevels() {
  for (;;) {
    const info = avatarLevelInfo(p);
    if (!info?.next || info.locked) return;
    if ((p.wallet?.soul ?? 0) < Math.round(info.next.soulCost * 1.3)) return;
    p = levelUpAvatar(p).profile;
  }
}

// キャラ Lv 優先のあとに、余裕があればスキル Lv も上げる（予備 1.5 倍＝慎重な財布）。
function buySkills(day) {
  for (;;) {
    const info = skillLevelInfo(p);
    if (!info?.next) return;
    if ((p.wallet?.soul ?? 0) < Math.round(info.next.soulCost * 1.5)) return;
    p = upgradeSkill(p).profile;
    skillDay[info.next.skillLevel] = day;
  }
}

// その日の雀荘から「勝てそうで実入りの良い」1軒を選ぶ。なければ null。
function pickParlor() {
  const st = parlorState(p);
  const self = avatarParams6(activeAvatar(p));
  let best = null;
  for (const c of st.candidates) {
    if (c.done) continue;
    const { ratio } = evaluateTier(self, paramsFromLv(c.oppLv, "parlor"));
    if (ratio < 0.92) continue; // 拮抗未満は避ける（負け込み防止）
    if (!best || c.soulPerWin > best.c.soulPerWin) best = { c, ratio };
  }
  return best;
}

// 雀荘オートの勝ち抜き数を強さ比から近似（優勢=全勝〜劣勢=半分）。
function estWins(ratio, matches) {
  if (ratio >= 1.25) return matches;
  if (ratio >= 1.10) return Math.max(1, matches - 1);
  return Math.max(1, Math.floor(matches / 2));
}

// 二人打ち（師匠は格上）。残点を 0.7〜1.3 倍で近似。
function playDuo() {
  const av = activeAvatar(p);
  const hpBefore = av.avatarHpCurrent ?? av.avatarHpMax;
  const fp = Math.round(hpBefore * (0.7 + rng() * 0.6));
  p = applyDuoResult(p, { finalPoints: fp, placement: fp > hpBefore ? 0 : 1 }).profile;
}

// 次の宝へ挑戦（1日1回）。勝ち目（WIN_RATIO）があれば優勝として反映。
function tryTournament(day) {
  const step = nextTreasureStep("shiyue", p.records?.treasures || []);
  if (!step) return;
  if (tournamentStoryGate(p, step)) return; // 物語ゲート：前提章/後日譚が未読なら挑めない（本体と同じ規則）
  const t = tournamentRunConfig(step.id, { oppLv: step.oppLv, finalFormat: step.finalFormat });
  const gate = tournamentGate(p, t);
  if (!gate.ok) return;
  const self = avatarParams6(activeAvatar(p));
  const { ratio } = evaluateTier(self, paramsFromLv(step.oppLv, "tourney:" + step.id));
  const carry = (t.unitSize ?? 1) >= 2 ? UNIT_CARRY : 1.0;
  if (ratio * carry < WIN_RATIO) return;
  p = applyLeagueResult(p, t, 0).profile;
  winDay.push({ id: step.id, day });
}

// ---- 50 日プレイ ----
for (let day = 1; day <= DAYS; day++) {
  p = ensureDay(p, rng).profile;
  let rested = false;
  let duoDone = false;
  let parlorDone = false;
  while (dayInfo(p).actionsLeft > 0) {
    const av = activeAvatar(p);
    const hp = av.avatarHpCurrent ?? av.avatarHpMax;
    if (!rested) { p = rest(p).profile; rested = true; continue; }
    if (!duoDone && day % 3 === 2 && hp >= av.avatarHpMax * 0.5) { playDuo(); duoDone = true; continue; }
    const parlor = parlorDone ? null : pickParlor();
    if (parlor) {
      const wins = estWins(parlor.ratio, parlor.c.matches);
      p = visitParlor(p, parlor.c.index, wins, rng).profile;
      parlorDone = true;
      continue;
    }
    // 訓練は弱い系統を底上げ（火力 vs 読みの低いほう）。HP が尽きたら休む。
    const ps = avatarParams6(av);
    const key = (ps.fire <= ps.read) ? "drill" : "study";
    if (hp >= 1500 + 600) p = trainParam(p, key, rng).profile;
    else if (hp >= 600) p = trainParam(p, "study", rng).profile;
    else { p = rest(p).profile; }
  }
  buyLevels();
  buySkills(day);
  readUnlocked(day);
  tryTournament(day);
  readUnlocked(day); // 優勝直後に開く章（覇道編）を同日に読む

  const av = activeAvatar(p);
  if (!bondDay[av.bondLevel]) bondDay[av.bondLevel] = day;
  note.push({
    day, bond: av.bondLevel, lv: av.avatarLevel,
    total: paramTotal(avatarParams6(av)),
    soul: p.wallet?.soul ?? 0,
    treasures: (p.records?.treasures || []).length,
  });
}

// ---- ペーシング表（目視チューニング用） ----
console.log("月 | bond lv total soul 宝");
for (const n of note.filter((x) => x.day % 5 === 0 || x.day === 1)) {
  console.log(`${String(n.day).padStart(3)} |  ${n.bond}   ${String(n.lv).padStart(2)}  ${String(n.total).padStart(3)}  ${String(n.soul).padStart(5)}  ${n.treasures}`);
}
console.log("章の解禁（読了）月:");
shiyueChapters.forEach((s, i) => console.log(`  第${String(i + 1).padStart(2)}話 ${s.title}: ${readDay[s.scenarioId] ? readDay[s.scenarioId] + "ヶ月目" : "未読"}`));
console.log("宝の獲得月:", winDay.map((w, i) => `#${i + 1}${w.id}=${w.day}ヶ月`).join(" / "));
console.log("スキルLvの到達月:", Object.entries(skillDay).map(([lv, d]) => `Lv${lv}=${d}ヶ月`).join(" / "));

// ---- 検証 ----
const rd = (n) => readDay[shiyueChapters[n - 1]?.scenarioId] ?? Infinity;
const wd = (n) => winDay[n - 1]?.day ?? Infinity;

ok("第1・2話は1〜2ヶ月目に読める（最初のフック）", rd(1) <= 1 && rd(2) <= 2);
ok("第3話（キャラLv4）は3ヶ月目まで", rd(3) <= 3);
ok("第5話（キャラLv6）は7ヶ月目まで", rd(5) <= 7);
ok("第7話（スキルLv3）は5〜10ヶ月目", rd(7) >= 5 && rd(7) <= 10);
ok("第9話（スキルLv4）は7〜14ヶ月目", rd(9) >= 7 && rd(9) <= 14);
ok("第10話（キャラLv8）は14ヶ月目まで", rd(10) <= 14);
{
  // 一気見防止：前半（大会前＝1〜10話）は同月に3話以上固まらない＆最初の3ヶ月で6話以上開かない。
  const zen = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(rd);
  const perMonth = {};
  for (const d of zen) perMonth[d] = (perMonth[d] || 0) + 1;
  const maxClump = Math.max(...Object.values(perMonth));
  ok(`前半は同月に3話以上固まらない（最大 ${maxClump} 話/月）`, maxClump <= 2);
  const early = zen.filter((d) => d <= 3).length;
  ok(`前半の最初の3ヶ月で開くのは5話まで（実際 ${early} 話）`, early <= 5);
}
ok("師弟編フィナーレ（第12話）は8〜16ヶ月目", rd(12) >= 8 && rd(12) <= 16);
ok("覇道編の山場（第14〜17話＝won3）は20ヶ月目まで", rd(17) <= 20);
ok("第18話（won4）は第17話の後", rd(18) >= rd(17) && rd(18) <= 26);
// 第20話はエピローグ（won9=九蓮優勝後に解禁）。優勝の直後に読めること（遠すぎない）。
ok("エピローグ（第20話）は九蓮優勝の直後に読める", rd(20) >= wd(9) && rd(20) <= wd(9) + 2);
ok("全20話が読める", shiyueChapters.every((s) => readDay[s.scenarioId] != null));
ok("章は順番どおりに解禁される", shiyueChapters.every((s, i, a) => i === 0 || rd(i + 1) >= rd(i)));
ok("最初の宝（門前開鍵）は3〜8ヶ月目", wd(1) >= 3 && wd(1) <= 8);
ok("2個目（大三剣＝12話の卓）は6〜14ヶ月目", wd(2) >= 6 && wd(2) <= 14);
// 物語順の不変条件：団体戦・大三剣はマモリが加入する第11話「二人の九蓮」読了後でないと始まらない。
ok("大三剣は第11話（マモリ加入）読了後に獲得", rd(11) <= wd(2));
ok("9個目（九蓮宝燈）は22〜36ヶ月目＝九蓮宝士到達（約2〜3年の修行）", wd(9) >= 22 && wd(9) <= 36);
ok("宝と宝の間隔が空きすぎない（最大6ヶ月）", winDay.every((w, i) => i === 0 || w.day - winDay[i - 1].day <= 6));
// 物語順の不変条件：優勝後の物語（エピローグ）を、挑戦の前に読ませない。
ok("エピローグは九蓮優勝より前には読めない", rd(20) >= wd(9));
ok("最終戦の前に第19話までを読み終えている", rd(19) <= wd(9));
// スキルLv（幸運のツモ）のペース: Lv5＝師匠相当は「するっと」届かない＝最初の宝（一蓮）より後。
ok("スキルLv5（師匠相当）は最初の宝より後に到達", (skillDay[5] ?? Infinity) > wd(1));
ok("スキルLv5は師弟編フィナーレ前後（9〜18ヶ月目）", skillDay[5] >= 9 && skillDay[5] <= 18);
ok("スキルLv6（読みの目覚め）は覇道編中盤まで（22ヶ月目以内）", skillDay[6] != null && skillDay[6] <= 22);
ok("スキルLv10（神算鬼謀）は終盤に到達できる（45ヶ月目以内）", skillDay[10] != null && skillDay[10] <= 45);
// 絆ペース: 口調崩れ（bondMin:10 の特別挨拶）は「物語を最後まで歩いた者」への報酬＝
// 最終決戦（九蓮宝燈・22ヶ月前後）の直前〜直後に初めて聞こえること。早すぎたら安売り、遅すぎたらお蔵入り。
ok("絆Lv10（口調崩れ解禁）は最終決戦前後（17〜26ヶ月目）", bondDay[10] >= 17 && bondDay[10] <= 26);
// クリア後の余生: 「いちばん奥の言葉」（cleared+bondMin:12）は、惰性の標準プレイでも 40 ヶ月以内に届くこと
// （二人打ちのクリア後倍率 duoBondExp.clearedMul が効く。意図的に毎月通えばクリア後3〜4ヶ月）。
ok("絆Lv12（いちばん奥の言葉）は余生で届く（40ヶ月目以内）", bondDay[12] != null && bondDay[12] <= 40);
{
  // 章の解禁に8ヶ月以上の砂漠がない（覇道編のモンタージュ期間込みで許容幅8）。
  // エピローグは「最終大会の優勝後」という物語上の区切りなので砂漠の判定から除く
  // （ep19〜優勝までの期間は大会消化＝物語が止まっているわけではない）。
  const days = shiyueChapters.filter((s) => !isMentorEpilogue(s.scenarioId))
    .map((s) => readDay[s.scenarioId]).filter((d) => d != null);
  const maxGap = Math.max(...days.map((d, i) => (i === 0 ? 0 : d - days[i - 1])));
  ok(`章解禁の最大間隔 ${maxGap} ヶ月 <= 8`, maxGap <= 8);
}

// ---- ビビ編：超越帯ペーシング（mentorSkillLevel の単体検証） ----
// 上の 50 ヶ月シムは詩玥編専用（弟子＝shiyue門下・shiyueChapters 固定）のため流用困難。
// ビビは「章読了 → 技 Lv 上昇」の対応（MENTOR_SKILL_TRACK.bibi）を mentorSkillLevel で単体検証する。
// 段階：ep15→Lv6 / ep17→Lv7 / ep18→Lv8 / ep19→Lv9 / ep20→Lv10（基準5・最大10）。
{
  // scenarioProgress に scenarioId を積んだだけの軽量プロフィール（mentorSkillLevel はこれだけ読む）。
  const profileWith = (...ids) => ({ scenarioProgress: ids.map((id) => ({ scenarioId: id })) });
  const track = MENTOR_SKILL_TRACK.bibi;

  ok("ビビ: 何も読んでいなければ基準 Lv5", mentorSkillLevel(profileWith(), "bibi") === MENTOR_SKILL_BASE && MENTOR_SKILL_BASE === 5);

  // トラックの定義そのものが ep15→6, ep17→7, ep18→8, ep19→9, ep20→10 に対応していること。
  const expectTrack = [
    ["mentor-bibi-bond-15", 6], ["mentor-bibi-bond-17", 7],
    ["mentor-bibi-bond-18", 8], ["mentor-bibi-bond-19", 9], ["mentor-bibi-bond-20", 10],
  ];
  ok("ビビ: MENTOR_SKILL_TRACK.bibi が ep15/17/18/19/20 → Lv6/7/8/9/10 に対応",
    track.length === 5 && expectTrack.every(([id, lv], i) => track[i].scenarioId === id && track[i].level === lv));

  // 章を1段ずつ読み進めると技 Lv が正しく上がる（累積。max を取るので前段の読了も込み）。
  let read = [];
  for (const [id, lv] of expectTrack) {
    read = [...read, id];
    ok(`ビビ: ${id} 読了で技 Lv${lv}`, mentorSkillLevel(profileWith(...read), "bibi") === lv);
  }
  // 最終話まで読めば最大 Lv10（基準5・超越帯の天井）。
  ok("ビビ: ep20まで読了で Lv10（最大）", mentorSkillLevel(profileWith(...expectTrack.map(([id]) => id)), "bibi") === 10);
  // 未読飛ばし耐性：ep20 だけ読んでいても max で Lv10（順序非依存・到達済み最高 Lv）。
  ok("ビビ: ep20 のみ読了でも Lv10（max 採用）", mentorSkillLevel(profileWith("mentor-bibi-bond-20"), "bibi") === 10);
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
