// Tiny synchronous event emitter used by the engine and UI.
export class EventBus {
  constructor() {
    this._listeners = new Map();
  }
  on(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
    return () => this._listeners.get(type)?.delete(fn);
  }
  emit(type, payload) {
    const set = this._listeners.get(type);
    if (set) for (const fn of [...set]) fn(payload);
  }
}

// Engine event names (UI subscribes to these).
export const Events = {
  STATE_CHANGED: "state-changed",
  HAND_STARTED: "hand-started", // a new hand has been dealt
  TILE_DRAWN: "tile-drawn",
  TILE_DISCARDED: "tile-discarded",
  MELD_CALLED: "meld-called",
  RIICHI_DECLARED: "riichi-declared",
  HAND_WON: "hand-won",
  HAND_DRAWN: "hand-drawn", // exhaustive draw (ryuukyoku)
  ABILITY_USED: "ability-used",
  LOG: "log",
};
