// 天啓ドラ寄せ（ドラニエル・dora-pull）の Phase7 結線ユニット検証。Run: node test/dorapull.mjs
// 基準帯テーブル（lv-dora-pull）／Lv5≡フリー対戦の無param生成／局数ゲート（maxHands）／
// 超越帯のツモ偏重（MODIFY_DRAW＝ルクスの山読み・ドラ手繰り・doraTolerance）を確認する。
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
const api = (over = {}) => ({ me: { index: 0 }, state: { wouldSuukaikanAbortFrom: () => false }, log() {}, ...over });
// MODIFY_DRAW を叩く薄いラッパ。hand は kind 配列、candidates は tile オブジェクト配列。
const t = (kind, red = false) => ({ kind, red });
const draw = (a, handKinds, candidates, doraKinds = []) =>
  a[Hooks.MODIFY_DRAW](
    { player: { hand: handKinds.map((k) => t(k)), melds: [] }, wall: { doraKinds: () => doraKinds }, candidates, defaultTile: candidates[0] },
    api(),
  );

// ---- 0) テーブル：skillRuntimeAbilityParams が期待値どおり ----
{
  const lv1 = skillRuntimeAbilityParams("lv-dora-pull", 1);
  ok("Lv1: maxHands=1 / maxCharges=1 / bias無し",
    lv1.maxHands === 1 && lv1.maxCharges === 1 && lv1.doraDrawBias === false);
  const lv2 = skillRuntimeAbilityParams("lv-dora-pull", 2);
  ok("Lv2: maxHands=2 / maxCharges=1（局数が先に伸びる）", lv2.maxHands === 2 && lv2.maxCharges === 1);
  const lv3 = skillRuntimeAbilityParams("lv-dora-pull", 3);
  ok("Lv3: maxHands=2 / maxCharges=2（現行数値に到達）", lv3.maxHands === 2 && lv3.maxCharges === 2);
  const lv5 = skillRuntimeAbilityParams("lv-dora-pull", 5);
  ok("Lv5: maxHands=2 / maxCharges=2 / bias無し（完成基準）",
    lv5.maxHands === 2 && lv5.maxCharges === 2 && lv5.doraDrawBias === false);
  const lv6 = skillRuntimeAbilityParams("lv-dora-pull", 6);
  ok("Lv6: bias有効 / lookahead=2 / tolerance=0",
    lv6.doraDrawBias === true && lv6.lookaheadDepth === 2 && lv6.doraTolerance === 0);
  const lv9 = skillRuntimeAbilityParams("lv-dora-pull", 9);
  ok("Lv9: lookahead=8（最大）/ tolerance=0", lv9.lookaheadDepth === 8 && lv9.doraTolerance === 0);
  const lv10 = skillRuntimeAbilityParams("lv-dora-pull", 10);
  ok("Lv10: lookahead=8 / tolerance=50（同シャンテンならドラを掴む）",
    lv10.lookaheadDepth === 8 && lv10.doraTolerance === 50);
}

// ---- 1) Lv5 ≡ フリー対戦：無param生成と Lv5 params 生成が一致 ----
{
  const free = new DoraPullAbility();  // フリー対戦のドラニエル（無param＝abilityMaster 既定）
  const lv5 = ab(5);
  ok("Lv5≡フリー対戦: maxHands=2 で一致", free.maxHands === 2 && lv5.maxHands === 2);
  ok("Lv5≡フリー対戦: maxCharges=2 で一致", free.maxCharges === 2 && lv5.maxCharges === 2);
  ok("Lv5≡フリー対戦: 超越バイアス無しで一致", free.doraDrawBias === false && lv5.doraDrawBias === false);
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

  // 四開槓ガード: この発動が流局を引き起こすなら塞ぐ（全Lv共通）。
  const c = ab(10);
  ok("四開槓ガード: wouldSuukaikanAbortFrom=true なら発動不可",
    c.activationCondition(api({ state: { wouldSuukaikanAbortFrom: () => true } })) === false);

  // resetForGame で局数カウンタが戻る。
  a.resetForGame();
  ok("Lv1: resetForGame で再び発動可", a.activationCondition(api()) === true);
}

