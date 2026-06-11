// Scoring: turn a winning hand into fu, han and a points payment structure.
import {
  isTerminalOrHonor, isDragon, isWind, rankOf, isHonor,
} from "../tiles.js";
import { MeldType } from "../meld.js";
import {
  decomposeStandard, isChiitoitsu, isKokushi, isAgari,
} from "./winCheck.js";
import { evaluateYaku } from "./yaku.js";

// Convert a player's called melds into unified "groups".
function meldsToGroups(melds) {
  return melds.map((m) => {
    if (m.type === MeldType.CHI) return { type: "run", kind: m.tiles[0].kind, concealed: false, meld: true };
    if (m.type === MeldType.PON) return { type: "triplet", kind: m.tiles[0].kind, concealed: false, meld: true };
    if (m.type === MeldType.KAN_CLOSED) return { type: "kan", kind: m.tiles[0].kind, concealed: true, meld: true };
    return { type: "kan", kind: m.tiles[0].kind, concealed: false, meld: true }; // minkan / shouminkan
  });
}

// concealedCounts: 34-array of concealed tiles INCLUDING the winning tile.
// melds: array of meld objects (open + ankan).
// ctx: see game.js for the full shape.
// Returns the best-scoring result, or { valid:false } if no yaku / not a win.
export function scoreHand(concealedCounts, melds, ctx) {
  const numMelds = melds.length;
  const menzen = melds.every((m) => m.type === MeldType.KAN_CLOSED);
  const meldGroups = meldsToGroups(melds);

  // 天和/地和 are yakuman regardless of hand shape; they stack with any other
  // yakuman (e.g. tenhou + suuankou) and stand alone otherwise.
  const bonusYakuman = [];
  if (ctx.tenhou) bonusYakuman.push({ name: "天和", times: 1 });
  if (ctx.chiihou) bonusYakuman.push({ name: "地和", times: 1 });

  let best = null;
  const consider = (result) => {
    if (!result || !result.valid) return;
    if (
      !best ||
      result.totalHan > best.totalHan ||
      (result.totalHan === best.totalHan && result.fu > best.fu)
    ) {
      best = result;
    }
  };

  // --- Kokushi (special) ---
  if (isKokushi(concealedCounts, numMelds)) {
    const tanki = concealedCounts[ctx.winningTile] === 2;
    const times = tanki ? 2 : 1;
    return finalizeYakuman([{ name: tanki ? "国士無双十三面" : "国士無双", times }, ...bonusYakuman], ctx);
  }

  // --- Chiitoitsu (special) ---
  if (isChiitoitsu(concealedCounts, numMelds)) {
    const pairs = [];
    for (let k = 0; k < concealedCounts.length; k++) if (concealedCounts[k] === 2) pairs.push(k);
    const ctx2 = { ...ctx, menzen, ryanmenWait: false };
    const fakeGroups = []; // chiitoi has no standard groups
    const evalRes = evaluateChiitoi(pairs, ctx2);
    consider(buildResult(evalRes, 25, ctx2));
  }

  // --- Standard decompositions ---
  const decomps = decomposeStandard(concealedCounts, numMelds);
  for (const d of decomps) {
    // concealed sets from the decomposition
    const concealedSets = d.sets.map((s) => ({
      type: s.type, kind: s.kind, concealed: true, meld: false,
    }));
    // Try every attribution of the winning tile (affects wait fu & ron-opens-triplet).
    const attributions = winningAttributions(concealedSets, d.pair, ctx);
    for (const attr of attributions) {
      const groups = concealedSets.map((g, i) => {
        if (attr.setIndex === i && attr.makesOpen) return { ...g, concealed: false };
        return { ...g };
      }).concat(meldGroups);

      const ctx2 = { ...ctx, menzen, ryanmenWait: attr.ryanmen };
      const ev = evaluateYaku(groups, d.pair, ctx2);
      if (ev.yakuman.length > 0) {
        consider(finalizeYakuman(ev.yakuman, ctx2));
        continue;
      }
      const fu = computeFu(groups, d.pair, attr, ctx2, ev);
      consider(buildResult(ev, fu, ctx2));
    }
  }

  // Apply 天和/地和 on top of the best standard/chiitoi decomposition.
  if (bonusYakuman.length > 0 && isAgari(concealedCounts, numMelds)) {
    if (best && best.isYakuman) return finalizeYakuman([...best.yakuman, ...bonusYakuman], ctx);
    return finalizeYakuman([...bonusYakuman], ctx);
  }

  return best || { valid: false, reason: "no-yaku-or-not-agari" };
}

