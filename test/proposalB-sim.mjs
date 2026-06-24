// 提案B（記憶の塔）通しシミュレーション — 新仕様の“物語レイヤー”を実コードで駆動して再生する。
//   node test/proposalB-sim.mjs
// ※ 麻雀エンジンの対局は走らせない。対局の勝敗だけ台本で与え、それ以外（章選択/解禁・章intro・
//    ボス陣=群像・ボス記憶tier・群像相槌・別れ際の見守り・双方向2択・宝珠解禁）は本物のコードで解決する。
//    複数潜行を回し「覚える（蓄積）」がセリフを変えていく様子を見せるのが目的。

import { chaptersWithState, chapterById, firstChapterId, isChapterUnlocked, canOrbUnlock } from "../src/data/rogueliteChapterMaster.js";
import { newRun, previewBossChars } from "../src/roguelite/run.js";
import { floorTypeById } from "../src/data/rogueliteFloorMaster.js";
import { bossMemoryTier, recordBossOutcome } from "../src/roguelite/bossMemory.js";
import { pickVoiceLine } from "../src/data/voiceLines.js";
import { CHARACTER_MASTER } from "../src/data/characterMaster.js";
import { CHARACTER_VOICE_MASTER } from "../src/data/characterVoiceMaster.js";

const nameOf = (id) => CHARACTER_MASTER.find((c) => c.id === id)?.name || id;
const say = (id, ev, ctx) => pickVoiceLine(id, ev, ctx) || "（セリフ未定義）";
const line = (s = "") => console.log(s);
const hr = () => line("────────────────────────────────────────────────────────");

// 疑似プロフィール（profile.roguelite 相当）。実際の永続関数の代わりにここを更新する。
const profile = { orbs: 0, roguelite: { bestFloor: 0, runs: 0, carry: [], bossTally: {}, retreats: 0, chaptersCleared: [], chaptersUnlocked: [], resolve: { climb: 0, rest: 0 } } };

// rlVoiceCtx 相当（main.js と同じキーを組む）。run・rogueliteState スナップショットから作る。
function rlCtx(run, snap) {
  return {
    rlChapter: run.chapterId || null,
    rlCleared: run.cleared || 0,
    rlRetreatHabit: snap.retreatCount || 0,
    rlResolveClimb: snap.resolveClimb || 0,
    rlDeepRun: run.floor > (snap.bestFloor || 0),
  };
}

const PARTY = [{ id: "shiyue", char: { id: "shiyue" } }, { id: "kuidoshi", char: { id: "kuidoshi" } }]; // 相棒=詩玥 / 控え=凌雲
const LEAD = "shiyue", BENCH = "kuidoshi";
const BOSS_FLOOR = floorTypeById("boss");

