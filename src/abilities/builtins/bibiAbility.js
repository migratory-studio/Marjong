// ビビ(Bibi) の能力「身代わり人形」 (hooks: MODIFY_POINT_DELTA, ON_DISCARD, MODIFY_SCORE)。
//
// 1局1回・1ゲーム2局まで。発動後、自分が6回打牌するまでのあいだ、ロン・ツモを
// されても自分からは点棒を取られない（失点が0になる）。発動した局でしか効かず、
// 6回の自打牌で効果が切れる。流局のノーテン罰符などロン/ツモ以外の失点は対象外。
//
// 自分の失点を0にし、ブロックした分は相手（アガった側）にも渡らない（_settle が
// 軽減ぶんを勝者の獲得から差し引く）。点棒は HP 扱いだが、無敵中のビビへのアガりは
// その支払いぶんが宙に消える＝相手も得をしない。流局罰符などロン/ツモ以外は対象外。
//
// runtimeParams（skillLevelMaster lv-iron-guard。既定＝Lv5 相当＝フリー対戦のビビ）:
//   discardWindow … 守りの窓（発動後に守れる自打牌の回数。既定 6）
//   maxCharges    … 1ゲームの発動回数（既定 2＝abilityMaster。基準帯では 1→2 に伸ばす）
//   winMultiplier … 超越帯（Lv6+）。自分の満貫以上の和了の点数倍率（既定 1＝無効）。
//                   ＝相棒・焔の火が宿る：身代わり（守り）が攻めへ転じる殻破りの体現。
import { Ability } from "../ability.js";
import { Hooks } from "../hooks.js";
import { registerAbility } from "../registry.js";
import { abilityDef } from "../../data/abilityMaster.js";

const DISCARD_WINDOW = 6;
const ceil100 = (n) => Math.ceil(n / 100) * 100;

// 各支払いから合計点を再計算（表示用）。焔の能力と同じ会計。
function recomputeTotal(res, isDealer) {
  if (res.tsumoEach) {
    return isDealer
      ? (res.tsumoEach.nonDealer || 0) * 3
      : (res.tsumoEach.dealer || 0) + (res.tsumoEach.nonDealer || 0) * 2;
  }
  return res.ron != null ? res.ron : res.total;
}

export class BibiAbility extends Ability {
  constructor(params = {}) {
    super({ ...abilityDef("bibi"), ...params });
    this._discardsLeft = 0;
    this._usedThisHand = false;
    this.discardWindow = params.discardWindow ?? DISCARD_WINDOW;
    this.winMultiplier = params.winMultiplier ?? 1;
  }

  resetForHand() {
    super.resetForHand();
    this._discardsLeft = 0;
    this._usedThisHand = false;
  }
  resetForGame() {
    super.resetForGame();
    this._discardsLeft = 0;
    this._usedThisHand = false;
  }

  // 1局1回。効果は窓ぶんの打牌で切れて active が false に戻るため、active だけでは
  // 同一局の再発動を弾けない。専用フラグで「この局はもう使った」を担保する。
  activationCondition(_api) {
    return !this._usedThisHand;
  }

  // 発動時に守りの窓を開く（discardWindow 回の自打牌ぶん）。
  activate() {
    const ok = super.activate();
    if (ok) {
      this._discardsLeft = this.discardWindow;
      this._usedThisHand = true;
    }
    return ok;
  }

  // 自分の打牌ごとに窓を1つ消費。使い切ったら効果終了。
  [Hooks.ON_DISCARD](ctx, api) {
    if (!this.active) return;
    if (ctx.player !== api.me) return;
    this._discardsLeft--;
    if (this._discardsLeft <= 0) {
      this.active = false;
      api.log(`守りが切れた`);
    }
  }

  // ロン・ツモによる自分の失点を0にする（自分の能力にだけ適用される）。
  [Hooks.MODIFY_POINT_DELTA](ctx, api, delta) {
    if (!this.active) return undefined;
    if (delta < 0 && (ctx.reason === "ron" || ctx.reason === "tsumo")) {
      api.log(`守りで失点を無効化（${delta} → 0）`);
      return 0;
    }
    return undefined;
  }

  // 超越帯（Lv6+）：身代わり（守り）が攻めへ転じる＝ビビ自身の満貫以上の和了に
  // 相棒・焔の火が宿り、点数が winMultiplier 倍になる（満貫未満は対象外）。会計は焔と同じ。
  [Hooks.MODIFY_SCORE](ctx, api, result) {
    if (this.winMultiplier <= 1 || !result || !result.valid) return undefined;
    if (ctx.winner !== api.me) return undefined;
    if (!result.rank) return undefined; // 満貫以上のみ rank ラベルが入る
    const isDealer = ctx.winner.isDealer;
    const mul = (v) => (typeof v === "number" ? ceil100(v * this.winMultiplier) : v);
    const out = { ...result };
    if (typeof result.ron === "number") out.ron = mul(result.ron);
    if (result.tsumoEach) {
      out.tsumoEach = { ...result.tsumoEach };
      if (typeof out.tsumoEach.dealer === "number") out.tsumoEach.dealer = mul(out.tsumoEach.dealer);
      if (typeof out.tsumoEach.nonDealer === "number") out.tsumoEach.nonDealer = mul(out.tsumoEach.nonDealer);
    }
    out.total = recomputeTotal(out, isDealer);
    api.log(`身代わりの火——満貫以上につき点数×${this.winMultiplier}（焔の火が宿る）`);
    return out;
  }
}

registerAbility("bibi", (params) => new BibiAbility(params));