// Determine ways the winning tile completes a group, and the resulting wait.
function winningAttributions(concealedSets, pair, ctx) {
  const W = ctx.winningTile;
  const out = [];
  // tanki (pair wait)
  if (pair === W) out.push({ setIndex: -1, ryanmen: false, waitFu: 2, makesOpen: false });
  concealedSets.forEach((s, i) => {
    if (s.type === "triplet" && s.kind === W) {
      // shanpon: ron turns this concealed triplet into an open one for fu.
      out.push({ setIndex: i, ryanmen: false, waitFu: 0, makesOpen: ctx.ron === true });
    }
    if (s.type === "run" && (W === s.kind || W === s.kind + 1 || W === s.kind + 2)) {
      let ryanmen = false, waitFu = 0;
      if (W === s.kind + 1) waitFu = 2; // kanchan (closed middle)
      else {
        // edge tile: penchan if 1-2-3 waiting on 3, or 7-8-9 waiting on 7
        const r = rankOf(s.kind); // rank of lowest tile
        const isPenchan = (r === 1 && W === s.kind + 2) || (r === 7 && W === s.kind);
        if (isPenchan) waitFu = 2;
        else ryanmen = true;
      }
      out.push({ setIndex: i, ryanmen, waitFu, makesOpen: false });
    }
  });
  if (out.length === 0) out.push({ setIndex: -1, ryanmen: false, waitFu: 0, makesOpen: false });
  return out;
}

function computeFu(groups, pair, attr, ctx, ev) {
  const isPinfu = ev.yaku.some((y) => y.name === "平和");
  if (isPinfu) return ctx.tsumo ? 20 : 30;

  let fu = 20;
  if (!ctx.tsumo && ctx.menzen) fu += 10; // menzen ron
  if (ctx.tsumo) fu += 2; // tsumo

  // pair
  if (isDragon(pair)) fu += 2;
  if (pair === ctx.roundWind) fu += 2;
  if (pair === ctx.seatWind) fu += 2;

  // triplets / kans
  for (const g of groups) {
    if (g.type !== "triplet" && g.type !== "kan") continue;
    const th = isTerminalOrHonor(g.kind);
    if (g.type === "triplet") {
      fu += g.concealed ? (th ? 8 : 4) : (th ? 4 : 2);
    } else {
      fu += g.concealed ? (th ? 32 : 16) : (th ? 16 : 8);
    }
  }

  // wait
  fu += attr.waitFu;

  // round up to nearest 10
  fu = Math.ceil(fu / 10) * 10;
  if (fu < 30) fu = 30; // open pinfu-shape / minimum non-pinfu
  return fu;
}

function evaluateChiitoi(pairs, ctx) {
  const yaku = [{ name: "七対子", han: 2 }];
  // tanyao / honitsu / chinitsu / honroutou checks on the 7 pair kinds
  const kinds = pairs;
  const tiles = kinds.flatMap((k) => [k, k]);
  if (tiles.every((k) => !isTerminalOrHonor(k))) yaku.push({ name: "断幺九", han: 1 });
  if (tiles.every((k) => isTerminalOrHonor(k))) yaku.push({ name: "混老頭", han: 2 });
  const numberKinds = kinds.filter((k) => !isHonor(k));
  const suits = new Set(numberKinds.map((k) => (k < 9 ? "m" : k < 18 ? "p" : "s")));
  const hasHonor = kinds.some((k) => isHonor(k));
  if (suits.size === 1) {
    if (!hasHonor) yaku.push({ name: "清一色", han: 6 });
    else yaku.push({ name: "混一色", han: 3 });
  }
  if (ctx.doubleRiichi) yaku.push({ name: "ダブル立直", han: 2 });
  else if (ctx.riichi) yaku.push({ name: "立直", han: 1 });
  if (ctx.ippatsu) yaku.push({ name: "一発", han: 1 });
  if (ctx.tsumo) yaku.push({ name: "門前清自摸和", han: 1 });
  if (ctx.haitei) yaku.push({ name: "海底摸月", han: 1 });
  if (ctx.houtei) yaku.push({ name: "河底撈魚", han: 1 });
  if (ctx.chankan) yaku.push({ name: "槍槓", han: 1 });

  // dora
  let dora = 0;
  for (const dk of ctx.doraKinds || []) dora += tiles.filter((k) => k === dk).length;
  if (ctx.riichi) for (const uk of ctx.uraKinds || []) dora += tiles.filter((k) => k === uk).length;
  dora += ctx.redCount || 0;
  dora += ctx.kitaCount || 0; // 北抜き nuki-dora (sanma)
  return { yaku, yakuman: [], dora };
}

