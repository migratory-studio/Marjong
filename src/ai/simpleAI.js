// Simple rule-based CPU. Not strong — readable and "good enough" for a prototype.
import { isHonor, isDragon, rankOf, suitOf, SUITS, makeKind } from "../core/tiles.js";
import { waits } from "../core/rules/winCheck.js";
import { shanten, ukeire } from "../core/rules/shanten.js";
import { MeldType } from "../core/meld.js";

// Decide what to do when it's the CPU's turn to discard.
// Returns { type: 'tsumo' } | { type: 'kan', kind, kanType } | { type: 'discard', tileId, riichi }
export function decideDiscard(game, playerIndex) {
  const p = game.players[playerIndex];
  const opts = game.actionOptions(playerIndex);
  if (!opts) return null;

  if (opts.tsumo) return { type: "tsumo" };

  // JaneDoe 強制ツモ切り中: ツモ牌をそのまま切る（リーチ/カン/打牌選択は不可）。
  if (opts.forcedTsumogiri && p.drawnTileId != null) {
    return { type: "discard", tileId: p.drawnTileId, riichi: false };
  }

  // 北抜き (三麻): North is never yakuhai here and can't form a useful run, so
  // pulling it for a free nuki-dora is almost always correct. Do it before riichi.
  if (opts.nuki) return { type: "nuki" };

  // 和了不可キャラ（カリュブディス）は手牌の上がり目がゼロ。リーチは
  // 「二度と回収できない供託1000点 + 強制ツモ切りで放銃率増」の純損失なので絶対に打たない。
  const noWin = cannotWin(p);

  // Declare riichi whenever legal (showcases the mechanic) — except for noWin chars.
  if (opts.riichi && !noWin) {
    const kind = opts.riichiDiscards[0];
    const tile = pickDiscardTile(p, kind);
    return { type: "discard", tileId: tile.id, riichi: true };
  }

  // If already riichi, must tsumogiri (discard the drawn tile).
  if (p.riichi) {
    return { type: "discard", tileId: p.drawnTileId, riichi: false };
  }

  // Otherwise discard the least useful tile (with basic safety vs riichi).
  const danger = riichiThreat(game, playerIndex);
  const kind = chooseDiscardKind(game, p, danger, noWin);
  const tile = pickDiscardTile(p, kind);
  return { type: "discard", tileId: tile.id, riichi: false };
}

// Decide which manual abilities the CPU should activate before discarding.
// Returns an array of { id, params } (params is the activation payload, e.g. the
// chosen river tile for recall-deal; {} for abilities that take no target).
// Called on the CPU's own AWAIT_DISCARD turn (the draw for this turn already
// happened, so draw-biasing affects later draws).
export function decideAbilityActivations(game, playerIndex) {
  const p = game.players[playerIndex];
  const counts = p.counts();
  const m = p.numMeldSets();
  const sh = shanten(counts, m);
  const turnNo = p.discards.length; // 0 on the very first discard of the hand
  const out = [];
  for (const ab of p.abilities || []) {
    if (ab.activation !== "manual" || ab.active || !ab.ready) continue;
    // recall-deal needs a target (which river tile to recall) — choose it here.
    if (ab.id === "recall-deal") {
      const params = decideRecall(game, p);
      if (params) out.push({ id: ab.id, params });
      continue;
    }
    // jane-doe needs a target opponent (the most threatening non-riichi player).
    if (ab.id === "jane-doe") {
      const params = decideJaneDoe(game, p);
      if (params) out.push({ id: ab.id, params });
      continue;
    }
    // bibi: defensive — fire when a riichi threat is on the table.
    if (ab.id === "bibi") {
      if (decideBibi(game, p)) out.push({ id: ab.id, params: {} });
      continue;
    }
    // kakeha-bet: 1巡目の賭け。賭け金を選ぶ必要がある。
    if (ab.id === "kakeha-bet") {
      const params = decideKakeha(p, sh, turnNo);
      if (params) out.push({ id: ab.id, params });
      continue;
    }
    // zero-search（ゼロ・リサーチ）: 自手番1シャンテンで生有効牌が在れば発動し、最良
    // 候補（待ち広い順トップ）を確保する。候補算出は能力本体の liveCandidates に委ねる。
    if (ab.id === "zero-search") {
      if (sh === 1 && typeof ab.liveCandidates === "function") {
        const cands = ab.liveCandidates(game.abilities.apiFor(p));
        if (cands.length > 0) out.push({ id: ab.id, params: { targetKind: cands[0] } });
      }
      continue;
    }
    if (shouldActivate(ab.id, { sh, turnNo, p })) out.push({ id: ab.id, params: {} });
  }
  return out;
}

