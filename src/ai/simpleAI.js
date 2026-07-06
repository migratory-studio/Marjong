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
  // 能力仕様から発動タイミングを判断するための文脈。
  //   progress … ゲームの消化度 0..1。ゲーム回数制(chargeScope:"game")の能力は、
  //              終盤(lastCall)になったら発動条件を緩めて「余らせて終わる」のを防ぐ。
  //   dora / yaochuu … 手の適性（打点の種・么九/中張の寄り）。局を選ぶ能力の判断材料。
  const ctx = { sh, turnNo, p, progress: matchProgress(game), dora: doraInHand(game, p), yaochuu: yaochuuCount(p) };
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
    // 超越帯（fallbackDraw・Lv9+）は生有効牌が無くても“誤差の一打”で発動する
    // （targetKind 未指定＝apply がフォールバック最良を採る）。
    if (ab.id === "zero-search") {
      if (sh === 1 && typeof ab.liveCandidates === "function") {
        const api = game.abilities.apiFor(p);
        const cands = ab.liveCandidates(api);
        if (cands.length > 0) out.push({ id: ab.id, params: { targetKind: cands[0] } });
        else if (ab.fallbackDraw && typeof ab.fallbackKinds === "function" && ab.fallbackKinds(api).length > 0)
          out.push({ id: ab.id, params: {} });
      }
      continue;
    }
    // dora-pull（ドラ寄せ）: 局内の発動回数で判断が変わる（1発目=仕込み/2発目=ダメ押し）。
    if (ab.id === "dora-pull") {
      if (decideDoraPull(game, ab, sh)) out.push({ id: ab.id, params: {} });
      continue;
    }
    if (shouldActivate(ab.id, ctx)) out.push({ id: ab.id, params: {} });
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

// 能力仕様（何が得か・どの手で活きるか・チャージのスコープ）から発動局・発動巡を選ぶ。
// 旧実装は lucky-draw/rootou/chunchan が「sh>=2 && 2巡目まで」＝配牌はほぼ常に2シャンテン
// 以上なので実質“開幕ブッパ”で、ゲーム2回ぶんのチャージを最初の2局で浪費していた。
function shouldActivate(id, { sh, turnNo, p, progress, dora, yaochuu }) {
  // ゲーム回数制の能力は、終盤に入ったら条件を緩めて使い切る（余らせ＝丸損）。
  const lastCall = progress >= 0.7;
  switch (id) {
    // pull a tile when one away from tenpai (best value for a single pull)
    case "summon-tile": return sh === 1;
    // 詩玥「ツモ偏重」(1ゲーム2局): 押す価値のある局にだけ注ぐ。
    //   ①速い立ち上がり（2巡目までに2シャンテン以下）＝加速の伸びしろが大きい
    //   ②打点の種がある手（ドラ2枚以上）＝寄せた先の和了が重い
    case "lucky-draw":
      if (turnNo > 5) return false; // 中盤以降に切っても偏向ツモの回数が残らない
      if (turnNo <= 2 && sh <= 2) return true;
      if (dora >= 2 && sh <= 3) return true;
      return lastCall && sh <= 3;
    // 姚玖「老頭ツモ」(1ゲーム2局): 么九牌が既に厚い手（混老頭/トイトイ/国士気配）で
    // こそ么九寄せが活きる。バラけた手で切ると手なりを壊すだけ。
    case "rootou":
      if (turnNo > 6) return false;
      if (yaochuu >= 7) return true;
      return lastCall && yaochuu >= 5;
    // 春嬋「中張ツモ」(1ゲーム2局): タンヤオ・平和系（么九牌が少ない配牌）で発動。
    case "chunchan":
      if (turnNo > 6) return false;
      if (yaochuu <= 2 && sh <= 3) return true;
      return lastCall && yaochuu <= 3;
    // open up to speed up a slow closed hand
    case "omni-chi": return sh >= 2 && turnNo <= 3 && p.menzen;
    // 焔「焔」(1巡目限定・1ゲーム2局): 満貫未満は固定点に落ちる諸刃なので、
    // 打点の種（ドラ）か神配牌（1シャンテン）があるときだけ賭ける。
    case "homura":
      if (turnNo !== 0) return false;
      if (sh <= 1) return true;
      if (sh === 2 && dora >= 1) return true;
      return lastCall && sh <= 3;
    default: return false;
  }
}

// ドラニエル「ドラ寄せ」(1局2回): 新ドラは全員の刃にもなる諸刃なので、自分の和了が
// 近い局にだけ暴く。1発目＝1シャンテン以下で仕込み、2発目＝聴牌してからのダメ押し。
// ドラ表示が3枚見えている卓は次のめくりで四開槓（流局）が近いので自重する。
function decideDoraPull(game, ab, sh) {
  if (game.wall.doraKinds().length >= 3) return false;
  const fired = ab._activationsThisHand || 0;
  if (fired === 0) return sh <= 1;
  return sh <= 0;
}

// ゲームの消化度 0..1 の概算。局数上限（楼光の1〜3局戦）があればそちらを優先。
// 連荘は概算に含めない（東風=4局/半荘=8局を分母にした目安で足りる）。
function matchProgress(game) {
  if (game.maxHands != null) return Math.min(1, game.handNumber / game.maxHands);
  const total = (game.maxRounds || 1) * game.numPlayers;
  const played = (game.roundWind - 27) * game.numPlayers + (game.kyoku - 1);
  return Math.min(1, played / Math.max(1, total));
}

// 手中のドラ枚数（表示ドラの重複ぶん＋赤5）。打点の種の有無を見る。
function doraInHand(game, p) {
  const mult = new Map();
  for (const k of game.wall.doraKinds()) mult.set(k, (mult.get(k) || 0) + 1);
  let n = 0;
  for (const t of p.hand) n += (mult.get(t.kind) || 0) + (t.red ? 1 : 0);
  return n;
}

// 手中の么九牌（1・9・字牌）枚数。老頭/中張ツモの「手の寄り」判定に使う。
function yaochuuCount(p) {
  return p.hand.filter((t) => isHonor(t.kind) || rankOf(t.kind) === 1 || rankOf(t.kind) === 9).length;
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
