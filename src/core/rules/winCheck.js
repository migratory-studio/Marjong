// Agari (winning hand) detection and decomposition.
//
// Works on a 34-length "counts" array of the CONCEALED tiles (melds handled
// separately by the scorer). Returns all distinct standard decompositions plus
// flags for the special hands (seven pairs, thirteen orphans).
import { KINDS, isTerminalOrHonor, rankOf, suitOf, SUITS } from "../tiles.js";

// --- standard form: 4 sets + 1 pair (where each open meld already counts as a set) ---
// numMeldedSets = number of sets already formed by called melds.
// Returns array of decompositions; each is { pair, sets: [{type, kind}] }
// where type is "run" | "triplet". (Open melds are NOT included in `sets`.)
export function decomposeStandard(counts, numMeldedSets) {
  const neededSets = 4 - numMeldedSets;
  const results = [];

  for (let pairKind = 0; pairKind < KINDS; pairKind++) {
    if (counts[pairKind] >= 2) {
      const c = counts.slice();
      c[pairKind] -= 2;
      const sets = [];
      if (decomposeSets(c, 0, neededSets, sets)) {
        results.push({ pair: pairKind, sets: sets.map((s) => ({ ...s })) });
      }
      // Continue scanning for alternative pairs (different decompositions).
      // (decomposeSets above mutates `sets` but we cloned on push.)
    }
  }
  return results;
}

// Greedy-with-backtracking set extraction. Mutates `counts` and `sets`.
function decomposeSets(counts, start, need, sets) {
  if (need === 0) {
    // all tiles must be consumed
    for (let k = 0; k < KINDS; k++) if (counts[k] !== 0) return false;
    return true;
  }
  // advance to first non-empty kind
  let k = start;
  while (k < KINDS && counts[k] === 0) k++;
  if (k >= KINDS) return false;

  // Try triplet
  if (counts[k] >= 3) {
    counts[k] -= 3;
    sets.push({ type: "triplet", kind: k });
    if (decomposeSets(counts, k, need - 1, sets)) return true;
    sets.pop();
    counts[k] += 3;
  }

  // Try run k, k+1, k+2 (only within a number suit, not crossing suit boundary)
  if (canStartRun(k) && counts[k + 1] > 0 && counts[k + 2] > 0) {
    counts[k]--; counts[k + 1]--; counts[k + 2]--;
    sets.push({ type: "run", kind: k });
    if (decomposeSets(counts, k, need - 1, sets)) return true;
    sets.pop();
    counts[k]++; counts[k + 1]++; counts[k + 2]++;
  }

  return false;
}

function canStartRun(k) {
  // honors can't form runs; rank must be <= 7 and within same suit
  if (k >= 27) return false;
  const r = rankOf(k);
  return r <= 7;
}

// --- seven pairs (chiitoitsu) ---
export function isChiitoitsu(counts, numMeldedSets) {
  if (numMeldedSets !== 0) return false;
  let pairs = 0;
  for (let k = 0; k < KINDS; k++) {
    if (counts[k] === 2) pairs++;
    else if (counts[k] !== 0) return false; // 4-of-a-kind doesn't count as 2 pairs
  }
  return pairs === 7;
}

// --- thirteen orphans (kokushi) ---
const TERMINALS_HONORS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
export function isKokushi(counts, numMeldedSets) {
  if (numMeldedSets !== 0) return false;
  let pair = false;
  for (let k = 0; k < KINDS; k++) {
    if (TERMINALS_HONORS.includes(k)) {
      if (counts[k] === 0) return false;
      if (counts[k] === 2) pair = true;
      else if (counts[k] !== 1) return false;
    } else if (counts[k] !== 0) {
      return false;
    }
  }
  return pair;
}

// Top-level: is this a winning hand at all?
export function isAgari(counts, numMeldedSets) {
  if (isKokushi(counts, numMeldedSets)) return true;
  if (isChiitoitsu(counts, numMeldedSets)) return true;
  return decomposeStandard(counts, numMeldedSets).length > 0;
}

// Tenpai check: is there any tile that completes the hand?
// counts = concealed tiles (one short of a full hand). Returns array of waiting kinds.
export function waits(counts, numMeldedSets) {
  const w = [];
  for (let k = 0; k < KINDS; k++) {
    if (counts[k] >= 4) continue;
    counts[k]++;
    if (isAgari(counts, numMeldedSets)) w.push(k);
    counts[k]--;
  }
  return w;
}

export { TERMINALS_HONORS };
