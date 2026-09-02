// 泥中の蓮（沼田 蓮・lv-muddy-lotus）の回帰テスト（DOM不要）。
// Run: node test/muddylotus.mjs
//   - skillRuntimeAbilityParams が reduceRate / cheapHanMax / cheapMultiplier / absorbRate を畳む
//   - MuddyLotusAbility（MODIFY_SCORE_GLOBAL）: 他人のアガリ減少・自分の3ハン以下だけ倍率・
//     手の格（rank/totalHan）は不変
//   - 超越帯: 沈殿の累積と MODIFY_POINT_DELTA での吸い上げ（非ゼロサム加点・吸ったら流れる）
//   - AbilityManager.modifyScoreTraced が全員の MODIFY_SCORE_GLOBAL を席順で通し、減少ステップを積む
import { skillRuntimeAbilityParams, SKILL_LEVEL_MASTER } from "../src/data/skillLevelMaster.js";
import { createAbility, AbilityManager } from "../src/abilities/registry.js";
import { Hooks } from "../src/abilities/hooks.js";
import { MuddyLotusAbility } from "../src/abilities/builtins/muddyLotusAbility.js";
import "../src/abilities/builtins/index.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };

// api スタブ（log は捨てる）。me はプレイヤー同一性判定にだけ使う。
const apiOf = (me) => ({ me, log: () => {} });

// ---- skillRuntimeAbilityParams: Lv エントリ → params の畳み込み ----
{
  const tbl = SKILL_LEVEL_MASTER["lv-muddy-lotus"];
  ok("テーブルは Lv1〜10 の10段", tbl.length === 10 && tbl[0].skillLevel === 1 && tbl[9].skillLevel === 10);
  ok("泥（reduceRate）の系列が仕様どおり",
    JSON.stringify(tbl.map((e) => e.runtimeParams.reduceRate)) ===
    JSON.stringify([0.10, 0.15, 0.20, 0.20, 0.25, 0.25, 0.25, 0.30, 0.30, 0.30]));
  ok("蓮（cheapMultiplier）の系列が仕様どおり",
    JSON.stringify(tbl.map((e) => e.runtimeParams.cheapMultiplier)) ===
    JSON.stringify([1.2, 1.3, 1.3, 1.4, 1.5, 1.5, 1.5, 1.5, 1.6, 1.6]));
  ok("吸い上げ（absorbRate）は超越帯 Lv6+ のみ",
    JSON.stringify(tbl.map((e) => e.runtimeParams.absorbRate)) ===
    JSON.stringify([0, 0, 0, 0, 0, 0.15, 0.25, 0.25, 0.35, 0.50]));
  ok("cheapHanMax は全Lv固定 3（安手の美学は不変）",
    tbl.every((e) => e.runtimeParams.cheapHanMax === 3));
  const lv5 = skillRuntimeAbilityParams("lv-muddy-lotus", 5);
  ok("Lv5: 泥-25%・蓮1.5倍・吸い上げなし（フリー対戦の沼田）",
    lv5.reduceRate === 0.25 && lv5.cheapMultiplier === 1.5 && lv5.absorbRate === 0);
}

// ---- createAbility 既定（params 無し）＝Lv5 相当 ----
{
  const def = createAbility("muddy-lotus");
  ok("既定: 泥0.25・蓮1.5・ハン閾値3・吸い上げ0（フリー対戦の沼田＝Lv5）",
    def.reduceRate === 0.25 && def.cheapMultiplier === 1.5 && def.cheapHanMax === 3 && def.absorbRate === 0);
}