// Choose the river tile for リコール・ディール, or null to not use it this turn.
// We only recall when swapping the drawn tile for a previously discarded tile
// STRICTLY reduces shanten (a clear hand advance). Among such swaps we pick the
// one giving the widest acceptance. Gated to non-tenpai (the engine enforces it
// too). The CPU uses it offensively only; richer (defensive) use is left to humans.
function decideRecall(game, p) {
  if (p.drawnTileId == null || !p.discards || p.discards.length === 0) return null;
  const m = p.numMeldSets();
  const counts = p.counts(); // 14 tiles incl. the drawn tile
  const curShanten = shanten(counts, m);
  if (curShanten <= 0) return null; // tenpai/complete: cannot or no need
  const drawn = p.hand.find((t) => t.id === p.drawnTileId);
  if (!drawn) return null;

  let best = null, bestSh = curShanten, bestUke = -1;
  const seen = new Set();
  for (const r of p.discards) {
    if (r.kind === drawn.kind || seen.has(r.kind)) continue;
    seen.add(r.kind);
    counts[drawn.kind]--; counts[r.kind]++;
    const sh2 = shanten(counts, m);
    const uk2 = sh2 < curShanten ? ukeire(counts, m, sh2).count : -1;
    counts[drawn.kind]++; counts[r.kind]--;
    if (sh2 < curShanten && (sh2 < bestSh || (sh2 === bestSh && uk2 > bestUke))) {
      best = r.id; bestSh = sh2; bestUke = uk2;
    }
  }
  return best != null ? { riverTileId: best } : null;
}

function shouldActivate(id, { sh, turnNo, p }) {
  switch (id) {
    // pull a tile when one away from tenpai (best value for a single pull)
    case "summon-tile": return sh === 1;
    // draw-biasing boosts: spend early while the hand is still far from tenpai
    case "lucky-draw":
    case "rootou":
    case "chunchan": return sh >= 2 && turnNo <= 2;
    // ドラ寄せ: 新ドラ表示牌をめくり、和了時に発動回数ぶんの確定ドラを得る。テンパイ前
    // （1シャンテン以下＝ sh>=1）に切って打点を仕込む。1局2回ぶん、終盤までに使い切る。
    case "dora-pull": return sh >= 1;
    // open up to speed up a slow closed hand
    case "omni-chi": return sh >= 2 && turnNo <= 3 && p.menzen;
    // 焔: 1巡目限定の博打。立ち上がりが整っている局に賭ける。
    case "homura": return turnNo === 0 && sh <= 2;
    default: return false;
  }
}

// jane-doe target: the most threatening non-riichi opponent (lowest shanten).
// Only fire when someone is genuinely close (tenpai / 1-shanten) to make the
// 3-turn lock worthwhile.
function decideJaneDoe(game, p) {
  let best = null, bestSh = 99;
  for (const o of game.players) {
    if (o === p || o.riichi) continue;
    const sh = shanten(o.counts(), o.numMeldSets());
    if (sh < bestSh) { bestSh = sh; best = o; }
  }
  return best && bestSh <= 1 ? { targetIndex: best.index } : null;
}

// bibi: activate the damage-immunity window when (1) an opponent has declared
// riichi AND (2) we are NOT within the last 4 turns. 守りは6打牌ぶん続くので、
// 残り巡が少ない局面（残り4巡以内）では発動しても活かしきれない＝温存する。
// 1巡 ≒ 4ツモ（4人分）で概算する。
function decideBibi(game, p) {
  const threat = game.players.some((o) => o !== p && o.riichi);
  if (!threat) return false;
  const turnsLeft = Math.floor(game.wall.liveRemaining / game.numPlayers);
  return turnsLeft > 4; // 残り4巡以内では発動しない
}

// 大博打(賭羽ルイナ)の賭け金を選ぶ。1巡目に立ち上がりが整っている局にだけ賭ける。
// 賭け金は前払いで戻らないので、持ち点に十分な余裕を残せる範囲で。10000点(2倍)は
// 滑り出しが特に良く(0シャンテン付近)、HPに大きな余裕があるときのみ。
function decideKakeha(p, sh, turnNo) {
  if (turnNo !== 0 || sh > 2) return null;
  if (sh <= 1 && p.points >= 22000) return { betAmount: 10000 };
  if (p.points >= 11000) return { betAmount: 5000 };
  return null;
}

// Decide a call response. options is the engine's per-player call options.
// Returns { action: 'ron'|'pon'|'kan'|'chi'|'pass', meta }
export function decideCall(game, playerIndex, options) {
  if (options.ron) return { action: "ron" };

  const p = game.players[playerIndex];
  const kind = game.lastDiscard.kind;

  // Pon only valuable triplets (yakuhai) to actually have a yaku.
  if (options.pon && isValuableTriplet(game, p, kind)) {
    return { action: "pon" };
  }

  // Chi only if it brings the hand to tenpai and yields a yaku-friendly shape.
  if (options.chi.length > 0) {
    for (const seq of options.chi) {
      if (chiReachesTenpai(p, kind, seq)) return { action: "chi", meta: seq };
    }
  }

  return { action: "pass" };
}

