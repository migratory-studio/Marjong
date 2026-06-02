// The wall: live wall (draws), dead wall (dora indicators, ura-dora, rinshan).
import { TILES, KINDS, doraFromIndicator } from "./tiles.js";

// Red-five tiles: one red 5 per number suit (kinds 4=5m, 13=5p, 22=5s),
// using the first physical copy of each. Red fives count as extra dora.
const RED_KINDS = new Set([4, 13, 22]);

function buildAllTiles() {
  const tiles = [];
  let id = 0;
  for (let kind = 0; kind < KINDS; kind++) {
    for (let copy = 0; copy < 4; copy++) {
      const red = RED_KINDS.has(kind) && copy === 0;
      tiles.push({ id: id++, kind, red });
    }
  }
  return tiles; // length === TILES (136)
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
  constructor(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.seed = seed >>> 0;
    const rng = makeRng(this.seed);
    this.tiles = buildAllTiles();
    shuffle(this.tiles, rng);

    // Dead wall = last 14 tiles. Live wall = the rest (122 after dealing).
    this.deadWall = this.tiles.slice(TILES - 14);
    this.live = this.tiles.slice(0, TILES - 14);
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
    return this.doraIndicators().map((t) => doraFromIndicator(t.kind));
  }
  uraKinds() {
    return this.uraIndicators().map((t) => doraFromIndicator(t.kind));
  }
}
