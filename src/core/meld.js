// Meld (called/declared set) representation.
export const MeldType = {
  CHI: "chi", // sequence, called from discard
  PON: "pon", // triplet, called from discard
  KAN_OPEN: "minkan", // open kan (called)
  KAN_CLOSED: "ankan", // concealed kan
  KAN_ADDED: "shouminkan", // added kan (pon + 4th)
};

export function makeMeld(type, tiles, fromPlayer = null, calledTile = null) {
  return {
    type,
    tiles: tiles.slice(), // array of physical tiles
    from: fromPlayer, // player index the called tile came from (null if self)
    calledTile, // the specific physical tile that was called
  };
}

export function isKan(meld) {
  return (
    meld.type === MeldType.KAN_OPEN ||
    meld.type === MeldType.KAN_CLOSED ||
    meld.type === MeldType.KAN_ADDED
  );
}

// A meld is "concealed" for yaku purposes only if it's an ankan.
export function isConcealed(meld) {
  return meld.type === MeldType.KAN_CLOSED;
}

// The tile kind this meld is built around.
export function meldKind(meld) {
  return meld.tiles[0].kind;
}
