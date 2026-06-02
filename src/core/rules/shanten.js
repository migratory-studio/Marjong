// Shanten (distance to tenpai) calculation: standard form, seven pairs, and
// thirteen orphans. Used by the AI for efficient discards. -1 = complete hand,
// 0 = tenpai, n = n tiles away from tenpai.
import { KINDS } from "../tiles.js";

const TERMINALS_HONORS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

export function shanten(counts, melds = 0) {
  return Math.min(
    shantenStandard(counts, melds),
    melds === 0 ? shantenChiitoi(counts) : 99,
    melds === 0 ? shantenKokushi(counts) : 99
  );
}

export function shantenStandard(counts, melds) {
  const c = counts.slice();
  let min = 8;
  function dfs(i, sets, partials, hasPair) {
    while (i < KINDS && c[i] === 0) i++;
    if (i === KINDS) {
      const s = 8 - 2 * (melds + sets) - partials - (hasPair ? 1 : 0);
      if (s < min) min = s;
      return;
    }
    const blocks = melds + sets + partials; // sets+partials (pair counted separately)
    // complete triplet
    if (c[i] >= 3) { c[i] -= 3; dfs(i, sets + 1, partials, hasPair); c[i] += 3; }
    // complete run
    if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      dfs(i, sets + 1, partials, hasPair);
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
    // the pair (only one allowed)
    if (!hasPair && c[i] >= 2) { c[i] -= 2; dfs(i, sets, partials, true); c[i] += 2; }
    // partial: pair toward triplet
    if (c[i] >= 2 && blocks < 4) { c[i] -= 2; dfs(i, sets, partials + 1, hasPair); c[i] += 2; }
    // partial: two-tile proto-run
    if (i < 27 && blocks < 4) {
      if (i % 9 <= 7 && c[i + 1] > 0) { c[i]--; c[i + 1]--; dfs(i, sets, partials + 1, hasPair); c[i]++; c[i + 1]++; }
      if (i % 9 <= 6 && c[i + 2] > 0) { c[i]--; c[i + 2]--; dfs(i, sets, partials + 1, hasPair); c[i]++; c[i + 2]++; }
    }
    // float one copy
    c[i]--; dfs(i, sets, partials, hasPair); c[i]++;
  }
  dfs(0, 0, 0, false);
  return min;
}

export function shantenChiitoi(counts) {
  let pairs = 0, kinds = 0;
  for (let k = 0; k < KINDS; k++) {
    if (counts[k] >= 1) kinds++;
    if (counts[k] >= 2) pairs++;
  }
  return 6 - pairs + Math.max(0, 7 - kinds);
}

export function shantenKokushi(counts) {
  let types = 0, hasPair = false;
  for (const k of TERMINALS_HONORS) {
    if (counts[k] >= 1) types++;
    if (counts[k] >= 2) hasPair = true;
  }
  return 13 - types - (hasPair ? 1 : 0);
}

// Ukeire: which tile kinds reduce shanten, and how many such tiles remain
// (ignoring visibility — a cheap estimate). Returns { count, kinds }.
export function ukeire(counts, melds, currentShanten) {
  let count = 0;
  const kinds = [];
  for (let k = 0; k < KINDS; k++) {
    if (counts[k] >= 4) continue;
    counts[k]++;
    if (shanten(counts, melds) < currentShanten) {
      kinds.push(k);
      count += 4 - (counts[k] - 1);
    }
    counts[k]--;
  }
  return { count, kinds };
}
