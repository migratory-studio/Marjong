// 模範解答（篠宮 栞・lv-model-answer）のスキルLv反映の回帰テスト（DOM不要）。
// Run: node test/modelanswer.mjs
//   - skillRuntimeAbilityParams が candidateCount / shantenThreshold / showComeback / showPushFold を畳む
//   - ModelAnswerAbility が候補数・シャンテン閾値・トップ捲り条件・押し引き判断を返す
import { skillRuntimeAbilityParams, SKILL_LEVEL_MASTER } from "../src/data/skillLevelMaster.js";
import { createAbility } from "../src/abilities/registry.js";
import { Hooks } from "../src/abilities/hooks.js";
import { ModelAnswerAbility, bestDiscardRanking } from "../src/abilities/builtins/teacherAbility.js";
import { shanten } from "../src/core/rules/shanten.js";
import { makeKind, makeHonor } from "../src/core/tiles.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };

const M = (r) => makeKind("m", r), P = (r) => makeKind("p", r), S = (r) => makeKind("s", r);
const countsOf = (kinds) => { const c = new Array(34).fill(0); for (const k of kinds) c[k]++; return c; };
// counts → me 風オブジェクト（counts()/numMeldSets()）。
const mePlayer = (counts, { points = 25000, riichi = false, melds = [], discards = [] } = {}) =>
  ({ counts: () => counts.slice(), numMeldSets: () => melds.length, points, riichi, melds, discards });
const apiOf = (me, opponents = [], wall = { liveRemaining: 50 }) =>
  ({ me, opponents: () => opponents, state: { wall } });

// ---- skillRuntimeAbilityParams: Lv エントリ → params の畳み込み ----
{
  const lv1 = skillRuntimeAbilityParams("lv-model-answer", 1);
  ok("Lv1: 候補1・閾値3・捲り/押し引きなし",
    lv1.candidateCount === 1 && lv1.shantenThreshold === 3 && lv1.showComeback === false && lv1.showPushFold === false);
  const lv5 = skillRuntimeAbilityParams("lv-model-answer", 5);
  ok("Lv5: 候補3・閾値2（フリー対戦の栞＝現行既定と一致）",
    lv5.candidateCount === 3 && lv5.shantenThreshold === 2 && lv5.showComeback === false && lv5.showPushFold === false);
  const lv6 = skillRuntimeAbilityParams("lv-model-answer", 6);
  ok("Lv6: 候補3・閾値1（イーシャンテンまで残る）", lv6.candidateCount === 3 && lv6.shantenThreshold === 1);
  const lv7 = skillRuntimeAbilityParams("lv-model-answer", 7);
  ok("Lv7: 捲り条件ON・押し引きOFF", lv7.showComeback === true && lv7.showPushFold === false && lv7.candidateCount === 3);
  const lv9 = skillRuntimeAbilityParams("lv-model-answer", 9);
  ok("Lv9: 候補5・捲り条件ON", lv9.candidateCount === 5 && lv9.showComeback === true && lv9.showPushFold === false);
  const lv10 = skillRuntimeAbilityParams("lv-model-answer", 10);
  ok("Lv10: 候補5・捲り条件ON・押し引きON", lv10.candidateCount === 5 && lv10.showComeback === true && lv10.showPushFold === true);
  // 単調性：候補数は1→1→2→2→3→3→3→4→5→5、閾値は3→2→3→2→2→1→1→1→1→1。
  const tbl = SKILL_LEVEL_MASTER["lv-model-answer"];
  ok("候補数の系列が仕様どおり",
    JSON.stringify(tbl.map((e) => e.runtimeParams.candidateCount)) === JSON.stringify([1,1,2,2,3,3,3,4,5,5]));
  ok("シャンテン閾値の系列が仕様どおり",
    JSON.stringify(tbl.map((e) => e.runtimeParams.shantenThreshold)) === JSON.stringify([3,2,3,2,2,1,1,1,1,1]));
}

// ---- createAbility 既定（params 無し）＝Lv5 相当 ----
{
  const def = createAbility("model-answer");
  ok("既定: 候補3・閾値2・捲り/押し引きなし（フリー対戦の栞）",
    def.candidateCount === 3 && def.shantenThreshold === 2 && def.showComeback === false && def.showPushFold === false);
}

// ---- PROVIDE_BEST_DISCARDS: 候補数・シャンテン閾値 ----
{
  // 14枚のばらけた手（打牌局面・3n+2）。実シャンテン S は ranked 先頭で測る。
  const counts = countsOf([M(1),M(1),M(3),M(5),M(7),M(9), P(2),P(4),P(6),P(8), S(3),S(5),S(7),S(9)]);
  const total = counts.reduce((a, b) => a + b, 0);
  ok("テスト手は14枚（打牌局面）", total === 14);
  const S0 = bestDiscardRanking(counts, 0)[0].shanten;
  ok("テスト手は2シャンテン以上（閾値検証に適する）", S0 >= 2);

  const run = (params) => {
    const ab = new ModelAnswerAbility(params);
    return ab[Hooks.PROVIDE_BEST_DISCARDS]({ player: null }, { me: mePlayer(counts) });
  };
  // 閾値ちょうど（S0）なら点灯、S0+1 なら消える。
  const atThresh = run({ candidateCount: 3, shantenThreshold: S0 });
  ok("閾値=実シャンテンなら点灯（候補3）", Array.isArray(atThresh) && atThresh.length === 3);
  ok("候補は rank 1..3 連番", atThresh.every((e, i) => e.rank === i + 1));
  ok("閾値=実シャンテン+1 なら消える（テンパイ近くは自分で打たせる）",
    run({ candidateCount: 3, shantenThreshold: S0 + 1 }) === undefined);
  // 候補数の上限。
  ok("候補1（Lv1/2）", run({ candidateCount: 1, shantenThreshold: S0 }).length === 1);
  ok("候補5（Lv9/10）", run({ candidateCount: 5, shantenThreshold: S0 }).length === 5);

  // 待ち中（13枚＝3n+1）では候補を出さない。
  const counts13 = counts.slice(); counts13[M(1)]--; // 13枚に
  const ab = new ModelAnswerAbility({ candidateCount: 3, shantenThreshold: 1 });
  ok("打牌局面でない（13枚）なら出さない",
    ab[Hooks.PROVIDE_BEST_DISCARDS]({ player: null }, { me: mePlayer(counts13) }) === undefined);
}

