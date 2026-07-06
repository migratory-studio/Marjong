// アガリ型コンポーザ（agariComposer.js）の回帰テスト（DOM不要）。
// 「常に正しい和了形」「役名の制約に従う」「配牌の面影を残す」「決定論」を確認する。
import { composeAgari } from "../src/autobattle/agariComposer.js";
import { isAgari } from "../src/core/rules/winCheck.js";
import { makeRng } from "../src/autobattle/autoBattle.js";
import { KINDS, suitOf, rankOf, isHonor } from "../src/core/tiles.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };

// フレーバー配牌の再現（assets.js の flavorTileKind と同比率。DOM 依存を避けてローカル定義）。
function randomSeedHand(rng) {
  const counts = {};
  const hand = [];
  while (hand.length < 13) {
    const k = rng() < 0.78 ? Math.floor(rng() * 3) * 9 + Math.floor(rng() * 9) : 27 + Math.floor(rng() * 7);
    if ((counts[k] || 0) >= 4) continue;
    counts[k] = (counts[k] || 0) + 1;
    hand.push(k);
  }
  return hand.sort((a, b) => a - b);
}

const countsOf = (kinds) => {
  const c = new Array(KINDS).fill(0);
  for (const k of kinds) c[k] += 1;
  return c;
};

// HAN_TABLE に実在する役名（フレーバー）を一通り。
const YAKUS = [
  "立直", "平和ドラ", "立直ツモ", "タンヤオドラ1", "タンヤオ三色", "ドラ3",
  "混一色ドラ", "対々和", "満貫", "跳満",
  "清一色ドラ2", "リーチツモ対々ドラ2", "清一色リーチツモドラ4",
  "四暗刻", "大三元", "国士無双",
];

// --- 全役×多数シードで: 14枚・kind範囲・物理4枚制限・和了形（isAgari）・配牌整合 ---
{
  let all14 = true, allRange = true, allPhys = true, allWin = true, allSeedUse = true;
  for (const yaku of YAKUS) {
    for (let i = 0; i < 120; i++) {
      const rng = makeRng(`ac-${yaku}-${i}`);
      const seed = randomSeedHand(rng);
      const { tiles, winKind, discards } = composeAgari({ seedKinds: seed, yaku, rng });
      const hand14 = [...tiles, winKind];
      if (hand14.length !== 14) all14 = false;
      if (hand14.some((k) => !(k >= 0 && k < KINDS))) allRange = false;
      const hc = countsOf(hand14);
      if (hc.some((n) => n > 4)) allPhys = false;
      if (!isAgari(hc, 0)) allWin = false;
      // 配牌13枚 = 完成手で使った牌 + discards（多重集合として整合）。
      const usedFromSeed = countsOf(seed);
      for (const k of discards) usedFromSeed[k] -= 1;
      if (usedFromSeed.some((n) => n < 0)) allSeedUse = false;
      for (let k = 0; k < KINDS; k++) { if (usedFromSeed[k] > hc[k]) allSeedUse = false; }
    }
  }
  ok("常に14枚（13枚＋和了牌）", all14);
  ok("kind が 0..33 の範囲", allRange);
  ok("同種牌は物理上限4枚まで", allPhys);
  ok("常に正しい和了形（isAgari）", allWin);
  ok("配牌の使用/切り分けが多重集合として整合", allSeedUse);
}