// 1潜行を物語として再生する。script = { seed, restAt, bossWin(charId,i)->bool, wipeFloor }
function runOnce(idx, script) {
  const R = profile.roguelite;
  // --- 記憶を選ぶ（ハブ） ---
  hr();
  line(`◆ 第 ${idx} 潜行　（これまで：最深 ${R.bestFloor}階 / 撤退 ${R.retreats}回 / “また登る” ${R.resolve.climb}回）`);
  hr();
  const chapters = chaptersWithState(R.chaptersCleared, R.chaptersUnlocked);
  line("【記憶を選ぶ（塔）】");
  for (const c of chapters) {
    const state = c.unlocked ? (c.cleared ? "踏破済・開" : "開") : (c.comingSoon ? "封（未だ綴られぬ・近日）" : "封");
    line(`  ${c.subtitle}「${c.unlocked ? c.title : "？？？"}」… ${state}`);
  }
  // 宝珠解禁の可否（大2=comingSoon は常に不可＝大2不可侵）
  const ch2 = chapters.find((c) => c.comingSoon);
  if (ch2) line(`  └ 宝珠で第二を解く？ → ${canOrbUnlock(ch2, R.chaptersCleared, R.chaptersUnlocked, profile.orbs) ? "可" : "不可（中身が空＝宝珠でも開けない）"}`);

  const chap = chapterById(firstChapterId());
  line(`\n→ 「${chap.title}」を選び、${nameOf(LEAD)}（相棒）と ${nameOf(BENCH)}（控え）で登る。`);

  // run を起こす（ボス陣＝章 cast の群像。相棒/控えは除外される）
  const bossPool = chap.cast.map((c) => c.id);
  const run = newRun(PARTY, script.seed, chap.id, bossPool);
  const snap = { bestFloor: R.bestFloor, retreatCount: R.retreats, resolveClimb: R.resolve.climb };

  // --- 章intro口上 ---
  line(`\n【記憶に入る】`);
  line(`  ${nameOf(LEAD)}「${say(LEAD, "rlChapterIntro", rlCtx(run, snap))}」`);
  // “また登る”を重ねると、相棒が性分を覚えて特別な導入を返すようになる（rlResolveClimbMin で解放）。
  const climbLine = (CHARACTER_VOICE_MASTER[LEAD] || []).find((e) => e.event === "rlChapterIntro" && (snap.resolveClimb >= (e.cond?.rlResolveClimbMin ?? Infinity)));
  if (climbLine) line(`  └（“また登る”を ${snap.resolveClimb} 回重ねた君を覚えていて、こんな言葉も返すようになった）\n     ${nameOf(LEAD)}「${climbLine.text}」`);

  // --- 探索（休息で群像相槌） ---
  line(`\n【探索】`);
  if (script.restAt) {
    run.floor = script.restAt;
    line(`  第${run.floor}階・休息。群像がふと言葉を交わす：`);
    line(`    ${nameOf(LEAD)}「${say(LEAD, "rlBanter", rlCtx(run, snap))}」`);
    line(`    ${nameOf(BENCH)}「${say(BENCH, "rlBanterReply", rlCtx(run, snap))}」`);
  }

  // --- 10階ボス（群像＋ボス記憶tier） ---
  run.floor = 10;
  const bosses = previewBossChars(run, BOSS_FLOOR);
  line(`\n【第10階・館の主】ボス陣＝この記憶の群像から：${bosses.map((b) => nameOf(b.id)).join("・")}`);
  let bossWon = true;
  bosses.forEach((b, i) => {
    const tier = bossMemoryTier(R.bossTally[b.id]);
    const tierJa = { first: "初遭遇", rematch: "再戦", revenge: "雪辱" }[tier];
    line(`  ${nameOf(b.id)}（${tierJa}）「${say(b.id, "rlBossIntro", { bossMemoryTier: tier })}」`);
  });
  // 台本で勝敗を与える → bossTally 更新（覚える）
  bossWon = script.bossWin(idx);
  for (const b of bosses) R.bossTally = recordBossOutcome(R.bossTally, b.id, bossWon);
  line(`  → 対局の結果：${bossWon ? "撃破！（この群像に勝ち越し）" : "敗北……（この群像に苦杯）"}`);
  line(`     ボス通算：${bosses.map((b) => `${nameOf(b.id)} ${R.bossTally[b.id].w}勝${R.bossTally[b.id].l}敗`).join(" / ")}`);

  // --- 全滅（別れ際＝継続＋見守り） ---
  const wipeFloor = bossWon ? script.wipeFloor : 10; // ボスに負ければその階で全滅
  run.floor = wipeFloor;
  const reached = wipeFloor;
  line(`\n【第${reached}階で全滅】`);
  line(`  ${nameOf(LEAD)}「${say(LEAD, "rlWipe", { ...rlCtx(run, snap), rlReached: reached })}」`);
  // 別れ際の保存（最深・ボス記憶は既に更新済み）
  R.bestFloor = Math.max(R.bestFloor, reached);

  // --- 双方向2択（プレイヤーが返す→覚える） ---
  const choice = "climb"; // 台本：毎回「また登る」を選ぶ
  line(`\n【別れ際の2択】——君は、どうする？`);
  line(`  ＞ プレイヤー選択：「${choice === "climb" ? "また登る" : "今は休む"}」`);
  line(`  ${nameOf(LEAD)}「${say(LEAD, "rlResolve", { resolveChoice: choice })}」`);
  R.resolve[choice] += 1; // 覚える（次潜行の章introに効く）
  R.runs += 1;
}

line("╔══════════════════════════════════════════════════════╗");
line("║  楼光の館 ・ 提案B「記憶の塔」 通しシミュレーション   ║");
line("╚══════════════════════════════════════════════════════╝");

// 4潜行：ボス記憶tier（初遭遇→再戦→雪辱）と “また登る” の蓄積（3回で章introが変わる）を見せる台本。
runOnce(1, { seed: "sim-run-1", restAt: 4, bossWin: () => true,  wipeFloor: 13 }); // 初遭遇→勝ち、13階で散る
runOnce(2, { seed: "sim-run-2", restAt: 5, bossWin: () => false, wipeFloor: 10 }); // 再戦→負け（群像に1敗＝以後“雪辱”）
runOnce(3, { seed: "sim-run-3", restAt: 6, bossWin: () => true,  wipeFloor: 18 }); // 雪辱→勝ち、自己ベスト更新中に散る
runOnce(4, { seed: "sim-run-4", restAt: 7, bossWin: () => true,  wipeFloor: 21 }); // “また登る”4回目＝相棒が性分を覚えている

// 宝珠解禁の仕組み（大2は触らない＝comingSoon。内容付き封章なら宝珠で開ける）
hr();
line("【宝珠で章解禁（仕組みの確認）】");
profile.orbs = 50;
const ch2 = chaptersWithState(profile.roguelite.chaptersCleared, profile.roguelite.chaptersUnlocked).find((c) => c.comingSoon);
line(`  所持宝珠 ${profile.orbs}。第二の記憶（空・comingSoon）を宝珠で解く？ → ${canOrbUnlock(ch2, [], [], profile.orbs) ? "可" : "不可（大2は不可侵）"}`);
const synth = { id: "future", comingSoon: false, unlock: "mentor", orbUnlockCost: 30 };
line(`  もし“内容付き・封・宝珠30”の章があれば？ → ${canOrbUnlock(synth, [], [], profile.orbs) ? "宝珠30で先行解禁できる（別ルート成立）" : "不可"}`);

hr();
line("シミュレーション完了。");
