// Tile model.
// We use a "kind" index 0..33 for the 34 distinct tile types, with 4 physical
// copies each (136 tiles total). A physical tile is { id, kind, red }.
//
// Kind layout:
//   0..8   man  1..9   (萬)
//   9..17  pin  1..9   (筒)
//   18..26 sou  1..9   (索)
//   27..30 winds  E,S,W,N        (東南西北)
//   31..33 dragons Haku,Hatsu,Chun (白發中)

export const SUITS = { MAN: "m", PIN: "p", SOU: "s", HONOR: "z" };

export const KINDS = 34;
export const TILES = 136;

const MAN0 = 0;
const PIN0 = 9;
const SOU0 = 18;
const HONOR0 = 27;

export function isHonor(kind) {
  return kind >= HONOR0;
}
export function isWind(kind) {
  return kind >= 27 && kind <= 30;
}
export function isDragon(kind) {
  return kind >= 31 && kind <= 33;
}
export function isTerminal(kind) {
  // 1 or 9 of a number suit.
  if (kind >= HONOR0) return false;
  const r = rankOf(kind);
  return r === 1 || r === 9;
}
export function isTerminalOrHonor(kind) {
  return isHonor(kind) || isTerminal(kind);
}
export function isSimple(kind) {
  return !isTerminalOrHonor(kind);
}

// 1-based rank within its number suit (man/pin/sou). Undefined meaning for honors.
export function rankOf(kind) {
  if (kind < PIN0) return kind - MAN0 + 1;
  if (kind < SOU0) return kind - PIN0 + 1;
  if (kind < HONOR0) return kind - SOU0 + 1;
  return 0;
}

export function suitOf(kind) {
  if (kind < PIN0) return SUITS.MAN;
  if (kind < SOU0) return SUITS.PIN;
  if (kind < HONOR0) return SUITS.SOU;
  return SUITS.HONOR;
}

// Honor sub-index 1..7 (E,S,W,N,Haku,Hatsu,Chun). 0 if not honor.
export function honorOf(kind) {
  return isHonor(kind) ? kind - HONOR0 + 1 : 0;
}

const HONOR_LABELS = ["東", "南", "西", "北", "白", "發", "中"];
const HONOR_LABELS_EN = ["E", "S", "W", "N", "Hk", "Ht", "Ch"];

export function kindLabel(kind) {
  if (isHonor(kind)) return HONOR_LABELS[honorOf(kind) - 1];
  const r = rankOf(kind);
  const suitChar = { m: "萬", p: "筒", s: "索" }[suitOf(kind)];
  return `${r}${suitChar}`;
}

// Short ascii label used for compact UI / debugging, e.g. "3m", "E".
export function kindShort(kind) {
  if (isHonor(kind)) return HONOR_LABELS_EN[honorOf(kind) - 1];
  return `${rankOf(kind)}${suitOf(kind)}`;
}

// The dora tile that an indicator of `kind` points to (next in sequence).
export function doraFromIndicator(kind) {
  if (kind < HONOR0) {
    const r = rankOf(kind);
    const base = kind - (r - 1); // first tile of this suit
    return base + (r % 9); // 9 wraps to 1
  }
  if (isWind(kind)) {
    // E->S->W->N->E
    return 27 + ((kind - 27 + 1) % 4);
  }
  // dragons Haku->Hatsu->Chun->Haku
  return 31 + ((kind - 31 + 1) % 3);
}

// Build a kind from suit + rank (rank 1..9). Used by abilities / tests.
export function makeKind(suit, rank) {
  if (suit === SUITS.MAN) return MAN0 + rank - 1;
  if (suit === SUITS.PIN) return PIN0 + rank - 1;
  if (suit === SUITS.SOU) return SOU0 + rank - 1;
  throw new Error("makeKind: use makeHonor for honors");
}
export function makeHonor(index1to7) {
  return HONOR0 + index1to7 - 1;
}

// Count array helper: 34-length array of zeros.
export function emptyCounts() {
  return new Array(KINDS).fill(0);
}

export function tilesToCounts(tiles) {
  const c = emptyCounts();
  for (const t of tiles) c[t.kind]++;
  return c;
}
