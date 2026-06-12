// 身代わり人形（ビビ・iron-guard）の Phase7 結線ユニット検証。Run: node test/ironguard.mjs
// 基準帯テーブル（lv-iron-guard）／Lv5≡フリー対戦の無param生成／守り(MODIFY_POINT_DELTA)・
// 窓の消費(ON_DISCARD)・超越帯の打点倍率(MODIFY_SCORE) を確認する。
// 会計（ron / tsumoEach.dealer / tsumoEach.nonDealer の ceil100 倍と out.total 整合）は焔と同じ。
import "../src/abilities/builtins/index.js"; // 能力を登録
import { createAbility } from "../src/abilities/registry.js";
import { BibiAbility } from "../src/abilities/builtins/bibiAbility.js";
import { Hooks } from "../src/abilities/hooks.js";
import { skillRuntimeAbilityParams } from "../src/data/skillLevelMaster.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };

const noopApi = (me = {}) => ({ me, log() {} });
// runtimeParams（Lv → params）から能力を生成。
const ab = (lv) => createAbility("bibi", skillRuntimeAbilityParams("lv-iron-guard", lv));
// MODIFY_POINT_DELTA を叩く薄いラッパ。
const hit = (a, delta, { reason = "ron" } = {}) =>
  a[Hooks.MODIFY_POINT_DELTA]({ reason, player: a._me ?? {}, delta }, noopApi(a._me ?? {}), delta);
// 打牌を1回。owner＝能力の持ち主(api.me)、who＝実際に打った人(ctx.player)。
// who===owner のとき自打牌＝窓を消費する。
const discard = (a, owner, who = owner) => a[Hooks.ON_DISCARD]({ player: who }, noopApi(owner));
const ceil100 = (n) => Math.ceil(n / 100) * 100;

// ---- 0) 基準帯テーブル：skillRuntimeAbilityParams が期待値どおり ----
{
  const lv1 = skillRuntimeAbilityParams("lv-iron-guard", 1);
  ok("Lv1: discardWindow=3 / winMultiplier=1 / maxCharges=1",
    lv1.discardWindow === 3 && lv1.winMultiplier === 1 && lv1.maxCharges === 1);
  const lv5 = skillRuntimeAbilityParams("lv-iron-guard", 5);
  ok("Lv5: discardWindow=6 / winMultiplier=1 / maxCharges=2",
    lv5.discardWindow === 6 && lv5.winMultiplier === 1 && lv5.maxCharges === 2);
  const lv6 = skillRuntimeAbilityParams("lv-iron-guard", 6);
  ok("Lv6: discardWindow=6 / winMultiplier=1.1 / maxCharges=2",
    lv6.discardWindow === 6 && lv6.winMultiplier === 1.1 && lv6.maxCharges === 2);
  const lv10 = skillRuntimeAbilityParams("lv-iron-guard", 10);
  ok("Lv10: discardWindow=8 / winMultiplier=1.5 / maxCharges=2",
    lv10.discardWindow === 8 && lv10.winMultiplier === 1.5 && lv10.maxCharges === 2);
}

// ---- 1) Lv5 ≡ フリー対戦：無param生成と Lv5 params 生成が一致 ----
{
  const free = new BibiAbility();             // フリー対戦のビビ（無param＝abilityMaster 既定）
  const lv5 = ab(5);                          // 基準帯 Lv5
  ok("Lv5≡フリー対戦: discardWindow=6 で一致", free.discardWindow === 6 && lv5.discardWindow === 6);
  ok("Lv5≡フリー対戦: winMultiplier=1 で一致", free.winMultiplier === 1 && lv5.winMultiplier === 1);
  ok("Lv5≡フリー対戦: maxCharges=2 で一致", free.maxCharges === 2 && lv5.maxCharges === 2);
}

// ---- 2) 守り（MODIFY_POINT_DELTA）：active 中はロン/ツモ失点が0、対象外は素通し ----
{
  const a = ab(5); a.activate();
  ok("active前提: activate成功", a.active === true);
  ok("ロン失点(-8000)→0", hit(a, -8000, { reason: "ron" }) === 0);
  ok("ツモ失点(-4000)→0", hit(a, -4000, { reason: "tsumo" }) === 0);
  // ロン/ツモ以外の失点（流局罰符など）は対象外＝undefined（通常失点）。
  ok("流局罰符(reason=draw)は素通し(undefined)", hit(a, -1000, { reason: "draw" }) === undefined);
  ok("分配など別reasonの失点も素通し", hit(a, -1500, { reason: "tenpaiPay" }) === undefined);
  // delta>=0（得点）はロン/ツモでも対象外。
  ok("delta>=0 は対象外（undefined）", hit(a, 8000, { reason: "ron" }) === undefined);
  // 非active では一切介入しない。
  const idle = ab(5);
  ok("未発動時はロン失点も素通し(undefined)", idle[Hooks.MODIFY_POINT_DELTA]({ reason: "ron", player: {}, delta: -8000 }, noopApi(), -8000) === undefined);
}

