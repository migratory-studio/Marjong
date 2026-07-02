// 沼田蓮(ぬまた れん) の能力「泥中の蓮」 (hooks: MODIFY_SCORE_GLOBAL, MODIFY_POINT_DELTA)。
//
// 常時発動のフィールド型ギャンブラー。卓全体を泥沼に沈める:
//   - 泥 … 誰のアガリでも点数が reduceRate ぶん減る（勝者の取り分も支払いも同じ
//           減額スコアから計算される）。自分の大きな手（cheapHanMax 超）も沈む。
//   - 蓮 … 自分の cheapHanMax（既定3）ハン以下のアガリだけは泥の対象外で、
//           cheapMultiplier 倍に咲く。『格好悪く泥臭く勝つ』美学のメカ化。
//   - 泥中に咲く（超越帯 Lv6+）… 泥が沈めた点数を「沈殿」として溜め（ゲーム単位・
//           局をまたいで持続）、自分の蓮の和了時に absorbRate ぶんを吸い上げて加点する。
//           吸い上げは MODIFY_POINT_DELTA の非ゼロサム加点＝支払い側の負担は増えない
//           （泥水から養分を吸って咲く＝宙に消えた点の一部が還る）。吸ったら沈殿は流れる。
//
// 会計の決めごと:
//   - 点数（ron / tsumoEach / total）だけを動かし、rank / totalHan / yaku には触れない。
//     琥珀の盾などランク閾値で判定する能力は「手の格」で判定し続ける（泥で満貫が
//     満貫でなくなることはない）。
//   - 泥は勝者本人の倍率系（焔・大博打など＝MODIFY_SCORE）の後に掛かる（registry の
//     ディスパッチ順で固定）。同卓に泥が複数いる場合は乗算で重なる（許容）。
//   - 流局精算・流し満貫・供託には一切触れない（淵の蒐集と住み分け）。
//
// runtimeParams（skillLevelMaster lv-muddy-lotus。既定＝Lv5 相当＝フリー対戦の沼田）:
//   reduceRate      … 泥。全員のアガリ点の減少率（既定 0.25）
//   cheapHanMax     … 蓮の対象となる自分のアガリの最大ハン数（既定 3。全Lv固定）
//   cheapMultiplier … 蓮。自分の cheapHanMax 以下のアガリの倍率（既定 1.5）
//   absorbRate      … 超越帯。沈殿を蓮の和了時に吸い上げる割合（既定 0＝無効）
import { Ability } from "../ability.js";
import { Hooks } from "../hooks.js";
import { registerAbility } from "../registry.js";
import { abilityDef } from "../../data/abilityMaster.js";

const ceil100 = (n) => Math.ceil(n / 100) * 100;

// 各支払いから合計点を再計算（表示用）。焔・ビビの能力と同じ会計。
function recomputeTotal(res, isDealer) {
  if (res.tsumoEach) {
    return isDealer
      ? (res.tsumoEach.nonDealer || 0) * 3
      : (res.tsumoEach.dealer || 0) + (res.tsumoEach.nonDealer || 0) * 2;
  }
  return res.ron != null ? res.ron : res.total;
}

// ron / tsumoEach の各支払いへ倍率を掛けて total を整合させる。
function scaleResult(result, factor, isDealer) {
  const mul = (v) => (typeof v === "number" ? ceil100(v * factor) : v);
  const out = { ...result };
  if (typeof result.ron === "number") out.ron = mul(result.ron);
  if (result.tsumoEach) {
    out.tsumoEach = { ...result.tsumoEach };
    if (typeof out.tsumoEach.dealer === "number") out.tsumoEach.dealer = mul(out.tsumoEach.dealer);
    if (typeof out.tsumoEach.nonDealer === "number") out.tsumoEach.nonDealer = mul(out.tsumoEach.nonDealer);
  }
  out.total = recomputeTotal(out, isDealer);
  return out;
}

export class MuddyLotusAbility extends Ability {
  constructor(params = {}) {
    super({ ...abilityDef("muddy-lotus"), ...params });
    this.reduceRate = params.reduceRate ?? 0.25;
    this.cheapHanMax = params.cheapHanMax ?? 3;
    this.cheapMultiplier = params.cheapMultiplier ?? 1.5;
    this.absorbRate = params.absorbRate ?? 0;
    this._sunk = 0; // 沈殿＝泥が沈めた点数の累計（ゲーム単位で持続）
    this._bloomPending = false; // この局、自分の蓮が咲いた（吸い上げ待ち）
  }

  // 沈殿は局をまたいで溜まる＝resetForHand では流さない。
  resetForHand() {
    super.resetForHand();
    this._bloomPending = false;
  }
  resetForGame() {
    super.resetForGame();
    this._sunk = 0;
    this._bloomPending = false;
  }

  // 誰のアガリにも泥を敷く。自分の蓮（cheapHanMax 以下）だけは咲かせる。
  [Hooks.MODIFY_SCORE_GLOBAL](ctx, api, result) {
    if (!this.isActive || !result || !result.valid) return undefined;
    const isDealer = ctx.winner.isDealer;
    const isMine = ctx.winner === api.me;
    const isCheap = !result.isYakuman && (result.totalHan ?? 0) <= this.cheapHanMax;

    if (isMine && isCheap) {
      const out = scaleResult(result, this.cheapMultiplier, isDealer);
      this._bloomPending = true; // 吸い上げ（超越帯）は精算時の MODIFY_POINT_DELTA で
      api.log(`泥中の蓮：安手が咲く——${this.cheapHanMax}ハン以下は泥の対象外・×${this.cheapMultiplier}`);
      return out;
    }

    const before = typeof result.total === "number" ? result.total : 0;
    const out = scaleResult(result, 1 - this.reduceRate, isDealer);
    const sunkNow = Math.max(0, before - (out.total ?? before));
    if (sunkNow > 0) this._sunk += sunkNow;
    api.log(`泥中の蓮：泥がアガリを沈めた（-${Math.round(this.reduceRate * 100)}%）`);
    return out;
  }

  // 超越帯（Lv6+）「泥中に咲く」: 蓮の和了の精算時、沈殿の absorbRate ぶんを吸い上げて
  // 自分の獲得へ上乗せする（非ゼロサム加点）。吸ったら沈殿は全部流れる。
  [Hooks.MODIFY_POINT_DELTA](ctx, api, delta) {
    if (!this._bloomPending) return undefined;
    if (delta <= 0 || (ctx.reason !== "ron" && ctx.reason !== "tsumo")) return undefined;
    this._bloomPending = false;
    if (this.absorbRate <= 0 || this._sunk <= 0) return undefined;
    const bonus = ceil100(this._sunk * this.absorbRate);
    api.log(`泥中に咲く——沈殿${this._sunk}点の${Math.round(this.absorbRate * 100)}%（+${bonus}点）を吸い上げた`);
    this._sunk = 0;
    return delta + bonus;
  }
}

registerAbility("muddy-lotus", (params) => new MuddyLotusAbility(params));
