// 天啓ドラ寄せ（ドラニエル・dora-pull）の Phase7 結線ユニット検証。Run: node test/dorapull.mjs
// 基準帯テーブル（lv-dora-pull）／Lv5≡フリー対戦の無param生成／局数ゲート（maxHands）／
// 超越帯＝「背水の天啓」（lastStand：持ち点が薄いほど張った局の確定ドラが増える）を確認する。
// めくり→確定ドラ後付け（apply/MODIFY_SCORE）と四開槓ガードは test/smoke.mjs がゲーム実走でカバー済み。
import "../src/abilities/builtins/index.js"; // 能力を登録
import { createAbility } from "../src/abilities/registry.js";
import { DoraPullAbility } from "../src/abilities/builtins/drawAbilities.js";
import { Hooks } from "../src/abilities/hooks.js";
import { skillRuntimeAbilityParams } from "../src/data/skillLevelMaster.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };

// runtimeParams（Lv → params）から能力を生成。
const ab = (lv) => createAbility("dora-pull", skillRuntimeAbilityParams("lv-dora-pull", lv));
const api = (over = {}) => ({ me: { index: 0 }, state: { wouldSuukaikanAbortFrom: () => false, honba: 0 }, log() {}, ...over });
// 背水判定用の勝者モック（開始点25000）。
const winner = (points, isDealer = false) => ({ points, isDealer, character: { stats: { startingPoints: 25000 } } });

// ---- 0) テーブル：skillRuntimeAbilityParams が期待値どおり ----
{
  const lv1 = skillRuntimeAbilityParams("lv-dora-pull", 1);
  ok("Lv1: maxHands=1 / maxCharges=1 / 背水無し",
    lv1.maxHands === 1 && lv1.maxCharges === 1 && lv1.lastStand.length === 0);
  const lv2 = skillRuntimeAbilityParams("lv-dora-pull", 2);
  ok("Lv2: maxHands=2 / maxCharges=1（局数が先に伸びる）", lv2.maxHands === 2 && lv2.maxCharges === 1);
  const lv3 = skillRuntimeAbilityParams("lv-dora-pull", 3);
  ok("Lv3: maxHands=2 / maxCharges=2（現行数値に到達）", lv3.maxHands === 2 && lv3.maxCharges === 2);
  const lv5 = skillRuntimeAbilityParams("lv-dora-pull", 5);
  ok("Lv5: maxHands=2 / maxCharges=2 / 背水無し（完成基準）",
    lv5.maxHands === 2 && lv5.maxCharges === 2 && lv5.lastStand.length === 0);
  const lv6 = skillRuntimeAbilityParams("lv-dora-pull", 6);
  ok("Lv6: maxCharges=3（1局3めくり＝火柱と崖の深化）", lv6.maxCharges === 3 && lv6.maxHands === 2);
  const lv7 = skillRuntimeAbilityParams("lv-dora-pull", 7);
  ok("Lv7: maxHands=3（1ゲーム3局）", lv7.maxHands === 3 && lv7.maxCharges === 3);
  const lv8 = skillRuntimeAbilityParams("lv-dora-pull", 8);
  ok("Lv8: 背水の天啓・解禁（25%以下で+1）",
    lv8.lastStand.length === 1 && lv8.lastStand[0].ratio === 0.25 && lv8.lastStand[0].bonus === 1);
  const lv9 = skillRuntimeAbilityParams("lv-dora-pull", 9);
  ok("Lv9: 背水の閾値が50%に拡大", lv9.lastStand.length === 1 && lv9.lastStand[0].ratio === 0.5);
  const lv10 = skillRuntimeAbilityParams("lv-dora-pull", 10);
  ok("Lv10: 二段の背水（50%で+1・25%で+2）",
    lv10.lastStand.length === 2 && lv10.lastStand.some((s) => s.ratio === 0.25 && s.bonus === 2));
}

// ---- 1) Lv5 ≡ フリー対戦：無param生成と Lv5 params 生成が一致 ----
{
  const free = new DoraPullAbility();  // フリー対戦のドラニエル（無param＝abilityMaster 既定）
  const lv5 = ab(5);
  ok("Lv5≡フリー対戦: maxHands=2 で一致", free.maxHands === 2 && lv5.maxHands === 2);
  ok("Lv5≡フリー対戦: maxCharges=2 で一致", free.maxCharges === 2 && lv5.maxCharges === 2);
  ok("Lv5≡フリー対戦: 背水無しで一致", free.lastStand.length === 0 && lv5.lastStand.length === 0);
}