// ---- MODIFY_SCORE_GLOBAL: 泥（他人のアガリ減少）----
{
  const ab = new MuddyLotusAbility();
  const me = { name: "ren" };
  const other = { isDealer: false };
  const result = { valid: true, totalHan: 5, fu: 30, rank: "満貫", yaku: [{ name: "テスト", han: 5 }], ron: 8000, total: 8000 };
  const out = ab[Hooks.MODIFY_SCORE_GLOBAL]({ winner: other, result }, apiOf(me), result);
  ok("他人の満貫ロン 8000 → 6000（-25%）", out.ron === 6000 && out.total === 6000);
  ok("手の格は不変（rank/totalHan/yaku に触れない＝琥珀の盾の閾値判定を壊さない）",
    out.rank === "満貫" && out.totalHan === 5 && out.yaku === result.yaku);

  const tsumoRes = { valid: true, totalHan: 5, fu: 30, rank: "満貫", tsumoEach: { dealer: 4000, nonDealer: 2000 }, total: 8000 };
  const out2 = ab[Hooks.MODIFY_SCORE_GLOBAL]({ winner: other, result: tsumoRes }, apiOf(me), tsumoRes);
  ok("他人の満貫ツモ 4000/2000 → 3000/1500・total再計算=6000",
    out2.tsumoEach.dealer === 3000 && out2.tsumoEach.nonDealer === 1500 && out2.total === 6000);
  ok("端数は100点単位に切り上げ（7700→5775→5800）",
    ab[Hooks.MODIFY_SCORE_GLOBAL]({ winner: other, result: { valid: true, totalHan: 4, ron: 7700, total: 7700 } }, apiOf(me),
      { valid: true, totalHan: 4, ron: 7700, total: 7700 }).ron === 5800);
}

// ---- MODIFY_SCORE_GLOBAL: 蓮（自分の3ハン以下は対象外・倍率）／自分の大物手は沈む ----
{
  const ab = new MuddyLotusAbility();
  const me = { isDealer: false, name: "ren" };
  const cheap = { valid: true, totalHan: 3, fu: 30, rank: "", ron: 3900, total: 3900 };
  const out = ab[Hooks.MODIFY_SCORE_GLOBAL]({ winner: me, result: cheap }, apiOf(me), cheap);
  ok("自分の3ハンロン 3900 → 5900（×1.5・切り上げ）", out.ron === 5900 && out.total === 5900);

  const big = { valid: true, totalHan: 5, fu: 30, rank: "満貫", ron: 8000, total: 8000 };
  const out2 = ab[Hooks.MODIFY_SCORE_GLOBAL]({ winner: me, result: big }, apiOf(me), big);
  ok("自分の満貫は他人と同様に泥へ沈む（8000 → 6000）", out2.ron === 6000);

  const yakuman = { valid: true, totalHan: 13, isYakuman: true, rank: "役満", ron: 32000, total: 32000 };
  const out3 = ab[Hooks.MODIFY_SCORE_GLOBAL]({ winner: me, result: yakuman }, apiOf(me), yakuman);
  ok("役満（totalHan13）は蓮の対象外＝沈む", out3.ron === 24000);
}

