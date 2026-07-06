// アガリ型コンポーザ — オート対局の「和了再現」用フレーバー（見た目専用・エンジン非依存）。
//
// 局頭に見せた 13 枚の配牌（seedKinds）から「この手はどこへ向かえるか」を簡易に読み、
// 役名の雰囲気（清一色/混一色/タンヤオ/平和/対々/四暗刻/大三元/国士…）に合う
// 4面子1雀頭（国士は特殊形）を "配牌から仕上げた手" として合成する。
//   - 配牌の完成面子 → 対子/塔子の補完 → 孤立牌を核にした面子化 の順で拾う
//     ＝合成結果に配牌の面影が最大限残る（恣意的なランダム牌にならない）。
//   - 補充した牌（ツモってきた牌）の 1 枚が和了牌 winKind になる。
//   - discards = 配牌のうち使わなかった牌。河へ流すと「切った牌」として辻褄が合う。
// 返り値: { tiles: kind[13]（ソート済・和了牌抜き）, winKind, discards: kind[] }
import { KINDS, suitOf, rankOf, isHonor } from "../core/tiles.js";

const ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]; // ヤオ九13種
const DRAGONS = [31, 32, 33];
const SUIT_BASE = { m: 0, p: 9, s: 18 };

// 役名（フレーバー文字列）→ 形の制約。HAN_TABLE の役名に含まれる語だけ拾えばよい。
function constraintsOf(yaku) {
  const y = String(yaku || "");
  return {
    kokushi: y.includes("国士"),
    daisangen: y.includes("大三元"),
    tripletsOnly: y.includes("対々") || y.includes("四暗刻"),
    runsOnly: y.includes("平和"),
    chinitsu: y.includes("清一"),
    honitsu: y.includes("混一") && !y.includes("清一"),
    tanyao: y.includes("タンヤオ"),
  };
}

// 国士無双: 13種＋雀頭1枚。配牌にあるヤオ九牌を優先して「集めてきた」形にする。
function composeKokushi(seed, rng) {
  const seedCount = new Array(KINDS).fill(0);
  for (const k of seed) seedCount[k] += 1;
  let dup = ORPHANS.find((k) => seedCount[k] >= 2);
  if (dup == null) {
    const have = ORPHANS.filter((k) => seedCount[k] >= 1);
    dup = have.length ? have[Math.floor(rng() * have.length)] : ORPHANS[Math.floor(rng() * ORPHANS.length)];
  }
  const hand14 = [...ORPHANS, dup];
  // 和了牌＝配牌に無かったヤオ九牌（最後に引き当てた1枚）。全部持っていたら雀頭側。
  const missing = ORPHANS.filter((k) => seedCount[k] === 0 && k !== dup);
  const winKind = missing.length ? missing[Math.floor(rng() * missing.length)] : dup;
  const useLeft = new Array(KINDS).fill(0);
  for (const k of hand14) useLeft[k] += 1;
  const discards = [];
  for (const k of seed) { if (useLeft[k] > 0) useLeft[k] -= 1; else discards.push(k); }
  const tiles = hand14.slice();
  tiles.splice(tiles.indexOf(winKind), 1);
  tiles.sort((a, b) => a - b);
  return { tiles, winKind, discards };
}

