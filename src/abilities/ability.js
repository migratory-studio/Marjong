// Base class for character abilities.
//
// Subclass and implement any hook methods from hooks.js. An ability has a
// master-driven *activation type* and *charge scope* (see abilityMaster.js):
//   * activation "passive" — always in effect (e.g. danger marking). No button.
//   * activation "manual"  — the player (or CPU) must activate it; while active
//                            its hooks apply. Activation costs one charge.
//   * chargeScope "game"   — charges last the whole game (e.g. 1ゲーム1回).
//   * chargeScope "hand"   — charges refill every hand     (e.g. 1局1回).
//
// Keep abilities PURE-ish: read state via `api`, request changes via return
// values / api helpers. Don't reach into engine internals directly.
export class Ability {
  /**
   * @param {object} cfg
   * @param {string} cfg.id            unique id
   * @param {string} cfg.name          display name
   * @param {string} cfg.desc          short description
   * @param {"passive"|"manual"} [cfg.activation]  how it fires (default passive)
   * @param {"game"|"hand"} [cfg.chargeScope]      when charges refill (default hand)
   * @param {number} [cfg.maxCharges]   uses per scope (Infinity if omitted)
   * @param {number} [cfg.cooldown]     turns between uses
   */
  constructor(cfg = {}) {
    this.id = cfg.id || "ability";
    this.name = cfg.name || "能力";
    this.desc = cfg.desc || "";
    this.activation = cfg.activation === "manual" ? "manual" : "passive";
    this.chargeScope = cfg.chargeScope === "game" ? "game" : "hand";
    this.maxCharges = cfg.maxCharges ?? Infinity;
    this.cooldown = cfg.cooldown ?? 0;
    this.charges = this.maxCharges;
    this._cooldownLeft = 0;
    this.active = false; // manual abilities: currently in effect (this hand)
  }

  // Reset per-hand state. Hand-scoped charges refill; game-scoped persist.
  // A manual ability's "active" window always ends with the hand.
  resetForHand() {
    if (this.chargeScope === "hand") this.charges = this.maxCharges;
    this._cooldownLeft = 0;
    this.active = false;
  }

  // Full reset (new game).
  resetForGame() {
    this.charges = this.maxCharges;
    this._cooldownLeft = 0;
    this.active = false;
  }

  // Passive abilities are always in effect; manual ones only once activated.
  get isActive() {
    return this.activation === "passive" ? true : this.active;
  }

  get ready() {
    return this.charges > 0 && this._cooldownLeft <= 0;
  }

  // Can the player activate this RIGHT NOW? (manual only)
  // Gates on: charges/cooldown, not-already-active, and the per-ability
  // "発動できる条件" hook (override activationCondition for richer conditions).
  canActivate(api) {
    if (this.activation !== "manual") return false;
    if (this.active) return false;
    if (!this.ready) return false;
    return this.activationCondition(api);
  }

  // Extension point for ability-specific activation conditions. Default: always
  // satisfiable (so charges/active alone gate it). Override to require state.
  activationCondition(_api) {
    return true;
  }

  // Activate the ability: spend a charge and turn it on for this hand.
  // Returns true if it fired.
  activate() {
    if (this.activation !== "manual") return false;
    if (this.active || !this.ready) return false;
    if (this.charges !== Infinity) this.charges--;
    this._cooldownLeft = this.cooldown;
    this.active = true;
    return true;
  }

  tickCooldown() {
    if (this._cooldownLeft > 0) this._cooldownLeft--;
  }
}
