// Yaku (hand value patterns) detection for a single standard decomposition.
// Returns { yaku: [{name, han}], yakuman: [{name, times}], dora: n }.
//
// A "group" is one of the 4 sets, unified across concealed tiles and called melds:
//   { type: "run"|"triplet"|"kan", kind, concealed: bool }
// `pair` is a kind. The scorer (score.js) handles fu/wait; this file is value only.
import {
  isHonor, isTerminal, isTerminalOrHonor, isSimple,
  rankOf, suitOf, honorOf, isWind, isDragon, SUITS,
} from "../tiles.js";

const GREEN_TILES = new Set([19, 20, 21, 23, 25, 32]); // 2s3s4s6s8s + Hatsu

export function evaluateYaku(groups, pair, ctx) {
  const yaku = [];
  const yakuman = [];

  const triplets = groups.filter((g) => g.type === "triplet" || g.type === "kan");
  const runs = groups.filter((g) => g.type === "run");
  const allKinds = [...groups.map((g) => g.kind), pair];

  const isClosed = ctx.menzen;

  // ---- Yakuman first (they override normal yaku) ----
  // Kokushi handled by caller (special hand), not here.

  // Suuankou: four concealed triplets (tsumo, or ron not completing one).
  const concealedTriplets = triplets.filter((g) => g.concealed);
  if (isClosed && concealedTriplets.length === 4) {
    // tanki (pair wait) makes it the rare single-wait suuankou; either way yakuman.
    const tanki = ctx.winningTile === pair;
    yakuman.push({ name: tanki ? "四暗刻単騎" : "四暗刻", times: tanki ? 2 : 1 });
  }

  // Daisangen: triplets of all three dragons.
  const dragonTriplets = triplets.filter((g) => isDragon(g.kind));
  if (dragonTriplets.length === 3) yakuman.push({ name: "大三元", times: 1 });

  // Suushii: winds.
  const windTriplets = triplets.filter((g) => isWind(g.kind));
  if (windTriplets.length === 4) yakuman.push({ name: "大四喜", times: 2 });
  else if (windTriplets.length === 3 && isWind(pair)) yakuman.push({ name: "小四喜", times: 1 });

  // Tsuuiisou: all honors.
  if (allKinds.every((k) => isHonor(k))) yakuman.push({ name: "字一色", times: 1 });

  // Chinroutou: all terminals.
  if (allKinds.every((k) => isTerminal(k))) yakuman.push({ name: "清老頭", times: 1 });

  // Ryuuiisou: all green.
  const allTiles = [...groupTiles(groups), pair, pair];
  if (allTiles.every((k) => GREEN_TILES.has(k))) yakuman.push({ name: "緑一色", times: 1 });

  // Suukantsu.
  if (triplets.filter((g) => g.type === "kan").length === 4) yakuman.push({ name: "四槓子", times: 1 });

  // Chuuren poutou (nine gates): closed, single suit 1112345678999 + any.
  if (isClosed && isChuuren(groups, pair)) yakuman.push({ name: "九蓮宝燈", times: 1 });

  if (yakuman.length > 0) {
    return { yaku: [], yakuman, dora: countDora(groups, pair, ctx) };
  }

  // ---- Normal yaku ----
  if (ctx.doubleRiichi) yaku.push({ name: "ダブル立直", han: 2 });
  else if (ctx.riichi) yaku.push({ name: "立直", han: 1 });
  if (ctx.ippatsu) yaku.push({ name: "一発", han: 1 });
  if (ctx.tsumo && isClosed) yaku.push({ name: "門前清自摸和", han: 1 });
  if (ctx.haitei) yaku.push({ name: "海底摸月", han: 1 });
  if (ctx.houtei) yaku.push({ name: "河底撈魚", han: 1 });
  if (ctx.rinshan) yaku.push({ name: "嶺上開花", han: 1 });
  if (ctx.chankan) yaku.push({ name: "槍槓", han: 1 });

  // Pinfu: closed, all runs, non-yakuhai pair, ryanmen wait (wait checked by scorer).
  if (isClosed && runs.length === 4 && !isYakuhaiPair(pair, ctx) && ctx.ryanmenWait) {
    yaku.push({ name: "平和", han: 1 });
  }

  // Tanyao: no terminals/honors anywhere.
  if (allTiles.every((k) => isSimple(k))) yaku.push({ name: "断幺九", han: 1 });

  // Yakuhai: dragon triplets, seat/round wind triplets.
  for (const g of triplets) {
    if (isDragon(g.kind)) yaku.push({ name: `役牌(${["白", "發", "中"][honorOf(g.kind) - 5]})`, han: 1 });
    if (g.kind === ctx.roundWind) yaku.push({ name: "場風", han: 1 });
    if (g.kind === ctx.seatWind) yaku.push({ name: "自風", han: 1 });
  }

  // Shousangen: 2 dragon triplets + dragon pair.
  if (dragonTriplets.length === 2 && isDragon(pair)) yaku.push({ name: "小三元", han: 2 });

  // Iipeikou / Ryanpeikou (closed only): identical runs.
  if (isClosed) {
    const pk = countIdenticalRunPairs(runs);
    if (pk >= 2) yaku.push({ name: "二盃口", han: 3 });
    else if (pk === 1) yaku.push({ name: "一盃口", han: 1 });
  }

  // Sanshoku doujun: same run in all three suits.
  if (hasSanshokuDoujun(runs)) yaku.push({ name: "三色同順", han: isClosed ? 2 : 1 });

  // Sanshoku doukou: same triplet kind across three suits.
  if (hasSanshokuDoukou(triplets)) yaku.push({ name: "三色同刻", han: 2 });

  // Ittsuu: 123 456 789 in one suit.
  if (hasIttsuu(runs)) yaku.push({ name: "一気通貫", han: isClosed ? 2 : 1 });

  // Toitoi: all triplets/kans.
  if (triplets.length === 4) yaku.push({ name: "対々和", han: 2 });

  // Sanankou: three concealed triplets.
  if (concealedTriplets.length === 3) yaku.push({ name: "三暗刻", han: 2 });

  // Sankantsu.
  if (triplets.filter((g) => g.type === "kan").length === 3) yaku.push({ name: "三槓子", han: 2 });

  // Honroutou: all terminals/honors (with toitoi/chiitoi shapes).
  if (allTiles.every((k) => isTerminalOrHonor(k))) yaku.push({ name: "混老頭", han: 2 });

  // Chanta / Junchan: every set & the pair contain a terminal/honor.
  const chanta = chantaType(groups, pair);
  if (chanta === "junchan") yaku.push({ name: "純全帯幺九", han: isClosed ? 3 : 2 });
  else if (chanta === "chanta") yaku.push({ name: "混全帯幺九", han: isClosed ? 2 : 1 });

  // Honitsu / Chinitsu.
  const suits = new Set(allKinds.filter((k) => !isHonor(k)).map((k) => suitOf(k)));
  const hasHonor = allKinds.some((k) => isHonor(k));
  if (suits.size === 1) {
    if (!hasHonor) yaku.push({ name: "清一色", han: isClosed ? 6 : 5 });
    else yaku.push({ name: "混一色", han: isClosed ? 3 : 2 });
  }

  return { yaku, yakuman, dora: countDora(groups, pair, ctx) };
}