export function composeAgari({ seedKinds = null, yaku = "", rng = Math.random } = {}) {
  const c = constraintsOf(yaku);
  const seed = (seedKinds || []).slice();
  if (c.kokushi) return composeKokushi(seed, rng);

  // 染め手のスート＝配牌に一番多い数牌スート（気配のある方へ染める）。無ければランダム。
  let suit = null;
  if (c.chinitsu || c.honitsu) {
    const bySuit = { m: 0, p: 0, s: 0 };
    for (const k of seed) if (!isHonor(k)) bySuit[suitOf(k)] += 1;
    const best = Object.entries(bySuit).sort((a, b) => b[1] - a[1])[0];
    suit = best && best[1] > 0 ? best[0] : ["m", "p", "s"][Math.floor(rng() * 3)];
  }

  const allowed = (k) => {
    if (k < 0 || k >= KINDS) return false;
    if (c.chinitsu) return !isHonor(k) && suitOf(k) === suit;
    if (c.honitsu) return isHonor(k) || suitOf(k) === suit;
    if (c.tanyao) return !isHonor(k) && rankOf(k) >= 2 && rankOf(k) <= 8;
    if (c.runsOnly && DRAGONS.includes(k)) return false; // 平和に三元牌は置かない
    return true;
  };
  const loRank = c.tanyao ? 2 : 1, hiRank = c.tanyao ? 8 : 9;
  const runOk = (k) => { // k = 順子の開始 kind
    if (k < 0 || isHonor(k)) return false;
    const r = rankOf(k);
    return r >= loRank && r + 2 <= hiRank && allowed(k) && allowed(k + 1) && allowed(k + 2);
  };

  // pool = 配牌のうち制約に合う牌。合わない牌は最初から「切る」。
  const pool = new Array(KINDS).fill(0);
  const used = new Array(KINDS).fill(0); // 完成手に採用した枚数（物理4枚ガード）
  const discards = [];
  for (const k of seed) {
    if (allowed(k) && pool[k] < 4) pool[k] += 1; else discards.push(k);
  }

  const sets = [];   // 面子 [a,b,c]
  let pair = null;   // 雀頭 kind
  const adds = [];   // 補充（ツモってきた）牌＝和了牌候補
  const canRun = !c.tripletsOnly;
  const canTriplet = !c.runsOnly;

  // spec の牌を pool から可能な限り使い、足りない分を補充として採用。物理4枚超は不成立。
  const tryPush = (spec) => {
    if (sets.length >= 4) return false;
    const byKind = {};
    for (const k of spec) byKind[k] = (byKind[k] || 0) + 1;
    for (const ks of Object.keys(byKind)) { if (used[+ks] + byKind[ks] > 4) return false; }
    for (const k of spec) {
      if (pool[k] > 0) pool[k] -= 1; else adds.push(k);
      used[k] += 1;
    }
    sets.push(spec.slice());
    return true;
  };

  const randomAllowedKind = () => {
    for (let i = 0; i < 40; i++) {
      let k;
      if (suit != null) {
        k = c.honitsu && rng() < 0.2 ? 27 + Math.floor(rng() * 7) : SUIT_BASE[suit] + Math.floor(rng() * 9);
      } else if (rng() < 0.8) {
        k = Math.floor(rng() * 27);
      } else {
        k = 27 + Math.floor(rng() * 7);
      }
      if (allowed(k)) return k;
    }
    return SUIT_BASE[suit || "m"] + 4; // 保険（5の牌）
  };

  // A. 大三元は三元牌の刻子3つを最優先で確定（役名＝形の約束）。
  if (c.daisangen) for (const d of DRAGONS) tryPush([d, d, d]);
  // B. 配牌の完成刻子。
  if (canTriplet) {
    for (let k = 0; k < KINDS && sets.length < 4; k++) {
      while (pool[k] >= 3 && tryPush([k, k, k])) { if (sets.length >= 4) break; }
    }
  }
  // C. 配牌の完成順子。
  if (canRun) {
    for (let k = 0; k < 27 && sets.length < 4; k++) {
      while (runOk(k) && pool[k] > 0 && pool[k + 1] > 0 && pool[k + 2] > 0 && tryPush([k, k + 1, k + 2])) {
        if (sets.length >= 4) break;
      }
    }
  }
  // D. 雀頭は配牌の対子から。
  for (let k = 0; k < KINDS && pair == null; k++) {
    if (pool[k] >= 2 && used[k] + 2 <= 4) { pair = k; pool[k] -= 2; used[k] += 2; }
  }
  // E1. 残った対子は刻子へ補完（対々和・四暗刻の主経路）。
  if (canTriplet) {
    for (let k = 0; k < KINDS && sets.length < 4; k++) { if (pool[k] >= 2) tryPush([k, k, k]); }
  }
  // E2. 塔子（両面/嵌張）は順子へ補完。
  if (canRun) {
    for (let k = 0; k < 27 && sets.length < 4; k++) {
      if (pool[k] <= 0) continue;
      if (pool[k + 1] > 0 && runOk(k)) { tryPush([k, k + 1, k + 2]); continue; }
      if (pool[k + 2] > 0 && runOk(k)) tryPush([k, k + 1, k + 2]);
    }
  }
  // E3. 孤立牌を核に面子化（配牌の面影を最後まで拾う）。
  for (let k = 0; k < KINDS && sets.length < 4; k++) {
    if (pool[k] <= 0) continue;
    if (canRun && !isHonor(k)) {
      for (const s of [k - 1, k, k - 2]) { if (runOk(s) && tryPush([s, s + 1, s + 2])) break; }
    } else if (canTriplet) {
      tryPush([k, k, k]);
    }
  }
  // F. 雀頭がまだ無ければ残り牌 or 新規から。
  if (pair == null) {
    let pk = -1;
    for (let k = 0; k < KINDS; k++) { if (pool[k] > 0 && used[k] + 2 <= 4) { pk = k; break; } }
    if (pk >= 0) { pool[pk] -= 1; used[pk] += 2; adds.push(pk); pair = pk; }
    else {
      for (let i = 0; i < 60 && pair == null; i++) {
        const k = randomAllowedKind();
        if (used[k] + 2 <= 4) { used[k] += 2; adds.push(k, k); pair = k; }
      }
    }
  }
  // G. 残り面子は新規に作る（順子優先・対々系は刻子）。
  for (let guard = 0; sets.length < 4 && guard < 200; guard++) {
    if (canRun && (!canTriplet || rng() < 0.7)) {
      const k = randomAllowedKind();
      const starts = [k - 2, k - 1, k].filter((s) => runOk(s));
      if (starts.length) {
        const s = starts[Math.floor(rng() * starts.length)];
        if (tryPush([s, s + 1, s + 2])) continue;
      }
    }
    if (canTriplet) {
      const k = randomAllowedKind();
      if (tryPush([k, k, k])) continue;
    }
  }
  // 保険: それでも埋まらなければ空きのある kind を総当たり（実質到達しない）。
  for (let k = 0; k < KINDS && sets.length < 4; k++) {
    if (allowed(k) && used[k] + 3 <= 4 && canTriplet) tryPush([k, k, k]);
    else if (runOk(k)) tryPush([k, k + 1, k + 2]);
  }

  // 使い残しの配牌は「切った牌」へ。
  for (let k = 0; k < KINDS; k++) { for (let i = 0; i < pool[k]; i++) discards.push(k); }

  // 和了牌＝補充牌から1枚（配牌13枚<14枚なので必ずある。念のため雀頭フォールバック）。
  const all = [...sets.flat(), pair, pair];
  const winKind = adds.length ? adds[Math.floor(rng() * adds.length)] : pair;
  const tiles = all.slice();
  tiles.splice(tiles.indexOf(winKind), 1);
  tiles.sort((a, b) => a - b);
  return { tiles, winKind, discards };
}
