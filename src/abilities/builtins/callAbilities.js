// Call-manipulation abilities (hook: MODIFY_CALL_ELIGIBILITY).
import { Ability } from "../ability.js";
import { Hooks } from "../hooks.js";
import { registerAbility } from "../registry.js";
import { abilityDef } from "../../data/abilityMaster.js";
import { suitOf, rankOf, isHonor, SUITS } from "../../core/tiles.js";
import { tilesToCounts } from "../../core/tiles.js";

// "他からチーができる" — normally chi is only allowed from the left player.
// This ability lets the owner chi off ANY player's discard.
export class OmniChiAbility extends Ability {
  constructor() {
    super(abilityDef("omni-chi"));
  }

  [Hooks.MODIFY_CALL_ELIGIBILITY](ctx, api, eligibility) {
    if (!this.isActive) return undefined; // only while activated this hand
    const me = api.me;
    if (ctx.player !== me) return undefined; // only affects my own eligibility
    if (ctx.fromPlayer === me.index) return undefined; // can't call own discard
    // Can the owner actually form a sequence with this tile?
    if (canChi(me.hand, ctx.discard.kind)) {
      eligibility.chi.add(me.index);
    }
    return eligibility;
  }
}

function canChi(hand, kind) {
  if (isHonor(kind)) return false;
  const counts = tilesToCounts(hand);
  const r = rankOf(kind);
  const suit = suitOf(kind);
  const has = (rank) => rank >= 1 && rank <= 9 && counts[kindOf(suit, rank)] > 0;
  // patterns: (r-2,r-1), (r-1,r+1), (r+1,r+2)
  if (has(r - 2) && has(r - 1)) return true;
  if (has(r - 1) && has(r + 1)) return true;
  if (has(r + 1) && has(r + 2)) return true;
  return false;
}

function kindOf(suit, rank) {
  if (suit === SUITS.MAN) return rank - 1;
  if (suit === SUITS.PIN) return 9 + rank - 1;
  return 18 + rank - 1;
}

registerAbility("omni-chi", () => new OmniChiAbility());