function buildResult(ev, fu, ctx) {
  const yakuHan = ev.yaku.reduce((s, y) => s + y.han, 0);
  if (yakuHan === 0) return { valid: false, reason: "no-yaku" };
  const totalHan = yakuHan + ev.dora;
  const payment = computePayment(totalHan, fu, ctx);
  return {
    valid: true,
    yaku: ev.yaku,
    yakuman: [],
    dora: ev.dora,
    yakuHan,
    totalHan,
    fu,
    ...payment,
  };
}

function finalizeYakuman(yakumanList, ctx) {
  const times = yakumanList.reduce((s, y) => s + y.times, 0);
  const payment = computeYakumanPayment(times, ctx);
  return {
    valid: true,
    yaku: [],
    yakuman: yakumanList,
    dora: 0,
    yakuHan: 0,
    totalHan: 13 * times,
    fu: 0,
    isYakuman: true,
    ...payment,
  };
}

const ceil100 = (n) => Math.ceil(n / 100) * 100;

function basePoints(han, fu) {
  if (han >= 13) return 8000; // kazoe yakuman
  if (han >= 11) return 6000; // sanbaiman
  if (han >= 8) return 4000; // baiman
  if (han >= 6) return 3000; // haneman
  if (han >= 5) return 2000; // mangan
  const base = fu * Math.pow(2, 2 + han);
  return Math.min(base, 2000); // han 3-4 high-fu caps at mangan
}

function rankName(han, fu) {
  if (han >= 13) return "数え役満";
  if (han >= 11) return "三倍満";
  if (han >= 8) return "倍満";
  if (han >= 6) return "跳満";
  if (han >= 5 || basePoints(han, fu) >= 2000) return "満貫";
  return "";
}

function computePayment(han, fu, ctx) {
  const base = basePoints(han, fu);
  const honbaTotal = (ctx.honba || 0) * 300;
  const result = { rank: rankName(han, fu), payments: [] };
  if (ctx.tsumo) {
    const honbaEach = (ctx.honba || 0) * 100;
    if (ctx.isDealer) {
      const each = ceil100(base * 2) + honbaEach;
      result.tsumoEach = { nonDealer: each };
      result.total = each * 3;
    } else {
      const fromDealer = ceil100(base * 2) + honbaEach;
      const fromNon = ceil100(base * 1) + honbaEach;
      result.tsumoEach = { dealer: fromDealer, nonDealer: fromNon };
      result.total = fromDealer + fromNon * 2;
    }
  } else {
    const ron = ceil100(base * (ctx.isDealer ? 6 : 4)) + honbaTotal;
    result.ron = ron;
    result.total = ron;
  }
  return result;
}

// 既存の和了結果に確定ドラ（飜）を後付けして払いを再計算する（ドラニエルの「ドラ寄せ」用）。
// 役満結果は対象外（呼び出し側で弾く想定）。fu と honba は元の結果・場況をそのまま用いる。
//   result … buildResult 由来の通常役の結果
//   extra  … 上乗せする確定ドラ枚数（＝飜数）
//   isDealer / tsumo / honba … 払い再計算に必要な場況
export function recomputeWithExtraDora(result, extra, { isDealer, tsumo, honba }) {
  const dora = (result.dora || 0) + extra;
  const totalHan = result.totalHan + extra;
  const payment = computePayment(totalHan, result.fu, { isDealer, tsumo, honba });
  return { ...result, dora, totalHan, ...payment };
}

function computeYakumanPayment(times, ctx) {
  const result = { rank: times > 1 ? `${times}倍役満` : "役満", payments: [] };
  const honbaTotal = (ctx.honba || 0) * 300;
  const honbaEach = (ctx.honba || 0) * 100;
  if (ctx.tsumo) {
    if (ctx.isDealer) {
      const each = 16000 * times + honbaEach;
      result.tsumoEach = { nonDealer: each };
      result.total = each * 3;
    } else {
      const fromDealer = 16000 * times + honbaEach;
      const fromNon = 8000 * times + honbaEach;
      result.tsumoEach = { dealer: fromDealer, nonDealer: fromNon };
      result.total = fromDealer + fromNon * 2;
    }
  } else {
    const ron = (ctx.isDealer ? 48000 : 32000) * times + honbaTotal;
    result.ron = ron;
    result.total = ron;
  }
  return result;
}
