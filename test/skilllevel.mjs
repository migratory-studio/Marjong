// スキルLv対局反映（Phase 7・§10.5）の回帰テスト（DOM不要）。Run: node test/skilllevel.mjs
// 幸運のツモ（lv-lucky-draw）: lookaheadDepth / doraPreference / dangerTier /
// maxChargesOverride が LuckyDrawAbility に効くことを確認する。
import { skillRuntimeAbilityParams, skillLevelEntry, SKILL_LEVEL_MASTER } from "../src/data/skillLevelMaster.js";
const LUCKY_DRAW_LEVELS = SKILL_LEVEL_MASTER["lv-lucky-draw"];
import { createAbility } from "../src/abilities/registry.js";
import { Hooks } from "../src/abilities/hooks.js";
import { LuckyDrawAbility } from "../src/abilities/builtins/drawAbilities.js";
import {
  estimateDangerInfo, DangerSenseAbility, DANGER_SUPER, DANGER_HIGH, DANGER_WARN,
} from "../src/abilities/builtins/defenseAbilities.js";
import { makeKind, makeHonor } from "../src/core/tiles.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };

const M = (r) => makeKind("m", r), P = (r) => makeKind("p", r), S = (r) => makeKind("s", r);
const tile = (kind, opts = {}) => ({ id: tile._id++, kind, red: !!opts.red });
tile._id = 1;
const noopApi = { log() {} };

// ---- skillRuntimeAbilityParams: Lv エントリ → params の畳み込み ----
{
  const lv1 = skillRuntimeAbilityParams("lv-lucky-draw", 1);
  ok("Lv1: lookaheadDepth=2 / maxCharges=1 に畳み込まれる",
    lv1.lookaheadDepth === 2 && lv1.maxCharges === 1 && lv1.dangerTier === 0 && lv1.doraPreference === false);
  const lv10 = skillRuntimeAbilityParams("lv-lucky-draw", 10);
  ok("Lv10: depth=8 / dangerTier=3 / doraPreference / maxCharges=3",
    lv10.lookaheadDepth === 8 && lv10.dangerTier === 3 && lv10.doraPreference === true && lv10.maxCharges === 3);
  ok("未知テーブル/Lvは空 params（従来挙動）",
    Object.keys(skillRuntimeAbilityParams("lv-unknown", 1)).length === 0 &&
    Object.keys(skillRuntimeAbilityParams("lv-lucky-draw", 99)).length === 0);
  ok("Lv5 エントリが存在し候補窓の天井(8)を超えない",
    LUCKY_DRAW_LEVELS.every((e) => e.runtimeParams.lookaheadDepth <= 8) &&
    skillLevelEntry("lv-lucky-draw", 5).runtimeParams.lookaheadDepth === 8);
}

// ---- maxChargesOverride: createAbility 経由で発動回数が変わる ----
{
  const lv1 = createAbility("lucky-draw", skillRuntimeAbilityParams("lv-lucky-draw", 1));
  ok("Lv1: maxCharges=1（1ゲーム1局）", lv1.maxCharges === 1 && lv1.charges === 1);
  const lv7 = createAbility("lucky-draw", skillRuntimeAbilityParams("lv-lucky-draw", 7));
  ok("Lv7: maxCharges=3（1ゲーム3局）", lv7.maxCharges === 3 && lv7.charges === 3);
  // 既存キャラ（params 無し）は abilityMaster 既定のまま＝詩玥たちの挙動を変えない。
  const plain = createAbility("lucky-draw");
  ok("params 無し: 既定 maxCharges=2 / depth=8 / dangerTier=0",
    plain.maxCharges === 2 && plain.lookaheadDepth === 8 && plain.dangerTier === 0 && plain.doraPreference === false);
}

// ---- lookaheadDepth: 先頭N件しか走査しない ----
// テンパイ手 123m456m789m23s11p（待ち 1s/4s）。和了牌 1s を候補の5番目に置く:
//   depth=8（Lv5）→ 1s を見つけて引き寄せる / depth=2（Lv1）→ 窓の外なので通常ツモ。
{
  const hand = [M(1),M(2),M(3), M(4),M(5),M(6), M(7),M(8),M(9), S(2),S(3), P(1),P(1)]
    .map((k) => tile(k));
  const junk = () => tile(makeHonor(3)); // 西（手と無関係）
  const candidates = [junk(), junk(), junk(), junk(), tile(S(1)), junk(), junk(), junk()];
  const draw = (depth) => {
    const ab = new LuckyDrawAbility({ lookaheadDepth: depth });
    ab.activate();
    const ctx = { player: { hand, melds: [] }, wall: { doraKinds: () => [] }, candidates, defaultTile: candidates[0] };
    return ab[Hooks.MODIFY_DRAW](ctx, noopApi);
  };
  ok("depth=8: 5番目の和了牌(1s)を引き寄せる", draw(8)?.kind === S(1));
  ok("depth=2: 窓の外の和了牌は見えず通常ツモ（先頭候補）", draw(2) === candidates[0]);
  ok("depth=4: 境界の外（index4）はまだ見えない", draw(4) === candidates[0]);
  ok("depth=5: 境界ちょうどで見える", draw(5)?.kind === S(1));
  // 非発動なら何もしない（undefined ＝通常ツモ）。
  const idle = new LuckyDrawAbility({ lookaheadDepth: 8 });
  ok("未発動時は介入しない", idle[Hooks.MODIFY_DRAW](
    { player: { hand, melds: [] }, wall: { doraKinds: () => [] }, candidates, defaultTile: candidates[0] }, noopApi) === undefined);
}