// ---- 3) 窓の消費（ON_DISCARD）：discardWindow 回の自打牌で active が落ちる ----
{
  // Lv1（窓3）：境界 = 3回目の自打牌で切れる。
  const me1 = {};
  const a = ab(1); a._me = me1; a.activate();
  ok("Lv1 発動直後 active", a.active === true);
  discard(a, me1); ok("Lv1 1打牌後も active（窓3）", a.active === true);
  discard(a, me1); ok("Lv1 2打牌後も active（窓3）", a.active === true);
  discard(a, me1); ok("Lv1 3打牌で active=false（窓3を使い切り）", a.active === false);

  // 他者の打牌は窓を消費しない（ctx.player !== api.me）。
  const me2 = {}, other = {};
  const b = ab(1); b._me = me2; b.activate();
  discard(b, me2, other); discard(b, me2, other); discard(b, me2, other);
  ok("Lv1 他者の打牌では窓が減らない（active維持）", b.active === true);
  discard(b, me2); discard(b, me2); discard(b, me2);
  ok("Lv1 自打牌3回でようやく active=false", b.active === false);

  // Lv5（窓6）：5回目までは維持、6回目で切れる。
  const me3 = {};
  const c = ab(5); c._me = me3; c.activate();
  for (let i = 0; i < 5; i++) discard(c, me3);
  ok("Lv5 5打牌後はまだ active（窓6）", c.active === true);
  discard(c, me3);
  ok("Lv5 6打牌で active=false（窓6を使い切り）", c.active === false);
  // 窓が切れた後はロン失点が素通りに戻る。
  ok("Lv5 窓切れ後はロン失点が素通し(undefined)", hit(c, -8000, { reason: "ron" }) === undefined);
}

// ---- 4) 超越帯（MODIFY_SCORE）：自分の満貫以上の和了が winMultiplier 倍 ----
const score = (a, winner, result) => a[Hooks.MODIFY_SCORE]({ winner }, noopApi(winner), result);
{
  // score() は winner と noopApi(winner).me に同一オブジェクトを渡すので、winner===api.me が成立する。
  const me = {};
  // Lv10（winMultiplier 1.5）：満貫以上(result.rank 有り)のロン和了が1.5倍。
  const a = ab(10);
  const out = score(a, me, { valid: true, rank: "満貫", ron: 8000, total: 8000 });
  ok("Lv10 ロン満貫: ron が1.5倍（ceil100）", out && out.ron === ceil100(8000 * 1.5));
  ok("Lv10 ロン満貫: out.total が ron と整合", out && out.total === out.ron);

  // 満貫未満（result.rank 無し）は対象外＝undefined。
  const b = ab(10);
  ok("Lv10 満貫未満(rank無し)は undefined", score(b, me, { valid: true, rank: "", ron: 3900, total: 3900 }) === undefined);

  // winMultiplier=1（Lv5）は常に undefined（攻めの火は宿らない）。
  const c = ab(5);
  ok("Lv5(winMultiplier=1) は満貫以上でも undefined", score(c, me, { valid: true, rank: "満貫", ron: 8000, total: 8000 }) === undefined);

  // winner !== api.me（他家の和了）は対象外＝undefined。
  const d = ab(10);
  ok("Lv10 他家の和了(winner!==me)は undefined",
    d[Hooks.MODIFY_SCORE]({ winner: {} }, noopApi({}), { valid: true, rank: "満貫", ron: 8000, total: 8000 }) === undefined);

  // tsumoEach 形式（dealer/nonDealer）の1.5倍 ＋ total 再計算（子の和了：dealer + nonDealer*2）。
  const e = ab(10);
  const meChild = { isDealer: false };
  const tsumoRes = { valid: true, rank: "満貫", tsumoEach: { dealer: 4000, nonDealer: 2000 }, total: 8000 };
  const oe = e[Hooks.MODIFY_SCORE]({ winner: meChild }, noopApi(meChild), tsumoRes);
  ok("Lv10 ツモ満貫(子): dealer が1.5倍", oe && oe.tsumoEach.dealer === ceil100(4000 * 1.5));
  ok("Lv10 ツモ満貫(子): nonDealer が1.5倍", oe && oe.tsumoEach.nonDealer === ceil100(2000 * 1.5));
  ok("Lv10 ツモ満貫(子): total = dealer + nonDealer*2 で整合",
    oe && oe.total === oe.tsumoEach.dealer + oe.tsumoEach.nonDealer * 2);
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
