// ネビュラの能力「暗黒星」 (hooks: MODIFY_SCORE, MODIFY_POINT_DELTA)。
//
// 常時発動の癖キャラ:
//   - 失点（放銃・ツモられ・流局のノーテン罰符など）はすべて倍。
//   - 自分のアガりは半分。得点（自分の取り分）も、相手から奪う支払いも、どちらも半額。
//   - その代償として持ち点（HP）が極めて高い（マスタ側で 25000）。
//
// アガり半減は「スコア段階（MODIFY_SCORE）」で行う。スコアを半額にすると、本人の
// 取り分も相手の支払いも同じ半額スコアから計算されるため、両方そろって半分になる。
// 失点倍化は本人だけに掛かる効果なので、従来どおり MODIFY_POINT_DELTA で行う。
import { Ability } from "../ability.js";
import { Hooks } from "../hooks.js";
import { registerAbility } from "../registry.js";
import { abilityDef } from "../../data/abilityMaster.js";

export class NebulaCurseAbility extends Ability {
  constructor() {
    super(abilityDef("nebula-curse"));
  }

  // アガり点を半額に。MODIFY_SCORE はアガった本人の能力にだけ呼ばれるので、
  // ここに来る時点で勝者＝ネビュラ。支払い側の額もこの半額スコアから算出される。
  [Hooks.MODIFY_SCORE](ctx, api, result) {
    if (!this.isActive || !result) return undefined;
    const half = (v) => (typeof v === "number" ? Math.floor(v / 2) : v);
    const out = { ...result, total: half(result.total) };
    if (typeof result.ron === "number") out.ron = half(result.ron);
    if (result.tsumoEach) {
      out.tsumoEach = { ...result.tsumoEach };
      if (typeof out.tsumoEach.dealer === "number") out.tsumoEach.dealer = half(out.tsumoEach.dealer);
      if (typeof out.tsumoEach.nonDealer === "number") out.tsumoEach.nonDealer = half(out.tsumoEach.nonDealer);
    }
    api.log(`暗黒星：アガりが半減（自分の得点も相手の支払いも半分）`);
    return out;
  }

  [Hooks.MODIFY_POINT_DELTA](ctx, api, delta) {
    if (!this.isActive) return undefined; // passive => always active
    if (delta < 0) {
      const doubled = delta * 2; // 奪われる点は倍
      api.log(`暗黒星：失点が倍化（${delta} → ${doubled}）`);
      return doubled;
    }
    // アガり加点は MODIFY_SCORE 側で既に半減済み。流局テンパイ料などはそのまま。
    return undefined;
  }
}

registerAbility("nebula-curse", () => new NebulaCurseAbility());