// --- 役名の制約 ---
{
  const rng0 = makeRng("ac-cons");
  let chin = true, hon = true, tan = true, toi = true, dsg = true, koku = true;
  for (let i = 0; i < 200; i++) {
    const seed = randomSeedHand(rng0);
    {
      const { tiles, winKind } = composeAgari({ seedKinds: seed, yaku: "清一色ドラ2", rng: makeRng(`c-${i}`) });
      const h = [...tiles, winKind];
      const s = suitOf(h[0]);
      if (h.some((k) => isHonor(k) || suitOf(k) !== s)) chin = false;
    }
    {
      const { tiles, winKind } = composeAgari({ seedKinds: seed, yaku: "混一色ドラ", rng: makeRng(`h-${i}`) });
      const nums = [...tiles, winKind].filter((k) => !isHonor(k));
      if (nums.length && nums.some((k) => suitOf(k) !== suitOf(nums[0]))) hon = false;
    }
    {
      const { tiles, winKind } = composeAgari({ seedKinds: seed, yaku: "タンヤオドラ1", rng: makeRng(`t-${i}`) });
      if ([...tiles, winKind].some((k) => isHonor(k) || rankOf(k) < 2 || rankOf(k) > 8)) tan = false;
    }
    {
      const { tiles, winKind } = composeAgari({ seedKinds: seed, yaku: "対々和", rng: makeRng(`o-${i}`) });
      const nz = countsOf([...tiles, winKind]).filter((n) => n > 0).sort();
      if (nz.join(",") !== "2,3,3,3,3") toi = false;
    }
    {
      const { tiles, winKind } = composeAgari({ seedKinds: seed, yaku: "大三元", rng: makeRng(`d-${i}`) });
      const hc = countsOf([...tiles, winKind]);
      if (hc[31] !== 3 || hc[32] !== 3 || hc[33] !== 3) dsg = false;
    }
    {
      const { tiles, winKind } = composeAgari({ seedKinds: seed, yaku: "国士無双", rng: makeRng(`k-${i}`) });
      const hc = countsOf([...tiles, winKind]);
      const orphans = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
      if (!orphans.every((k) => hc[k] >= 1) || hc.reduce((a, b) => a + b, 0) !== 14) koku = false;
      for (let k = 0; k < KINDS; k++) { if (hc[k] > 0 && !orphans.includes(k)) koku = false; }
    }
  }
  ok("清一色: 全牌が同一数牌スート", chin);
  ok("混一色: 数牌は単一スート", hon);
  ok("タンヤオ: 2〜8のみ", tan);
  ok("対々和: 刻子4＋雀頭", toi);
  ok("大三元: 三元牌の刻子3つ", dsg);
  ok("国士無双: ヤオ九13種＋雀頭", koku);
}

// --- 配牌の面影: ほぼ完成した配牌はそのまま使い切る ---
{
  // 3順子＋刻子＋孤立字牌 → 孤立牌が雀頭になり、切る牌ゼロで仕上がるはず。
  const seed = [0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 27, 27, 31];
  const { tiles, winKind, discards } = composeAgari({ seedKinds: seed, yaku: "立直", rng: makeRng("ac-keep") });
  const hc = countsOf([...tiles, winKind]);
  ok("ほぼ完成形の配牌は切る牌ゼロ", discards.length === 0);
  ok("配牌の順子/刻子がそのまま完成手に残る",
    hc[0] >= 1 && hc[1] >= 1 && hc[2] >= 1 && hc[27] === 3 && hc[31] === 2);
  ok("和了牌は補充した牌（この形では雀頭の相方）", winKind === 31);
}

// --- 相手の和了（seed なし）でも常に正しい和了形 ---
{
  let allWin = true;
  for (const yaku of YAKUS) {
    for (let i = 0; i < 60; i++) {
      const { tiles, winKind } = composeAgari({ seedKinds: null, yaku, rng: makeRng(`ac-null-${yaku}-${i}`) });
      if (!isAgari(countsOf([...tiles, winKind]), 0)) allWin = false;
    }
  }
  ok("seed なし（相手の和了）でも常に正しい和了形", allWin);
}

// --- 決定論: 同じ rng シードなら同じ合成結果 ---
{
  const seed = randomSeedHand(makeRng("ac-det-seed"));
  const a = composeAgari({ seedKinds: seed, yaku: "混一色ドラ", rng: makeRng("ac-det") });
  const b = composeAgari({ seedKinds: seed, yaku: "混一色ドラ", rng: makeRng("ac-det") });
  ok("同シードで合成結果が一致", JSON.stringify(a) === JSON.stringify(b));
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
