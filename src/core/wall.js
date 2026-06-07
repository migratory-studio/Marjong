// The wall: live wall (draws), dead wall (dora indicators, ura-dora, rinshan).
import { TILES, KINDS, doraFromIndicator, isReducedSuit, suitOf, rankOf } from "./tiles.js";

// Red-five tiles: one red 5 per number suit (kinds 4=5m, 13=5p, 22=5s),
// using the first physical copy of each. Red fives count as extra dora.
// Note: in reduced tile sets the removed 5s drop out automatically, e.g. 二人麻雀
// keeps only the 5s red (5m/5p are gone with manzu/pinzu 2..8).
const RED_KINDS = new Set([4, 13, 22]);

// Build the live tile pool for a tile set. Reduced suits keep only their
// terminals (1 & 9); ranks 2..8 are dropped. Kind numbering is unchanged.
//   full   → 34 kinds × 4 = 136
//   sanma  → manzu 2..8 removed → 27 × 4 = 108
//   futari → manzu + pinzu 2..8 removed → 20 × 4 = 80 (二人麻雀 少牌)
function buildAllTiles(tileset = "full") {
  const tiles = [];
  let id = 0;
  for (let kind = 0; kind < KINDS; kind++) {
    if (isReducedSuit(suitOf(kind), tileset)) {
      const r = rankOf(kind);
      if (r >= 2 && r <= 8) continue; // keep only 1 & 9 of a reduced suit
    }
    for (let copy = 0; copy < 4; copy++) {
      const red = RED_KINDS.has(kind) && copy === 0;
      tiles.push({ id: id++, kind, red });
    }
  }
  return tiles; // 136 (full) / 108 (sanma) / 80 (futari)
}

// Mulberry32 seeded PRNG so games are reproducible when a seed is given.
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export class Wall {
  constructor(seed = (Math.random() * 2 ** 32) >>> 0, options = {}) {
    this.seed = seed >>> 0;
    // tileset: "full" | "sanma" | "futari". Legacy callers pass { sanma:true }.
    this.tileset = options.tileset || (options.sanma ? "sanma" : "full");
    this.sanma = this.tileset === "sanma";
    const rng = makeRng(this.seed);
    this.tiles = buildAllTiles(this.tileset);
    shuffle(this.tiles, rng);

    // Dead wall = last 14 tiles. Live wall = the rest.
    const total = this.tiles.length; // 136 or 108
    this.deadWall = this.tiles.slice(total - 14);
    this.live = this.tiles.slice(0, total - 14);
    this.liveIndex = 0; // next live draw

    // Dead wall layout (indices into this.deadWall):
    //   [0..3]  rinshan (replacement) tiles
    //   [4]     1st dora indicator,   [5] 1st ura indicator
    //   [6]     2nd dora indicator,   [7] 2nd ura ...
    //   ... up to 5 dora / 5 ura
    this.doraRevealed = 1; // how many dora indicators are face up
    this.rinshanDrawn = 0;
  }

  get liveRemaining() {
    return this.live.length - this.liveIndex;
  }

  // Draw the next live tile (front of wall). Returns tile or null if exhausted.
  drawLive() {
    if (this.liveRemaining <= 0) return null;
    return this.live[this.liveIndex++];
  }

  // Peek the next n live tiles without consuming (used by draw-biasing abilities).
  peekLive(n = 1) {
    return this.live.slice(this.liveIndex, this.liveIndex + n);
  }

  // Take a specific live tile by its position offset from the current draw head,
  // swapping it to the head first. Used by abilities that pick a tile to draw.
  drawLiveAt(offset) {
    const target = this.liveIndex + offset;
    if (target < this.liveIndex || target >= this.live.length) return this.drawLive();
    [this.live[this.liveIndex], this.live[target]] = [this.live[target], this.live[this.liveIndex]];
    return this.drawLive();
  }

  drawRinshan() {
    if (this.rinshanDrawn >= 4) return null;
    const t = this.deadWall[this.rinshanDrawn++];
    return t;
  }

  // 北抜き (sanma kita) replacement tile. Simplified: pull from the front of the
  // live wall, which naturally reduces the remaining draws by one and avoids
  // dead-wall exhaustion bookkeeping.
  drawReplacement() {
    return this.drawLive();
  }

  // Reveal one more kan dora indicator (max 5).
  revealKanDora() {
    if (this.doraRevealed < 5) this.doraRevealed++;
  }

  doraIndicators() {
    const out = [];
    for (let i = 0; i < this.doraRevealed; i++) out.push(this.deadWall[4 + i * 2]);
    return out;
  }
  uraIndicators() {
    const out = [];
    for (let i = 0; i < this.doraRevealed; i++) out.push(this.deadWall[5 + i * 2]);
    return out;
  }

  doraKinds() {
    return this.doraIndicators().map((t) => doraFromIndicator(t.kind, this.tileset));
  }
  uraKinds() {
    return this.uraIndicators().map((t) => doraFromIndicator(t.kind, this.tileset));
  }
}