// ---------------------------------------------------------------- heuristics
// 和了が常時不可なキャラ（カリュブディス「淵の蒐集」）かどうか。
// この判定で AI はリーチを封じ、脅威に対し聴牌でも降りる。
function cannotWin(p) {
  return (p.abilities || []).some((a) => a.id === "abyss-collection");
}

function isValuableTriplet(game, p, kind) {
  if (isDragon(kind)) return true;
  if (kind === p.seatWind || kind === game.roundWind) return true;
  return false;
}

function chiReachesTenpai(p, kind, seqKinds) {
  const counts = p.counts();
  // remove the two hand tiles used, add nothing (called tile is external)
  for (const k of seqKinds) counts[k]--;
  // after chi we have one fewer set to make; emulate by treating as +1 meld
  return waits(counts, p.numMeldSets() + 1).length > 0;
}

// Pick a discard that keeps the hand as close to tenpai as possible (lowest
// shanten, then widest acceptance), with safety against riichi when threatened.
// How much each dora is worth, expressed in "ukeire tiles". Holding a dora is
// preferred over ~this-many extra acceptance tiles, but never over a lower
// shanten — shanten stays the top priority, so dora-keeping never slows the hand
// to a worse shanten, only breaks near-ties in favour of value.
const DORA_WEIGHT = 3;

function chooseDiscardKind(game, p, danger, noWin = false) {
  const counts = p.counts();
  const m = p.numMeldSets();
  const kinds = [...new Set(p.hand.map((t) => t.kind))];
  const doraCostFor = doraCost(game, p);

  // If threatened and far from tenpai, fold: prioritise safety over speed.
  // 和了不可キャラ（カリュブディス）は押しても上がり目ゼロ＝放銃リスクだけ負うので、
  // 脅威があればシャンテン数に関係なく（聴牌でも）常にベタ降りする。
  const ownShanten = shanten(counts, m);
  const defend = danger.active && (noWin || ownShanten >= 2);

  let best = kinds[0];
  let bestKey = null;
  for (const k of kinds) {
    counts[k]--;
    const sh = shanten(counts, m);
    const uk = ukeire(counts, m, sh).count;
    counts[k]++;
    const risk = danger.active ? dangerPenalty(k, danger) : 0;

    // attack: shanten, then (acceptance + dora value), then dump terminals.
    // Discarding a dora adds DORA_WEIGHT to the cost, so a dora is shed only when
    // it buys clearly more acceptance or a better shanten.  defend: risk first.
    const value = -uk + DORA_WEIGHT * doraCostFor(k);
    const key = defend
      ? [risk, sh, value, -terminalBias(k, game, p)]
      : [sh, value, -terminalBias(k, game, p), risk];
    if (bestKey === null || lexLess(key, bestKey)) { bestKey = key; best = k; }
  }
  return best;
}

// Returns fn(kind) -> how many dora are lost by discarding one tile of `kind`:
// the dora-indicator multiplicity of the kind, plus 1 if the tile that would be
// discarded is an aka-5 (we only ever shed a red copy when no plain copy exists).
function doraCost(game, p) {
  const mult = new Map();
  for (const k of game.wall.doraKinds()) mult.set(k, (mult.get(k) || 0) + 1);
  return (kind) => {
    let cost = mult.get(kind) || 0;
    const copies = p.hand.filter((t) => t.kind === kind);
    if (copies.length > 0 && copies.every((t) => t.red)) cost += 1;
    return cost;
  };
}

function lexLess(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return false;
}

// Higher = more willing to discard (terminals/non-yakuhai honors).
function terminalBias(kind, game, p) {
  if (isHonor(kind)) {
    if (isDragon(kind) || kind === p.seatWind || kind === game.roundWind) return 0;
    return 2;
  }
  const r = rankOf(kind);
  if (r === 1 || r === 9) return 1;
  return 0;
}

function riichiThreat(game, playerIndex) {
  const threats = game.players.filter(
    (p, i) => i !== playerIndex && p.riichi
  );
  return { active: threats.length > 0, threats };
}

function dangerPenalty(kind, danger) {
  let worst = 0;
  for (const opp of danger.threats) {
    if (opp.discards.some((t) => t.kind === kind)) continue; // genbutsu: safe
    worst = Math.max(worst, isHonor(kind) ? 0.5 : 1);
  }
  return worst;
}

function pickDiscardTile(p, kind) {
  // prefer discarding a non-red copy of the chosen kind
  const candidates = p.hand.filter((t) => t.kind === kind);
  return candidates.find((t) => !t.red) || candidates[0];
}
