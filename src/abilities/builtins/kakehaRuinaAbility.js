// 賭羽ルイナ の能力「大博打」 (即時効果型 apply + hook MODIFY_SCORE)。
//
// 1巡目（その局でまだ打牌していないとき）のみ発動できる、1ゲーム2局までの賭け。
// 発動時に賭け金を選ぶ:
//   - 5000点  … 即座に5000点を支払い、その局にアガると和了点が1.5倍。
//   - 10000点 … 即座に10000点を支払い、その局にアガると和了点が2倍。
// 倍率は自分の獲得点だけでなく相手の支払いにもかかる（ron / tsumoEach を倍率ぶん
// 増やし、表示用 total を再計算）。賭け金は前払いで、アガれなくても戻らない。
// 持ち点（HP）が賭け金を下回るときは発動できない（apply で弾く・チャージも消費しない）。
import { Ability } from "../ability.js";
import { Hooks } from "../hooks.js";
import { registerAbility } from "../registry.js";
import { abilityDef } from "../../data/abilityMaster.js";

const ceil100 = (n) => Math.ceil(n / 100) * 100;
// 賭け金 → 和了点の倍率。
const BET_MULT = { 5000: 1.5, 10000: 2 };

// 各支払いから合計点を再計算（表示用）。homuraAbility と同じ考え方。
function recomputeTotal(res, isDealer) {
  if (res.tsumoEach) {
    return isDealer
      ? (res.tsumoEach.nonDealer || 0) * 3
      : (res.tsumoEach.dealer || 0) + (res.tsumoEach.nonDealer || 0) * 2;
  }
  return res.ron != null ? res.ron : res.total;
}

export class KakehaBetAbility extends Ability {
  constructor() {
    super(abilityDef("kakeha-bet"));
    this._mult = 1; // この局に賭けた倍率（未発動なら1）
  }

  resetForHand() { super.resetForHand(); this._mult = 1; }
  resetForGame() { super.resetForGame(); this._mult = 1; }

  // 1巡目（まだ打牌していない＝河が空）かつ、最低額の5000点を払えるHPがあるときだけ。
  // 具体的な賭け金額（5000/10000）が払えるかは apply で最終確認する。
  activationCondition(api) {
    return api.me.discards.length === 0 && api.me.points >= 5000;
  }

  // 即時効果: 選んだ賭け金を支払い、倍率をセットする。賭け金が不正、または持ち点が
  // それを下回るなら失敗（チャージ消費なし）。
  apply(game, player, params) {
    const bet = Number(params && params.betAmount);
    const mult = BET_MULT[bet];
    if (!mult) return false;
    if (player.points < bet) return false;
    player.points -= bet;
    this._mult = mult;
    game.log(`【${player.character.name}】${bet}点を賭けた（この局アガれば和了点${mult}倍）`);
    return true;
  }

  // アガり時、賭けた倍率を和了点に乗せる（自分の獲得も相手の支払いも増える）。
  [Hooks.MODIFY_SCORE](ctx, api, result) {
    if (!this.isActive || this._mult === 1 || !result || !result.valid) return undefined;
    const mul = (v) => (typeof v === "number" ? ceil100(v * this._mult) : v);
    const out = { ...result };
    if (typeof result.ron === "number") out.ron = mul(result.ron);
    if (result.tsumoEach) {
      out.tsumoEach = { ...result.tsumoEach };
      if (typeof out.tsumoEach.dealer === "number") out.tsumoEach.dealer = mul(out.tsumoEach.dealer);
      if (typeof out.tsumoEach.nonDealer === "number") out.tsumoEach.nonDealer = mul(out.tsumoEach.nonDealer);
    }
    out.total = recomputeTotal(out, ctx.winner.isDealer);
    api.log(`大博打：和了点${this._mult}倍`);
    return out;
  }
}

registerAbility("kakeha-bet", () => new KakehaBetAbility());
