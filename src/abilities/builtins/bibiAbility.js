// ビビ(Bibi) の能力「身代わり人形」 (hooks: MODIFY_POINT_DELTA, ON_DISCARD)。
//
// 1局1回・1ゲーム2局まで。発動後、自分が6回打牌するまでのあいだ、ロン・ツモを
// されても自分からは点棒を取られない（失点が0になる）。発動した局でしか効かず、
// 6回の自打牌で効果が切れる。流局のノーテン罰符などロン/ツモ以外の失点は対象外。
//
// 自分の失点を0にし、ブロックした分は相手（アガった側）にも渡らない（_settle が
// 軽減ぶんを勝者の獲得から差し引く）。点棒は HP 扱いだが、無敵中のビビへのアガりは
// その支払いぶんが宙に消える＝相手も得をしない。流局罰符などロン/ツモ以外は対象外。
import { Ability } from "../ability.js";
import { Hooks } from "../hooks.js";
import { registerAbility } from "../registry.js";
import { abilityDef } from "../../data/abilityMaster.js";

const DISCARD_WINDOW = 6;

export class BibiAbility extends Ability {
  constructor() {
    super(abilityDef("bibi"));
    this._discardsLeft = 0;
    this._usedThisHand = false;
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

  // 1局1回。効果は6打牌で切れて active が false に戻るため、active だけでは同一局の
  // 再発動を弾けない。専用フラグで「この局はもう使った」を担保する。
  activationCondition(_api) {
    return !this._usedThisHand;
  }

  // 発動時に守りの窓を開く（6回の自打牌ぶん）。
  activate() {
    const ok = super.activate();
    if (ok) {
      this._discardsLeft = DISCARD_WINDOW;
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
}

registerAbility("bibi", () => new BibiAbility());
