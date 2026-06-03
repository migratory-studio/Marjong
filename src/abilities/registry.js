// Ability registry + the engine-facing dispatcher.
//
// The engine never calls abilities directly. It calls AbilityManager.modify(...)
// / AbilityManager.notify(...), which fan out to each player's abilities at the
// right hook. This keeps the engine decoupled from any specific ability.
import { Hooks, emptyEligibility } from "./hooks.js";

const _factories = new Map();

// Register an ability factory under an id (used by character definitions).
// The factory receives the per-character `params` from the character master.
export function registerAbility(id, factory) {
  _factories.set(id, factory);
}
export function createAbility(id, params = {}) {
  const f = _factories.get(id);
  if (!f) throw new Error(`Unknown ability: ${id}`);
  return f(params);
}
export function knownAbilities() {
  return [..._factories.keys()];
}

// Read-only-ish API handed to ability hooks.
export class AbilityApi {
  constructor(game, player) {
    this.game = game;
    this.player = player; // the owning player object
  }
  log(msg) {
    this.game.log(`【${this.player.character.name}】${msg}`);
  }
  get state() {
    return this.game; // game exposes read accessors
  }
  get me() {
    return this.player;
  }
  opponents() {
    return this.game.players.filter((p) => p !== this.player);
  }
}

export class AbilityManager {
  constructor(game) {
    this.game = game;
  }

  _abilitiesOf(player) {
    return player.abilities || [];
  }

  // Build the read-only-ish API for a player (used to evaluate activation
  // conditions / manual activation from the engine).
  apiFor(player) {
    return new AbilityApi(this.game, player);
  }

  // Run a "modify" hook for a single player, threading `value` through their abilities.
  modifyForPlayer(hookName, player, ctx, value) {
    const api = new AbilityApi(this.game, player);
    for (const ab of this._abilitiesOf(player)) {
      const fn = ab[hookName];
      if (typeof fn === "function") {
        const out = fn.call(ab, ctx, api, value);
        if (out !== undefined) value = out;
      }
    }
    return value;
  }

  // Notify hook across ALL players.
  notify(hookName, ctx) {
    for (const player of this.game.players) {
      const api = new AbilityApi(this.game, player);
      for (const ab of this._abilitiesOf(player)) {
        const fn = ab[hookName];
        if (typeof fn === "function") fn.call(ab, ctx, api);
      }
    }
  }

  // --- specific engine integration points ---

  // When `player` draws, let their abilities choose the tile.
  resolveDraw(player, wall) {
    const candidates = wall.peekLive(8);
    const defaultTile = candidates[0] || null;
    const ctx = { player, wall, candidates, defaultTile };
    const chosen = this.modifyForPlayer(Hooks.MODIFY_DRAW, player, ctx, defaultTile);
    if (chosen && chosen !== defaultTile) {
      // find chosen offset in live wall and draw it
      const offset = wall.peekLive(64).findIndex((t) => t.id === chosen.id);
      if (offset >= 0) return wall.drawLiveAt(offset);
    }
    return wall.drawLive();
  }

  // Gather call eligibility, letting abilities expand it (e.g. chi from anyone).
  resolveEligibility(discard, fromPlayer, baseEligibility) {
    let elig = baseEligibility;
    for (const player of this.game.players) {
      const ctx = { discard, fromPlayer, player, eligibility: elig };
      const out = this.modifyForPlayer(Hooks.MODIFY_CALL_ELIGIBILITY, player, ctx, elig);
      if (out) elig = out;
    }
    return elig;
  }

  // Collect danger info from a player's abilities for UI rendering.
  dangerInfo(player) {
    const ctx = { player };
    const out = this.modifyForPlayer(Hooks.PROVIDE_DANGER_INFO, player, ctx, null);
    return Array.isArray(out) ? out : null;
  }

  // Let abilities tweak a score result.
  modifyScore(winner, result) {
    const ctx = { winner, result };
    return this.modifyForPlayer(Hooks.MODIFY_SCORE, winner, ctx, result);
  }

  // May this player declare a win (和了) right now? Abilities may veto by
  // returning false from MODIFY_CAN_WIN. Default: allowed.
  canWin(player, kind, tsumo) {
    const ctx = { player, kind, tsumo };
    return this.modifyForPlayer(Hooks.MODIFY_CAN_WIN, player, ctx, true) !== false;
  }

  // Let a player's abilities transform their 流し満貫 result (e.g. → 役満).
  modifyNagashi(player, result) {
    const ctx = { player };
    return this.modifyForPlayer(Hooks.MODIFY_NAGASHI, player, ctx, result);
  }

  // Let a player's own abilities adjust the point change they're about to take
  // at settlement (e.g. double a loss / halve a win). `meta` carries the reason
  // and the winning player's index so abilities can tell a loss from a gain.
  modifyPointDelta(player, delta, meta = {}) {
    const ctx = { ...meta, player, delta };
    return this.modifyForPlayer(Hooks.MODIFY_POINT_DELTA, player, ctx, delta);
  }
}

export { emptyEligibility };