// ---------- helpers ----------
function groupTiles(groups) {
  // expand each group into its constituent tile kinds (3 each; runs k,k+1,k+2)
  const out = [];
  for (const g of groups) {
    if (g.type === "run") out.push(g.kind, g.kind + 1, g.kind + 2);
    else out.push(g.kind, g.kind, g.kind); // triplet/kan: kind*3 (4th doesn't change yaku)
  }
  return out;
}

function isYakuhaiPair(pair, ctx) {
  return isDragon(pair) || pair === ctx.roundWind || pair === ctx.seatWind;
}

function countIdenticalRunPairs(runs) {
  const map = new Map();
  for (const r of runs) map.set(r.kind, (map.get(r.kind) || 0) + 1);
  let pairs = 0;
  for (const c of map.values()) pairs += Math.floor(c / 2);
  return pairs;
}

export function hasSanshokuDoujun(runs) {
  // A run's `kind` is its lowest tile; group lowest-ranks by suit.
  for (let rank = 1; rank <= 7; rank++) {
    const suits = new Set(
      runs.filter((r) => !isHonor(r.kind) && rankOf(r.kind) === rank).map((r) => suitOf(r.kind))
    );
    if (suits.size === 3) return true;
  }
  return false;
}

function hasSanshokuDoukou(triplets) {
  for (const t of triplets) {
    if (isHonor(t.kind)) continue;
    const rank = rankOf(t.kind);
    const suits = new Set(
      triplets.filter((x) => !isHonor(x.kind) && rankOf(x.kind) === rank).map((x) => suitOf(x.kind))
    );
    if (suits.size === 3) return true;
  }
  return false;
}

