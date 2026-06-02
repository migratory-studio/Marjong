// 焔(ホムラ) の能力「焔」 (hook: MODIFY_SCORE)。
//
// 1巡目（その局でまだ打牌していないとき）のみ発動できる、1ゲーム2局までの賭け。
// 発動した局にアガると点数が次のように上書きされる:
//   - 満貫以上     … 点数が1.5倍（100点単位で切り上げ）。
//   - 満貫未満     … 点数が固定。ロン1000点 / ツモは 500・300（親ツモは500オール）。
//
// 「満貫以上か」は score.js の result.rank で判定する（満貫以上のみ rank ラベルが
// 入り、満貫未満は空文字）。実際の点棒移動はロン=ron、ツモ=tsumoEach を使うため、
// total は表示用に各支払いから再計算して整合させる。
import { Ability } from "../ability.js";
import { Hooks } from "../hooks.js";
import { registerAbility } from "../registry.js";
import { abilityDef } from "../../data/abilityMaster.js";

const ceil100 = (n) => Math.ceil(n / 100) * 100;

// 各支払いから合計点を再計算（表示用）。
function recomputeTotal(res, isDealer) {
  if (res.tsumoEach) {
    return isDealer
      ? (res.tsumoEach.nonDealer || 0) * 3
      : (res.tsumoEach.dealer || 0) + (res.tsumoEach.nonDealer || 0) * 2;
  }
  return res.ron != null ? res.ron : res.total;
}

export class HomuraAbility extends Ability {
  constructor() {
    super(abilityDef("homura"));
  }

  // 1巡目のみ発動可（その局でまだ自分が打牌していない＝河が空）。
  activationCondition(api) {
    return api.me.discards.length === 0;
  }

  [Hooks.MODIFY_SCORE](ctx, api, result) {
    if (!this.isActive || !result || !result.valid) return undefined;
    const isDealer = ctx.winner.isDealer;
    const isManganPlus = !!result.rank; // 満貫以上のみ rank ラベルが入る

    if (isManganPlus) {
      const mul = (v) => (typeof v === "number" ? ceil100(v * 1.5) : v);
      const out = { ...result };
      if (typeof result.ron === "number") out.ron = mul(result.ron);
      if (result.tsumoEach) {
        out.tsumoEach = { ...result.tsumoEach };
        if (typeof out.tsumoEach.dealer === "number") out.tsumoEach.dealer = mul(out.tsumoEach.dealer);
        if (typeof out.tsumoEach.nonDealer === "number") out.tsumoEach.nonDealer = mul(out.tsumoEach.nonDealer);
      }
      out.total = recomputeTotal(out, isDealer);
      api.log(`焔：満貫以上につき点数1.5倍`);
      return out;
    }

    // 満貫未満：点数固定。
    if (result.tsumoEach) {
      const tsumoEach = isDealer ? { nonDealer: 500 } : { dealer: 500, nonDealer: 300 };
      const out = { ...result, tsumoEach };
      out.total = recomputeTotal(out, isDealer);
      api.log(`焔：満貫未満につき点数固定（ツモ ${isDealer ? "500オール" : "500/300"}）`);
      return out;
    }
    api.log(`焔：満貫未満につき点数固定（ロン1000）`);
    return { ...result, ron: 1000, total: 1000 };
  }
}

registerAbility("homura", () => new HomuraAbility());