// ---- 3) 超越帯のツモ偏重（MODIFY_DRAW）----
// 手13枚: 123m 456m 79m(カンチャン) 1z(浮き) 44p 56s ＝イーシャンテン。
//   候補A=8m(kind7) → 789m完成→テンパイ（待ち4s/7s＝2種・広い）
//   候補D=4s(kind21・ドラ) → 456s完成→テンパイ（待ち8m＝1種・狭い）
// 同シャンテン（どちらもテンパイ）で受けの広さだけが違う＝doraTolerance の検証形。
const HAND_IISHANTEN = [0, 1, 2, 3, 4, 5, 6, 8, 27, 12, 12, 22, 23];
{
  // bias 無し（Lv5）は発動局でも介入しない。
  const a = ab(5); a.activate();
  ok("Lv5: bias無し＝MODIFY_DRAW は素通し(undefined)",
    draw(a, HAND_IISHANTEN, [t(7), t(21)], [21]) === undefined);

  // bias 有りでも未発動局（_usedThisHand=false）は介入しない＝賭けた局にだけ働く。
  const b = ab(6);
  ok("Lv6: 未発動局は素通し(undefined)", draw(b, HAND_IISHANTEN, [t(7), t(21)], [21]) === undefined);

  // Lv6（tolerance=0・lookahead2）: 伸びが上の非ドラ(A)を選ぶ＝ドラ(D)には浮気しない。
  const c = ab(6); c.activate();
  const pickC = draw(c, HAND_IISHANTEN, [t(21), t(7)], [21]); // 窓2に両方入る並び
  ok("Lv6: 伸び優先＝広いテンパイへ進む8mを引く（ドラでも狭い4sは選ばない）", pickC && pickC.kind === 7);

  // Lv10（tolerance=50）: 同シャンテンなら受けの広さを捨ててドラを掴む。
  const d = ab(10); d.activate();
  const pickD = draw(d, HAND_IISHANTEN, [t(7), t(21)], [21]);
  ok("Lv10: 同シャンテンならドラ4sを掴む（受け2種→1種を許容）", pickD && pickD.kind === 21);

  // Lv10 でも和了牌は捨てない: テンパイ手 123m456m789m 44p 56s、A=7s(24)=ツモ和了 / D=9p(17)=ドラ。
  // 和了(-1シャンテン)とテンパイ(0)は 100点差 ＞ tolerance50 ＝シャンテンをまたぐ浮気はしない。
  const HAND_TENPAI = [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 12, 22, 23];
  const e = ab(10); e.activate();
  const pickE = draw(e, HAND_TENPAI, [t(24), t(17)], [17]);
  ok("Lv10: 和了牌7sは何があっても見逃さない（ドラ9pに浮気しない）", pickE && pickE.kind === 24);

  // 赤5はドラ扱い: 伸びが同点（どちらも手を進めない）なら赤5を掴む（Lv6 tolerance=0 でも同点は掴む）。
  const f = ab(6); f.activate();
  const pickF = draw(f, HAND_IISHANTEN, [t(28), t(13, true)], []); // 2z vs 赤5p（どちらも浮き牌）
  ok("Lv6: 伸び同点なら赤5を掴む（red フラグはドラ扱い）", pickF && pickF.kind === 13 && pickF.red === true);

  // lookahead 窓: Lv6（窓2）は3枚目以降の候補を見ない。
  const g = ab(6); g.activate();
  const pickG = draw(g, HAND_IISHANTEN, [t(28), t(29), t(7)], []); // 有効牌8mは窓外
  ok("Lv6: 窓2の外にある8mは見えない（窓内の先頭を返す）", pickG === undefined || pickG.kind !== 7);
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