function hasIttsuu(runs) {
  for (const suit of [SUITS.MAN, SUITS.PIN, SUITS.SOU]) {
    const ranks = new Set(runs.filter((r) => suitOf(r.kind) === suit).map((r) => rankOf(r.kind)));
    if (ranks.has(1) && ranks.has(4) && ranks.has(7)) return true;
  }
  return false;
}

function chantaType(groups, pair) {
  let allHaveTerminal = true;
  let anyHonor = isHonor(pair);
  let anyRun = false;
  const check = (kinds) => kinds.some((k) => isTerminalOrHonor(k));
  // pair
  if (!isTerminalOrHonor(pair)) allHaveTerminal = false;
  for (const g of groups) {
    if (g.type === "run") {
      anyRun = true;
      const kinds = [g.kind, g.kind + 1, g.kind + 2];
      if (!check(kinds)) allHaveTerminal = false;
      if (kinds.some((k) => isHonor(k))) anyHonor = true; // runs can't contain honors, stays false
    } else {
      if (!isTerminalOrHonor(g.kind)) allHaveTerminal = false;
      if (isHonor(g.kind)) anyHonor = true;
    }
  }
  if (!allHaveTerminal) return null;
  if (!anyRun) return null; // pure terminal/honor with no run is honroutou, handled separately
  return anyHonor ? "chanta" : "junchan";
}

function isChuuren(groups, pair) {
  // single suit, no honors
  const kinds = [...groupTiles(groups), pair, pair];
  if (kinds.some((k) => isHonor(k))) return false;
  const suit = suitOf(kinds[0]);
  if (!kinds.every((k) => suitOf(k) === suit)) return false;
  const counts = new Array(10).fill(0); // rank 1..9
  for (const k of kinds) counts[rankOf(k)]++;
  // need at least 3x1, 1x each 2..8, 3x9, plus one extra anywhere
  const need = [0, 3, 1, 1, 1, 1, 1, 1, 1, 3];
  let extra = 0;
  for (let r = 1; r <= 9; r++) {
    if (counts[r] < need[r]) return false;
    extra += counts[r] - need[r];
  }
  return extra === 1;
}

function countDora(groups, pair, ctx) {
  const kinds = [...groupTiles(groups), pair, pair];
  // For kans, the 4th tile also counts as dora; approximate by adding kan extra.
  let dora = 0;
  for (const dk of ctx.doraKinds || []) dora += kinds.filter((k) => k === dk).length;
  // kan 4th tile dora
  for (const g of groups) {
    if (g.type === "kan") {
      for (const dk of ctx.doraKinds || []) if (g.kind === dk) dora += 1;
    }
  }
  if (ctx.riichi) for (const uk of ctx.uraKinds || []) dora += kinds.filter((k) => k === uk).length;
  dora += ctx.redCount || 0;
  return dora;
}