// ---- 超越帯: 沈殿の累積 → 蓮の和了で吸い上げ（非ゼロサム）→ 沈殿は流れる ----
{
  const ab = new MuddyLotusAbility(skillRuntimeAbilityParams("lv-muddy-lotus", 10));
  const me = { isDealer: false, name: "ren" };
  const other = { isDealer: false };
  const api = apiOf(me);
  // 他人の満貫 8000 → 5600（Lv10 泥-30%）＝沈殿 2400
  const big = { valid: true, totalHan: 5, rank: "満貫", ron: 8000, total: 8000 };
  ab[Hooks.MODIFY_SCORE_GLOBAL]({ winner: other, result: big }, api, big);
  ok("沈殿が溜まる（8000-5600=2400）", ab._sunk === 2400);
  // 自分の蓮（3900 → ×1.6 = 6240 → 6300）
  const cheap = { valid: true, totalHan: 3, ron: 3900, total: 3900 };
  const bloomed = ab[Hooks.MODIFY_SCORE_GLOBAL]({ winner: me, result: cheap }, api, cheap);
  ok("Lv10 の蓮は 1.6 倍（3900 → 6300）", bloomed.ron === 6300);
  // 精算: 獲得 +6300 に沈殿 2400 の 50% ＝ +1200 が乗る
  const delta = ab[Hooks.MODIFY_POINT_DELTA]({ reason: "ron" }, api, 6300);
  ok("吸い上げ: +6300 → +7500（沈殿2400の50%）", delta === 7500);
  ok("吸ったら沈殿は流れる（0に戻る）", ab._sunk === 0);
  ok("二度は吸えない（bloom解除）", ab[Hooks.MODIFY_POINT_DELTA]({ reason: "ron" }, api, 6300) === undefined);
  // 基準帯（absorbRate=0）は蓮が咲いても加点しない
  const ab5 = new MuddyLotusAbility();
  ab5[Hooks.MODIFY_SCORE_GLOBAL]({ winner: other, result: big }, api, big);
  ab5[Hooks.MODIFY_SCORE_GLOBAL]({ winner: me, result: cheap }, api, cheap);
  ok("基準帯は吸い上げなし", ab5[Hooks.MODIFY_POINT_DELTA]({ reason: "ron" }, api, 5900) === undefined);
  // 流局罰符（reason=draw）には触れない（淵の蒐集と住み分け）
  const ab10 = new MuddyLotusAbility({ absorbRate: 0.5 });
  ab10._sunk = 2000; ab10._bloomPending = true;
  ok("流局の精算には乗らない", ab10[Hooks.MODIFY_POINT_DELTA]({ reason: "draw" }, api, 1500) === undefined);
}

// ---- uiState: 泥の水位（沈殿）を卓上の持続レイヤーへ渡す ----
{
  const ab = new MuddyLotusAbility({ absorbRate: 0.5 });
  const me = { name: "ren" };
  const api = apiOf(me);
  ok("uiState は沈殿を返す（初期0）", ab.uiState(api).mud.sunk === 0);
  const big = { valid: true, totalHan: 5, rank: "満貫", ron: 8000, total: 8000 };
  ab[Hooks.MODIFY_SCORE_GLOBAL]({ winner: { isDealer: false }, result: big }, api, big);
  ok("沈めた分が水位として出る（8000→6000＝2000）", ab.uiState(api).mud.sunk === 2000);
  const cheap = { valid: true, totalHan: 3, ron: 3900, total: 3900 };
  ab[Hooks.MODIFY_SCORE_GLOBAL]({ winner: me, result: cheap }, api, cheap);
  ab[Hooks.MODIFY_POINT_DELTA]({ reason: "ron" }, api, 5900);
  ok("吸い上げると水位が引く（蓮が咲く）", ab.uiState(api).mud.sunk === 0);
}

// ---- AbilityManager: 全員の MODIFY_SCORE_GLOBAL が席順で通り、減少ステップが積まれる ----
{
  const mkPlayer = (name, abilities = []) => ({ character: { name }, abilities, isDealer: false });
  const ren = mkPlayer("沼田 蓮", [createAbility("muddy-lotus")]);
  const winner = mkPlayer("焔", []);
  const game = { players: [winner, ren, mkPlayer("A"), mkPlayer("B")], log: () => {} };
  game.players.forEach((pl, i) => { pl.index = i; }); // seat（誰の泥か）を steps に載せるため
  const mgr = new AbilityManager(game);
  const res = { valid: true, totalHan: 5, rank: "満貫", ron: 8000, total: 8000 };
  const traced = mgr.modifyScoreTraced(winner, res);
  ok("勝者以外の席の泥が通る（8000 → 6000）", traced.result.ron === 6000 && traced.result.total === 6000);
  ok("減少ステップが和了演出用に積まれる", traced.steps.length === 1 && traced.steps[0].dir === "down" && traced.steps[0].from === 8000 && traced.steps[0].to === 6000);
  ok("ステップに泥の持ち主の席が載る（和了画面で「誰の泥か」を出す）", traced.steps[0].seat === 1);
  ok("modifyScore（非トレース版）も同じ結果", mgr.modifyScore(winner, res).ron === 6000);
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