// ---- PROVIDE_COMEBACK_PLAN（Lv7+）: トップ捲り条件 ----
{
  const counts = countsOf([M(1),M(2),M(3),M(4),M(5),M(6),M(7),M(8),M(9),S(2),S(3),P(1),P(1)]);
  const me = mePlayer(counts, { points: 20000 });
  const others = [mePlayer(counts, { points: 30000 }), mePlayer(counts, { points: 25000 }), mePlayer(counts, { points: 18000 })];

  const off = new ModelAnswerAbility({ showComeback: false });
  ok("showComeback=false（〜Lv6）は捲り条件を出さない",
    off[Hooks.PROVIDE_COMEBACK_PLAN]({ player: null }, apiOf(me, others)) === undefined);

  const on = new ModelAnswerAbility({ showComeback: true });
  const plan = on[Hooks.PROVIDE_COMEBACK_PLAN]({ player: null }, apiOf(me, others));
  ok("Lv7+: 首位まで10000点・leading=false", plan && plan.leading === false && plan.gapToTop === 10000);
  // 直撃はスイング2V>gap → V>5000 → 100点単位で 5100。ツモ/出和了は安全側に gap+1→10100。
  ok("直撃ライン=5100点（スイング2V）", plan.direct === 5100);
  ok("ツモ・出和了ライン=10100点", plan.tsumo === 10100);
  ok("板書は3行（点差・直撃・ツモ）", Array.isArray(plan.lines) && plan.lines.length === 3);

  // 首位なら leading=true。
  const meTop = mePlayer(counts, { points: 40000 });
  const plan2 = on[Hooks.PROVIDE_COMEBACK_PLAN]({ player: null }, apiOf(meTop, others));
  ok("首位なら leading=true・守りの板書", plan2 && plan2.leading === true && plan2.lines.length === 1);
}

// ---- PROVIDE_PUSHFOLD（Lv10）: 押し引き判断 ----
{
  const tenpai = countsOf([M(1),M(2),M(3),M(4),M(5),M(6),M(7),M(8),M(9),S(2),S(3),P(1),P(1)]); // 0シャンテン
  const far = countsOf([M(1),M(3),M(5),M(7),M(9),P(1),P(3),P(5),P(7),P(9),S(1),S(3),S(9)]);      // 遠い手
  ok("テンパイ手は shanten 0", shanten(tenpai, 0) === 0);
  ok("遠い手は shanten 2 以上", shanten(far, 0) >= 2);

  const riichiOpp = { riichi: true, melds: [], discards: [{ kind: M(1) }], points: 20000 };
  const calmOpp = { riichi: false, melds: [], discards: [], points: 25000 };

  const off = new ModelAnswerAbility({ showPushFold: false });
  ok("showPushFold=false（〜Lv9）は押し引きを出さない",
    off[Hooks.PROVIDE_PUSHFOLD]({ player: null }, apiOf(mePlayer(tenpai), [riichiOpp])) === undefined);

  const ab = new ModelAnswerAbility({ showPushFold: true });
  // 脅威なし → 押し。
  const v0 = ab[Hooks.PROVIDE_PUSHFOLD]({ player: null }, apiOf(mePlayer(tenpai), [calmOpp, calmOpp, calmOpp]));
  ok("脅威なし＝押し", v0 && v0.verdict === "push");
  // 脅威あり×テンパイ → 押し（受けて立つ）。
  const v1 = ab[Hooks.PROVIDE_PUSHFOLD]({ player: null }, apiOf(mePlayer(tenpai), [riichiOpp, calmOpp, calmOpp]));
  ok("脅威あり×テンパイ＝押し", v1 && v1.verdict === "push");
  // 脅威あり×遠い手 → オリ。
  const v2 = ab[Hooks.PROVIDE_PUSHFOLD]({ player: null }, apiOf(mePlayer(far), [riichiOpp, calmOpp, calmOpp]));
  ok("脅威あり×遠い手＝オリ", v2 && v2.verdict === "fold");
  // 脅威あり×大量リード×終盤×テンパイ → オリ（守り切り）。
  const meBig = mePlayer(tenpai, { points: 50000 });
  const v3 = ab[Hooks.PROVIDE_PUSHFOLD]({ player: null }, apiOf(meBig, [riichiOpp, { ...calmOpp, points: 20000 }], { liveRemaining: 8 }));
  ok("大量リード×終盤×テンパイ＝オリ", v3 && v3.verdict === "fold");
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
