// Hook points the engine exposes to character abilities.
//
// An ability is just an object/instance that implements zero or more of these
// hook methods. The engine calls each hook at a well-defined moment and lets
// abilities observe or modify the outcome. Adding a NEW ability never requires
// touching the engine — you implement hooks and register the ability.
//
// Two flavours of hook:
//   * "modify" hooks  -> the engine threads a value through each ability;
//                        each may return a (possibly changed) value.
//   * "notify" hooks  -> fire-and-forget lifecycle callbacks.
//
// Every hook receives `api` (see AbilityApi in registry.js) giving safe,
// read-only-ish access to game state plus helpers (charge cost, log, etc.).

export const Hooks = {
  // ---- modify hooks ----
  // Decide which tile a player draws from the live wall.
  //   ctx: { player, wall, candidates: tile[] (peek), defaultTile }
  //   return: a tile to draw, or null/undefined to keep default.
  MODIFY_DRAW: "modifyDraw",

  // Expand/restrict who may call on a discard.
  //   ctx: { discard: tile, fromPlayer, eligibility: {chi:Set, pon:Set, kan:Set, ron:Set} }
  //   Abilities mutate/return eligibility (e.g. allow chi from any player).
  MODIFY_CALL_ELIGIBILITY: "modifyCallEligibility",

  // Adjust a computed score result before it is applied.
  //   ctx: { winner, result }  -> return modified result or undefined.
  MODIFY_SCORE: "modifyScore",

  // Veto a player's ability to declare a win (和了) by ron or tsumo. Threaded as
  // a boolean (default true = may win); an ability returns false to forbid it.
  // Note: this only blocks ron/tsumo — 流し満貫 is a 流局 payout, not a 和了, so
  // it is unaffected.
  //   ctx: { player, kind, tsumo }  -> return false to block, or undefined.
  MODIFY_CAN_WIN: "modifyCanWin",

  // Transform a player's 流し満貫 result before its 流局 settlement (e.g. upgrade
  // the rank to 役満). Threads the base 流し満貫 result object.
  //   ctx: { player }  -> return a modified result object, or undefined to keep.
  MODIFY_NAGASHI: "modifyNagashi",

  // Adjust the point change a player is about to receive at hand settlement.
  // Runs per player against THEIR OWN abilities, for every payout: tsumo, ron,
  // exhaustive-draw tenpai/noten payments, and 流し満貫. Intentionally NOT
  // zero-sum — an ability may make a player bleed or gain differently from what
  // others pay (points are "HP" here). Riichi-stick deposits are excluded.
  //   ctx: { player, delta, reason: 'tsumo'|'ron'|'draw'|'nagashi', winnerIndex }
  //   return: adjusted delta (number) or undefined to keep.
  MODIFY_POINT_DELTA: "modifyPointDelta",

  // Provide danger info for the UI to render (defensive marking ability).
  //   ctx: { player }  -> return array of { kind, level } (level 0..1) or undefined.
  PROVIDE_DANGER_INFO: "provideDangerInfo",

  // ---- notify hooks ----
  ON_HAND_START: "onHandStart", // new hand dealt
  ON_TURN_START: "onTurnStart", // { player }
  ON_DRAW: "onDraw", // { player, tile }
  ON_DISCARD: "onDiscard", // { player, tile }
  ON_MELD: "onMeld", // { player, meld }
  ON_WIN: "onWin", // { winner, result }
  ON_HAND_END: "onHandEnd",
};

// Default empty eligibility container.
export function emptyEligibility() {
  return { chi: new Set(), pon: new Set(), kan: new Set(), ron: new Set() };
}