// ---- 2) 局数ゲート（activationCondition × maxHands）----
{
  // Lv1（1ゲーム1局×1回）: 1局目は発動可、次の局では新規発動できない。
  const a = ab(1);
  ok("Lv1: 未使用なら発動条件OK", a.activationCondition(api()) === true);
  ok("Lv1: activate 成功（チャージ1消費）", a.activate() === true && a.charges === 0);
  ok("Lv1: 同一局内は条件true（継続枠）", a.activationCondition(api()) === true);
  ok("Lv1: ただしチャージ切れで canActivate=false", a.canActivate(api()) === false);
  a.resetForHand();
  ok("Lv1: 新しい局では発動不可（1ゲーム1局を使い切り）", a.activationCondition(api()) === false);

  // Lv5（2局）: 2局目まで可、3局目は不可。
  const b = ab(5);
  b.activate(); b.resetForHand();
  ok("Lv5: 2局目も発動可", b.activationCondition(api()) === true);
  b.activate(); b.resetForHand();
  ok("Lv5: 3局目は発動不可（1ゲーム2局を使い切り）", b.activationCondition(api()) === false);

  // Lv7（3局）: 3局目も発動可、4局目は不可。
  const c = ab(7);
  c.activate(); c.resetForHand(); c.activate(); c.resetForHand();
  ok("Lv7: 3局目も発動可（maxHands=3）", c.activationCondition(api()) === true);
  c.activate(); c.resetForHand();
  ok("Lv7: 4局目は発動不可", c.activationCondition(api()) === false);

  // Lv6: 1局に3回めくれる（maxCharges=3）。実ゲーム同様 apply→activate の順で叩く。
  const d = ab(6);
  const gameMock = { log() {}, revealKanDoraFrom() {} };
  const playerMock = { index: 0, character: { name: "x" } };
  ok("Lv6: charges=3 で開始", d.charges === 3);
  for (let i = 0; i < 3; i++) { d.apply(gameMock, playerMock, {}); d.activate(); }
  ok("Lv6: 同一局に3回発動できる（活性化3・チャージ0）", d._activationsThisHand === 3 && d.charges === 0);

  // 四開槓ガード: この発動が流局を引き起こすなら塞ぐ（全Lv共通）。
  const e = ab(10);
  ok("四開槓ガード: wouldSuukaikanAbortFrom=true なら発動不可",
    e.activationCondition(api({ state: { wouldSuukaikanAbortFrom: () => true } })) === false);

  // resetForGame で局数カウンタが戻る。
  a.resetForGame();
  ok("Lv1: resetForGame で再び発動可", a.activationCondition(api()) === true);
}

// ---- 3) 超越帯＝背水の天啓（lastStandBonus / MODIFY_SCORE 結線） ----
{
  // lastStandBonus 単体（開始点25000）。
  ok("Lv5: 背水無し＝どんな点でも bonus 0", ab(5).lastStandBonus(winner(1000)) === 0);
  const a8 = ab(8);
  ok("Lv8: 6000点(24%)で bonus 1", a8.lastStandBonus(winner(6000)) === 1);
  ok("Lv8: 7000点(28%)は bonus 0（閾値25%の外）", a8.lastStandBonus(winner(7000)) === 0);
  const a9 = ab(9);
  ok("Lv9: 12000点(48%)で bonus 1（閾値50%）", a9.lastStandBonus(winner(12000)) === 1);
  const a10 = ab(10);
  ok("Lv10: 12000点(48%)で bonus 1", a10.lastStandBonus(winner(12000)) === 1);
  ok("Lv10: 6000点(24%)で bonus 2（最深段を採用）", a10.lastStandBonus(winner(6000)) === 2);
  ok("Lv10: 20000点(80%)は bonus 0", a10.lastStandBonus(winner(20000)) === 0);
  ok("背水: startingPoints 不明なら安全に 0", a10.lastStandBonus({ points: 100, character: { stats: {} } }) === 0);

  // MODIFY_SCORE 結線: 張った局（activations>0）の和了で「めくり回数＋背水」が確定ドラとして乗る。
  const result = () => ({ valid: true, isYakuman: false, dora: 0, totalHan: 2, fu: 30, ron: 2000, total: 2000 });
  const score = (a, w, r) => a[Hooks.MODIFY_SCORE]({ winner: w }, api(), r);
  {
    const a = ab(10);
    a._activationsThisHand = 1;
    const out = score(a, winner(6000), result());
    ok("Lv10: めくり1＋背水2＝確定ドラ3が乗る（totalHan 2→5）", out && out.totalHan === 5 && out.dora === 3);
    const b = ab(10);
    b._activationsThisHand = 2;
    const out2 = score(b, winner(20000), result());
    ok("Lv10: 背水圏外はめくり回数ぶんのみ（totalHan 2→4）", out2 && out2.totalHan === 4);
    // 張っていない局（activations=0）は背水があっても素通し＝発動した局限定。
    const c = ab(10);
    ok("Lv10: 未発動局は背水があっても素通し(undefined)", score(c, winner(6000), result()) === undefined);
    // 役満は対象外（既存仕様の維持）。
    const d = ab(10);
    d._activationsThisHand = 1;
    ok("Lv10: 役満は素通し(undefined)", score(d, winner(6000), { valid: true, isYakuman: true, totalHan: 13, fu: 30, total: 32000 }) === undefined);
  }
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