// ---- doraPreference: 同点（どちらも和了牌）ならドラ/赤5を優先 ----
{
  const hand = [M(1),M(2),M(3), M(4),M(5),M(6), M(7),M(8),M(9), S(2),S(3), P(1),P(1)]
    .map((k) => tile(k));
  const draw = (pref, candidates, doraKinds = []) => {
    const ab = new LuckyDrawAbility({ lookaheadDepth: 8, doraPreference: pref });
    ab.activate();
    const ctx = { player: { hand, melds: [] }, wall: { doraKinds: () => doraKinds }, candidates, defaultTile: candidates[0] };
    return ab[Hooks.MODIFY_DRAW](ctx, noopApi);
  };
  // 1s も 4s も和了＝同点。4s がドラのとき:
  const c1 = [tile(S(1)), tile(S(4))];
  ok("doraPreference=false: 同点なら先勝ち(1s)", draw(false, c1, [S(4)])?.kind === S(1));
  ok("doraPreference=true: 同点ならドラ(4s)を優先", draw(true, c1, [S(4)])?.kind === S(4));
  // 赤牌フラグでも優先される（doraKinds に依らない）。
  const c2 = [tile(S(1)), tile(S(4), { red: true })];
  ok("doraPreference=true: 同点なら赤牌を優先", draw(true, c2, []).red === true);
  // 同点でない（片方しか和了でない）なら伸び優先のまま。
  const c3 = [tile(S(1)), tile(makeHonor(3), { red: true })];
  ok("doraPreference=true でも伸びが上の牌が勝つ", draw(true, c3, [makeHonor(3)])?.kind === S(1));
}

// ---- dangerTier: マモリの危険感知の副次付与（パッシブ・段階フィルタ） ----
{
  // リーチ者1人（現物は 1m のみ）。
  const opp = { riichi: true, melds: [], discards: [{ kind: M(1) }] };
  const api = { opponents: () => [opp], log() {} };
  const full = estimateDangerInfo([opp]);
  ok("estimateDangerInfo: 3段階すべて出る",
    full.some((d) => d.level === DANGER_SUPER) && full.some((d) => d.level === DANGER_HIGH) && full.some((d) => d.level === DANGER_WARN));
  ok("estimateDangerInfo: 現物(1m)は出ない", !full.some((d) => d.kind === M(1)));

  const info = (tier) => {
    const ab = new LuckyDrawAbility({ dangerTier: tier });
    return ab[Hooks.PROVIDE_DANGER_INFO]({ player: {} }, api); // 発動していない＝パッシブ動作の確認
  };
  ok("tier0: 危険情報を出さない", info(0) === undefined);
  const t1 = info(1), t2 = info(2), t3 = info(3);
  ok("tier1: 超危険(赤)のみ", t1.length > 0 && t1.every((d) => d.level === DANGER_SUPER));
  ok("tier2: 赤＋橙のみ", t2.length > t1.length && t2.every((d) => d.level >= DANGER_HIGH));
  ok("tier3: フル3段階＝マモリと同一", JSON.stringify(t3) === JSON.stringify(full));
  // 本家マモリ（danger-sense）が従来どおり全段階を返すこと（リファクタ回帰）。
  const mamori = new DangerSenseAbility();
  ok("danger-sense は従来どおりフル出力", JSON.stringify(mamori[Hooks.PROVIDE_DANGER_INFO]({ player: {} }, api)) === JSON.stringify(full));
  // 脅威がいなければ空。
  const calm = { riichi: false, melds: [], discards: [] };
  ok("脅威なしなら空配列", info(3) !== undefined && new LuckyDrawAbility({ dangerTier: 3 })[Hooks.PROVIDE_DANGER_INFO]({ player: {} }, { opponents: () => [calm], log() {} }).length === 0);
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
