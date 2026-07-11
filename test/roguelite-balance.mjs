// ローグライト・バランス校正ハーネス — バフ数値／レア度確率／階層難度カーブの実測。
//   node test/roguelite-balance.mjs            … 計測レポート（人間が読む）
//   node test/roguelite-balance.mjs --assert   … 校正後の目標帯を回帰アサート
//
// 実麻雀エンジンは回さず、leagueAutoSim と同じ強度モデル（param平均→局取り重み＋打点分布）で
// 1局ずつ和了者と点移動を抽選し、run.js の rogueliteDamageDeltas で点棒→HP に写す（本番と同経路）。
// これで「階層が深いほど敵HPと強度が上がる中、味方がHPを保って踏破し続けられるか」を測る。
//
// 2026-07 追撃仕様（2bc1a9f: 1戦=1ゲーム・1局目必須＋局終わりの追撃モーダルで最大 baseHands 局）に追随：
// シムは「着卓2人が健全(>0.55)なら続行」でモーダル選択を近似し、追撃の実入り（光貨 pursueMul／
// ドラフト高レアバイアス）も main.js と同経路で乗せる。経緯と実測の全表は
// docs/roguelite-balance-recalibration-2026-07.md（深層マラソン問題のディレクター提案も同doc）。

import { makeRng, paramsFromLv, PARAM_KEYS } from "../src/autobattle/autoBattle.js";
import { LEAGUE_SIM } from "../src/autobattle/leagueAutoSim.js";
import {
  newRun, enemyUnitForFloor, seatedAllies, floorEnemyHp, healParty, rollHangover,
  rogueliteDamageDeltas, rollDraft, carrySlotsFor, allyScaledHp, RL_TUNE, floorDamageMul, runWiped,
  growMaxHp, FLOOR_HP_GROWTH,
} from "../src/roguelite/run.js";
import { applyCard, applyEffect, BUFF_TUNE, clusterDealMul } from "../src/roguelite/cardEffects.js";
import { clusterOf, CLUSTER_SYNERGY } from "../src/data/rogueliteCardMaster.js";
if (process.env.HPCAP) BUFF_TUNE.hpMulCap = Number(process.env.HPCAP); // 累積HP倍率の上限を掃引
import { shopStock, buyShopItem, shrineOffers } from "../src/roguelite/run.js";
import { ROGUELITE_CARD_MASTER, RARITY_WEIGHTS, drawCards, cardById } from "../src/data/rogueliteCardMaster.js";
import { floorTypeById, drawFloorChoices, coinsForClear, forgeCost } from "../src/data/rogueliteFloorMaster.js";
import { chapterById } from "../src/data/rogueliteChapterMaster.js";

const ASSERT = process.argv.includes("--assert");

// ---- 章別難度の計測（CHAPTER=章id で tuning/bossHpMul を run に適用。未指定=グローバル既定＝従来挙動） ----
//   例: CHAPTER=memory_two CLEARFLOOR=40 node test/roguelite-balance.mjs --clearrate
// あわせて宝珠ショップの恒久バフ持ちを ORB=deal:1,take:2,hp:1,coins:1 / CLUSTERCAP=1|2 で模せる
// （main.js applyShopBuffsToRun と同式。未指定=バフ無し・流派2段＝従来のまま）。
const CHAP = process.env.CHAPTER ? chapterById(process.env.CHAPTER) : null;
if (process.env.CHAPTER && !CHAP) { console.error(`CHAPTER=${process.env.CHAPTER} は章マスタに無い`); process.exit(1); }
const ORB = {}; // {deal,take,hp,coins} 各Lv
for (const kv of (process.env.ORB || "").split(",").filter(Boolean)) { const [k, v] = kv.split(":"); ORB[k.trim()] = Number(v) || 0; }
const CLUSTER_CAP = Number(process.env.CLUSTERCAP || 2);

// ---- 校正ノブ（run.js の RL_TUNE を環境変数で上書きして掃引）。深度倍率/上限は本体側で適用される。 ----
if (process.env.REGEN) RL_TUNE.regenFrac = Number(process.env.REGEN);
if (process.env.DSTART) RL_TUNE.floorDmgStart = Number(process.env.DSTART);
if (process.env.DSLOPE) RL_TUNE.floorDmgSlope = Number(process.env.DSLOPE);
if (process.env.DKNEE) RL_TUNE.floorDmgKnee = Number(process.env.DKNEE);
if (process.env.DACCEL) RL_TUNE.floorDmgAccel = Number(process.env.DACCEL);
if (process.env.DEALCAP) RL_TUNE.dealCap = Number(process.env.DEALCAP);
if (process.env.TAKEFLOOR) RL_TUNE.takeFloor = Number(process.env.TAKEFLOOR);
if (process.env.FRIENDLY) RL_TUNE.friendlyMul = Number(process.env.FRIENDLY);
if (process.env.DEALSLOPE) RL_TUNE.dealDepthSlope = Number(process.env.DEALSLOPE);
if (process.env.CAPBASE) RL_TUNE.lethalCapBase = Number(process.env.CAPBASE);
if (process.env.CAPFADE) RL_TUNE.lethalCapFadeStart = Number(process.env.CAPFADE);
if (process.env.CAPSLOPE) RL_TUNE.lethalCapFadeSlope = Number(process.env.CAPSLOPE);
if (process.env.BOSSBASE) RL_TUNE.bossBaseHpMul = Number(process.env.BOSSBASE); // ボスHP基礎倍率の掃引（2026-07-11 必勝制）
const TUNE = {
  regenFrac: RL_TUNE.regenFrac,
  enemyLvSlope: Number(process.env.LVSLOPE ?? 0.6), // 敵Lvの階層あたり傾き（敵強度モデル＝シム専用）
};
const localEnemyLv = (floor) => Math.max(1, Math.min(10, Math.round(1 + (floor - 1) * TUNE.enemyLvSlope)));
// 染め手の発火率（シム近似）。シムは手牌を持たないため、染めビルドの味方和了がどれだけ染め手かを定数で表す。
// rootou/染め軸は么九・一色に寄るため中程度に。env FLUSHRATE で掃引可。実機は r.result.yaku で厳密判定。
const FLUSH_SIM_RATE = Number(process.env.FLUSHRATE ?? 0.5);
const FT = { normal: floorTypeById("normal"), elite: floorTypeById("elite"), boss: floorTypeById("boss") };

// ルート方針：その階のフロア種別を決める（boss は呼び出し側で強制）。
//   none   … バフを取らない素の踏破力を測る（常に通常戦闘）。
//   greedy … HP低下時は回復フロアを取り、平時は宝箱/強敵でリターンを狙う。
function routePick(rng, run, policy) {
  // ボス直前（floor%10===9）は休息/ショップを必ず1枠（本体と同じ＝整える余地を保証）。
  const force = run.floor % 10 === 9 ? [rng() < 0.5 ? "rest" : "shop"] : [];
  if (policy === "none") {
    // 無策でもボス前の回復だけは取る（瀕死ボス突入の運ゲーを緩和＝本体の挙動に寄せる）。
    if (force.length && Math.min(...run.party.map((m) => m.hp / m.hpMax)) < 0.6) return floorTypeById("rest");
    return FT.normal;
  }
  const choices = drawFloorChoices(rng, { count: 3, force });
  const minFrac = Math.min(...run.party.map((m) => m.hp / m.hpMax));
  if (minFrac < 0.45 || run.floor % 10 === 9) { const heal = choices.find((c) => c.kind === "rest" || c.kind === "banquet" || c.kind === "shop"); if (heal) return heal; }
  const pref = ["forge", "shop", "treasure", "elite", "event", "shrine", "gamble", "normal", "rest", "banquet"];
  for (const k of pref) { const f = choices.find((c) => c.id === k || c.kind === k); if (f) return f; }
  return choices[0];
}

// 特殊フロアの効果をシムへ反映（戦闘以外）。treasure/event/shop/shrine は greedy がリターンを得る近似。
function resolveSpecial(run, floorType, rng, policy) {
  const pick = PICKERS[policy] || PICKERS.none;
  const active = isActive(policy); // none 以外（greedy / 流派特化）はリターンを取りに行く
  switch (floorType.kind) {
    case "rest": healParty(run, floorType.healFrac ?? 0.3); break;
    case "banquet": healParty(run, 1); rollHangover(run, floorType.hangoverChance ?? 0.35, rng); break;
    case "treasure": if (active) { const c = pick(rollDraft(run, { hpRatio: 1 })); if (c) applyCard(run, c); } break;
    case "event": { healParty(run, 0.2); if (active) { const c = cardById("deal-up-common"); if (c) applyCard(run, c); } break; } // 近似：小回復＋小バフ
    case "shop": if (active) { for (const it of shopStock(run, rng)) { if ((run.coins || 0) >= it.price) buyShopItem(run, it); } } break; // 買えるだけ買う
    case "forge": if (active) { let c = forgeCost(run.skillLevel); while ((run.coins || 0) >= c && run.skillLevel < 10) { run.coins -= c; run.skillLevel += 1; c = forgeCost(run.skillLevel); } } break; // 鍛冶：払える限りLvを上げる
    case "shrine": if (active && Math.min(...run.party.map((m) => m.hp / m.hpMax)) > 0.5) { const o = shrineOffers(run)[0]; for (const m of run.party) m.hp = Math.max(1, m.hp - Math.round(m.hpMax * (o.outcome.hurtFrac || 0))); if (o.outcome.effect) applyEffect(run, o.outcome.effect); } break;
    default: break;
  }
}

// ---- 強度モデル ----
const avg = (p) => PARAM_KEYS.reduce((s, k) => s + (p[k] || 0), 0) / PARAM_KEYS.length;
// 付与能力カードは「実効プレイ強度」を底上げする近似（+strength）。打点mod(dealMul/takeReduce)は別経路。
const GRANT_STRENGTH = 8;
function allyStrengthOf(run, member) {
  let s = member.baseStrength;
  s += run.mods.grantedAbilityIds.length * GRANT_STRENGTH;
  s += Math.max(0, (run.skillLevel || 1) - 1) * 4; // スキルLvで能力が強化＝実効プレイ強度UPの近似
  return s;
}
function enemyStrengthOf(floor, seed, lvSlope = null) {
  // 章tuningの enemyLvSlope があればそれで敵Lvを引く（未指定=従来 TUNE.enemyLvSlope）。
  const lv = lvSlope != null ? Math.max(1, Math.min(10, Math.round(1 + (floor - 1) * lvSlope))) : localEnemyLv(floor);
  return avg(paramsFromLv(lv, seed));
}

// 追撃モーダルの続行判断（近似）：局終わりに着卓2人のHPが健全なら「続ける」＝実入り上乗せを狙う。
// 実機は任意選択（1局目必須・上限=baseHands）。閾値は旧pursueゲートと同じ0.55。PURSUEGATE env で掃引可。
const PURSUE_HP_GATE = Number(process.env.PURSUEGATE ?? 0.55);
// 追撃でドラフトの高レアバイアス(ko扱い +0.35)を得る本番挙動（main.js onRogueliteBattleEnd）。
// PURSUEDRAFT=0 で切って「実撃破のみバイアス」の what-if を掃引できる（ゲーム側レバー検討用）。
const PURSUE_DRAFT_BIAS = process.env.PURSUEDRAFT !== "0";
// 戦後HPの hpMax 超過持ち出し（オーバーヒール）。本番は書き戻しをクランプしない（main.js 2786）＝既定1。
// OVERHEAL=0 で「器を超えた点棒は持ち出せない」レバーの what-if を掃引できる（実測：効果なし＝regenが実質クランプ）。
const OVERHEAL_CARRY = process.env.OVERHEAL !== "0";
// 【未実装機構の what-if】深層の敵和了に「最大HP比の下限ダメージ」を敷く＝lethalCap（上限）の鏡像。
// 味方HPがカード成長で敵打点を追い越すと理論上ランが終わらなくなる構造への対案。LETHALFLOOR=開始階,傾き
// （例 "60,0.005"＝F60から1階ごとに+0.5%、上限50%）。未指定＝現行仕様どおり（off）。
const LF = (process.env.LETHALFLOOR || "").split(",").map(Number);
const lethalFloorFrac = (floor) => (LF.length === 2 && Number.isFinite(LF[0]))
  ? Math.min(0.5, Math.max(0, (floor - LF[0]) * LF[1])) : 0;

// ---- 1戦の抽選（leagueAutoSim 流の局取り×打点 → HP写像） ----
function simBattle(run, rng, floorType) {
  const allies = seatedAllies(run);
  const enemy = enemyUnitForFloor(run, floorType, "");
  const roles = ["ally", "enemy", "ally", "enemy"];
  const hp = [allies[0].hp, enemy.members[0].stats.startingPoints, allies[1].hp, enemy.members[1].stats.startingPoints];
  const hpMax = [allies[0].hpMax, hp[1], allies[1].hpMax, hp[3]];
  const lvBump = floorType?.enemy === "boss" ? 2 : floorType?.enemy === "named" ? 1 : 0;
  const aStr = (m) => (m.hungover ? m.baseStrength : allyStrengthOf(run, m)); // 二日酔いは付与能力ぶんの底上げ無し
  const strength = [
    aStr(allies[0]),
    enemyStrengthOf(run.floor, `${run.seed}:e0:${run.floor}`, run.tuning?.enemyLvSlope) + lvBump * 6,
    aStr(allies[1]),
    enemyStrengthOf(run.floor, `${run.seed}:e1:${run.floor}`, run.tuning?.enemyLvSlope) + lvBump * 6,
  ];
  const weights = strength.map((s) => LEAGUE_SIM.weightBase + Math.max(0, s) * LEAGUE_SIM.weightPerStrength);
  const pick = (excl = -1) => {
    let tot = 0;
    for (let i = 0; i < 4; i++) if (i !== excl) tot += weights[i];
    let r = rng() * tot;
    for (let i = 0; i < 4; i++) { if (i === excl) continue; if ((r -= weights[i]) < 0) return i; }
    return excl === 0 ? 1 : 0;
  };
  const allyDownNow = () => hp[0] <= 0 && hp[2] <= 0;
  const enemyDownNow = () => hp[1] <= 0 && hp[3] <= 0;
  // 1戦＝1ゲーム（2026-06-30 追撃仕様）：1局目は必ず打ち、以降は「局終わり」に続行可否を選べる
  // （同卓・HP継続・上限=baseHands）。シムは PURSUE_HP_GATE でその選択を近似する。
  const hands = floorType?.baseHands || 1;
  // ボスの卓（2026-07-11 必勝制）：勝ち抜くまで終わらない。局終わりに合計HPで上回っていれば
  // 「制圧」で締める（＝実機の勝ち抜けボタンを押す近似）。上回れないまま全滅すればラン終了。
  // 撤退（全滅と同じ）はシムでは選ばない＝always-continue（限界まで押す）の従来思想どおり。
  const bossRule = floorType?.enemy === "boss";
  const aheadNow = () => (Math.max(0, hp[0]) + Math.max(0, hp[2])) > (Math.max(0, hp[1]) + Math.max(0, hp[3]));
  let handsPlayed = 0;
  for (let h = 0; h < hands; h++) {
    if (allyDownNow() || enemyDownNow()) break; // 決着（全滅 or 撃破）で即終了
    if (bossRule && h > 0 && aheadNow()) break; // ボス：上回った局終わりに勝ち抜け（banked win）
    // 追撃モーダル：2局目以降は着卓2人が健全なときだけ続行（消耗していたら1局で締める）。ボスは対象外（引けない）。
    if (!bossRule && h > 0 && Math.min(hp[0] / hpMax[0], hp[2] / hpMax[2]) <= PURSUE_HP_GATE) break;
    handsPlayed += 1;
    if (rng() < LEAGUE_SIM.drawRate) continue;
    const w = pick();
    const tsumo = rng() < LEAGUE_SIM.tsumoRate;
    const scale = 1 + Math.max(-0.3, (strength[w] - 30) / 160);
    let value = Math.round(((LEAGUE_SIM.valueMin + Math.pow(rng(), 1.6) * (LEAGUE_SIM.valueMax - LEAGUE_SIM.valueMin)) * scale) / 100) * 100;
    const deltas = [0, 0, 0, 0];
    if (tsumo) {
      const share = Math.max(100, Math.round(value / 3 / 100) * 100);
      for (let i = 0; i < 4; i++) if (i !== w) deltas[i] = -share;
      deltas[w] = share * 3;
    } else {
      const v = pick(w);
      deltas[v] = -value; deltas[w] = value;
    }
    // 流派deal シナジー（提案A）：味方和了のとき、発火条件に応じた与ダメ倍率を本番と同経路(battleMods.dealMul)で乗せる。
    //   速攻＝ツモ(honest)／打点＝満貫以上(value>=8000・honest)／染め＝染め手はシムが手牌を持たないため確率近似(FLUSH_SIM_RATE)。
    //   守備のtakeCapは rogueliteDamageDeltas 内で自動適用（battleMods不要）。
    let battleMods;
    if (roles[w] === "ally") {
      const ctx = {
        tsumoWin: tsumo,
        bigWin: Math.abs(value) >= 8000,
        flushWin: (run.mods.clusterCount?.flush > 0) && (rng() < FLUSH_SIM_RATE),
        anyWin: true, // 博打＝味方和了なら常に発火（takeRaise の被ダメ上限上げは rogueliteDamageDeltas 内で自動）
      };
      const cm = clusterDealMul(run, ctx);
      if (cm > 1.0001) battleMods = { dealMul: cm };
    }
    const hpd = rogueliteDamageDeltas(run, { deltas, roles, winnerSeat: w, hpMax, battleMods }); // 深度倍率/一撃死上限/流派シナジーを本体側で適用
    // what-if：深層の下限ダメージ（LETHALFLOOR 指定時のみ）。敵和了で払う味方席に最大HP比の最低被ダメを敷く。
    const lfFrac = roles[w] === "enemy" ? lethalFloorFrac(run.floor) : 0;
    if (lfFrac > 0) for (let i = 0; i < 4; i++) if (roles[i] === "ally" && hpd[i] < 0) hpd[i] = Math.min(hpd[i], -Math.round(hpMax[i] * lfFrac));
    for (let i = 0; i < 4; i++) hp[i] = Math.max(0, hp[i] + hpd[i]);
  }
  // 結果反映：味方HPを run へ戻す（回復しない＝消耗が累積する）。本番同様、既定では hpMax 超過も持ち出す。
  allies[0].hp = OVERHEAL_CARRY ? hp[0] : Math.min(hpMax[0], hp[0]);
  if (allies[1] !== allies[0]) allies[1].hp = OVERHEAL_CARRY ? hp[2] : Math.min(hpMax[2], hp[2]);
  const allyDown = allyDownNow();
  const enemyDown = enemyDownNow();
  const allyHp = Math.max(0, hp[0]) + Math.max(0, hp[2]);
  const enemyHp = Math.max(0, hp[1]) + Math.max(0, hp[3]);
  const allyFull = hpMax[0] + hpMax[2];
  // 踏破＝通常戦は「全滅しなければ次へ」（生存レース）。ボス（必勝制）は「上回り or 撃破」のみ踏破＝
  // 上回れないまま息切れ（99局到達）した場合も敗北扱い（実機なら撤退＝全滅と同じ）。
  const cleared = bossRule ? (!allyDown && (enemyDown || allyHp > enemyHp)) : !allyDown;
  // outHpRace＝合計HPで競り負け。本番 onRogueliteBattleEnd の全員ペナルティ判定に対応（ボスは対象外）。
  // pursued＝1局で締めず追撃した（実入り上乗せ：光貨 pursueMul＋ドラフト高レアバイアス）。
  return { cleared, allyDown, enemyDown, koAny: hp[1] <= 0 || hp[3] <= 0, hpRatio: allyFull ? allyHp / allyFull : 0, outHpRace: bossRule ? false : allyHp < enemyHp, pursued: handsPlayed > 1 };
}

// ---- ドラフト方針（greedy / none） ----
const PICKERS = {
  none: () => null,
  greedy: (cards) => {
    // dealMul最優先→takeReduce→heal→maxHp→grant→compound。攻めて押し切る素直なビルド。
    const rank = (c) => {
      const k = c.effect.kind;
      if (k === "dealMul") return 100 * c.effect.mul;
      if (k === "compound") return 80;
      if (k === "takeReduce") return 60 + c.effect.rate * 50;
      if (k === "maxHpUp") return 50 + c.effect.mul * 10;
      if (k === "grantAbility") return 45;
      if (k === "heal") return 30;
      return 10;
    };
    return [...cards].sort((a, b) => rank(b) - rank(a))[0] || null;
  },
  // 戦車：HP最大→防御→compound を最優先（「硬すぎて当分負けない」を再現＝HP上限の検証用）。
  tank: (cards) => {
    const rank = (c) => {
      const k = c.effect.kind;
      if (k === "maxHpUp") return 100 * c.effect.mul;
      if (k === "compound") return 90;
      if (k === "takeReduce") return 70 + c.effect.rate * 50;
      if (k === "heal") return 50;
      if (k === "dealMul") return 30 * c.effect.mul;
      return 10;
    };
    return [...cards].sort((a, b) => rank(b) - rank(a))[0] || null;
  },
};

// 流派特化picker（提案A・均衡検証用）：自流派のカードを最優先しつつ、回復/HPで最低限の生存も確保。
// 「どの流派に寄せても近い深度に届く＝一意最適解なし(P1)」を測るため、各流派に1つ作る。
function clusterPicker(cluster) {
  return (cards) => {
    if (!cards || !cards.length) return null;
    const rank = (c) => {
      let s = 0;
      if (clusterOf(c) === cluster) s += 100;          // 自流派を強く優先（しきい値到達を狙う）
      const k = c.effect.kind;
      if (k === "heal") s += 9;                          // 生存の最低限
      if (k === "maxHpAdd" || k === "maxHpUp") s += 7;
      if (k === "compound") s += 6;
      if (k === "dealMul") s += 5;
      if (k === "takeReduce") s += 4;
      if (k === "grantAbility") s += 3;
      return s;
    };
    return [...cards].sort((a, b) => rank(b) - rank(a))[0] || null;
  };
}
for (const cl of ["flush", "guard", "tempo", "value", "gamble"]) PICKERS[cl] = clusterPicker(cl);

// 「素のドラフトを取りに行く方針か（none以外）」。特殊フロアの取得/購入をこのゲートで判定。
const isActive = (policy) => policy !== "none";

// 戦いの質でスケールした回復（本番 onRogueliteBattleEnd と同じ式）。
const regenAll = (run, res = {}) => {
  const perf = Math.max(0.25, Math.min(1.3, 0.25 + (res.hpRatio ?? 0.5) * 0.85 + (res.koAny ? 0.25 : 0)));
  for (const m of run.party) if (m.hp > 0) m.hp = Math.min(m.hpMax, m.hp + Math.round(m.hpMax * ((run.tuning?.regenFrac ?? TUNE.regenFrac)) * perf)); // トんだメンバーは回復しない（章tuningのregenFracを優先）
};

// 合計HPで競り負けたら、その卓で打っていた2人（着卓メンバー）だけ最大HPのこの割合だけダメージ
// （撃墜あり・救済なし／控えは点棒勝負に絡んでいない＝対象外）＝本番 onRogueliteBattleEnd と同じ。
// 全滅判定の前に効かせる（この一撃で生存1人以下になればラン終了）。
// 調整レバー：PENALTY=0.15 node test/roguelite-balance.mjs のように環境変数で差し替え可（既定=本体と同じ0.20）。
const HP_LOSS_PENALTY_FRAC = Number(process.env.PENALTY ?? 0.20);
const applyHpRacePenalty = (run, res = {}, seated = null) => {
  if (!res.outHpRace) return;
  const targets = seated ? [...new Set(seated)].filter((m) => m && m.hp > 0) : run.party.filter((m) => m.hp > 0);
  for (const m of targets) m.hp = Math.max(0, m.hp - Math.round(m.hpMax * HP_LOSS_PENALTY_FRAC));
};

// 1フロアを処理。戻り値 false=全滅（ラン終了）。floorWins に踏破した戦闘階を記録。
function stepFloor(run, rng, policy, floorWins = null) {
  const floorType = (run.floor % 10 === 0) ? FT.boss : routePick(rng, run, policy);
  const isBattle = floorType.kind === "battle" || floorType.kind === "gamble";
  if (!isBattle) { resolveSpecial(run, floorType, rng, policy); run.floor += 1; return true; }
  // 戦闘フロア（賭場も1局戦として処理）
  const res = simBattle(run, rng, floorType);
  if (floorWins && res.cleared) floorWins[run.floor] = (floorWins[run.floor] || 0) + 1;
  // 着卓した2人の二日酔いは消費
  const seated = seatedAllies(run); seated[0].hungover = false; if (seated[1] !== seated[0]) seated[1].hungover = false;
  applyHpRacePenalty(run, res, seated); // 合計HP敗北なら着卓2人に20%（全滅判定の前・ボスは outHpRace=false）
  if (runWiped(run)) return false; // ゲームオーバー＝生存1人以下（復活なし）
  // ボス必勝制（2026-07-11）：上回れないまま終わった＝撤退（全滅と同じ）＝ラン終了。
  if (floorType.enemy === "boss" && !res.cleared) return false;
  run.cleared += 1; regenAll(run, res);
  // 実入りは main.js onRogueliteBattleEnd と同経路：追撃で光貨 pursueMul・ドラフトは ko/追撃で高レアバイアス。
  run.coins = (run.coins || 0) + coinsForClear({ floor: run.floor, kind: floorType.enemy || "mob", ko: res.koAny, pursue: res.pursued }) * (floorType.kind === "gamble" ? 2 : 1);
  const pick = PICKERS[policy];
  const c = pick(rollDraft(run, { ko: res.koAny || (PURSUE_DRAFT_BIAS && res.pursued), hpRatio: res.hpRatio })); if (c) applyCard(run, c);
  run.floor += 1;
  return true;
}

function mkRun({ avatarHpMax, baseStrength, carry = [] }, seed) {
  // 3人パーティ（典型）。生存1人以下で終了＝1人は脱落しても続行できる粘り。
  const party = [
    { id: "you", char: { id: "you", abilities: [], stats: { startingPoints: avatarHpMax } }, avatarHpMax, baseStrength },
    { id: "pal", char: { id: "pal", abilities: [], stats: { startingPoints: avatarHpMax } }, avatarHpMax, baseStrength },
    { id: "pal2", char: { id: "pal2", abilities: [], stats: { startingPoints: avatarHpMax } }, avatarHpMax, baseStrength },
  ];
  // CHAPTER 指定時は章の tuning/bossHpMul を通す（本体 startRogueliteRun と同経路）。未指定=null＝グローバル既定。
  const run = newRun(party, seed, CHAP?.id || null, null, null, CHAP?.tuning || null, CHAP ? { bossHpMul: process.env.BOSSCH2 ? Number(process.env.BOSSCH2) : (CHAP.bossHpMul ?? null) } : null); // BOSSCH2=章ボス倍率の掃引
  run.clusterTierCap = CLUSTER_CAP; // 既定2＝流派2段目まで解放した「終盤(ショップ解禁後)」の均衡を検証（CLUSTERCAP=1で無購入を模す）。
  for (const m of run.party) m.baseStrength = baseStrength;
  for (const id of carry) { const c = cardById(id); if (c) applyCard(run, c); }
  // 宝珠ショップ恒久バフ（ORB env）。main.js applyShopBuffsToRun と同式。
  if (ORB.deal) run.mods.dealMul = (run.mods.dealMul || 1) * (1 + 0.04 * ORB.deal);
  if (ORB.take) run.mods.takeMul = (run.mods.takeMul || 1) * Math.max(0.1, 1 - 0.03 * ORB.take);
  if (ORB.coins) run.coins = (run.coins || 0) + 25 * ORB.coins;
  if (ORB.hp) { const mul = 1 + 0.03 * ORB.hp; for (const m of run.party) { m.hpMax = Math.round(m.hpMax * mul); m.baseHp = m.hpMax; m.hp = m.hpMax; } }
  return run;
}

// ---- 1ラン（always-continue＝撤退せず限界まで）。深度＝到達フロア(run.floor)。 ----
// TRACE=1 で10階ごとにパーティ状態（HP/hpMax/強度/スキルLv/主要mods）を標準出力（深層生存の主因調査用）。
function simRun(profile, seed) {
  const run = mkRun(profile, seed);
  const rng = makeRng(`${seed}:battle`);
  let guard = 0;
  while (guard++ < (Number(process.env.GUARD) || 200)) {
    const before = run.floor;
    if (process.env.TRACE && run.floor % 10 === 1) {
      const p = run.party.map((m) => `${Math.round(m.hp / 100)}/${Math.round(m.hpMax / 100)}`).join(" ");
      const s = allyStrengthOf(run, run.party[0]);
      console.log(`F${run.floor}\thp(百)=${p}\tstr=${s}\tskillLv=${run.skillLevel}\tdealMul=${(run.mods.dealMul || 1).toFixed(2)}\ttakeReduce=${(run.mods.takeReduce || 0).toFixed(2)}\ttakeCap=${run.mods.takeCap ?? "-"}\tgrants=${run.mods.grantedAbilityIds.length}\tdmgMul=${floorDamageMul(run.floor).toFixed(1)}\tlethal=${(Math.min(1, RL_TUNE.lethalCapBase + Math.max(0, run.floor - RL_TUNE.lethalCapFadeStart) * RL_TUNE.lethalCapFadeSlope)).toFixed(2)}`);
    }
    if (!stepFloor(run, rng, profile.picker || "none")) break;
    // 館の気脈：フロアを進むほど味方の最大HPも緩やかに底上げ（本番 growMaxHp と同経路）。
    // 既定は本番値 FLOOR_HP_GROWTH。GROWHP env を渡すとその値で掃引（本番ロジックを一時上書き）。
    if (run.floor > before) {
      if (process.env.GROWHP) {
        const g = Number(process.env.GROWHP);
        for (const m of run.party) if (m.hp > 0) { const add = Math.round((m.baseHp || m.hpMax) * g); m.hpMax += add; m.hp += add; }
      } else {
        growMaxHp(run);
      }
    }
  }
  return run.floor;
}

// 階層別クリア率（その階に到達した試行のうち踏破した割合）＝生存曲線。
function survivalCurve(profile, N = 3000) {
  const reached = {}; const won = {};
  for (let i = 0; i < N; i++) {
    const run = mkRun(profile, `sv-${profile.tag}-${i}`);
    const rng = makeRng(`sv-${profile.tag}-${i}:b`);
    let guard = 0;
    while (guard++ < 80) {
      const f = run.floor;
      reached[f] = (reached[f] || 0) + 1;
      if (!stepFloor(run, rng, profile.picker || "none", won)) break;
      if (run.floor === f) won[f] = won[f] || 0; // 特殊フロアは reached のみ（戦闘でないので won は floorWins 側）
    }
  }
  return { reached, won };
}

// ---- 章クリア率（指定フロアの 到達/踏破 率）。always-continue＝撤退せず限界まで押した1ランで、
//   その階に「届く」(depth≥F) ／「抜ける＝踏破」(depth>F⟺クリアして先へ) 割合。boss階(F%10==0)はboss難度。
//   node test/roguelite-balance.mjs --clearrate            … 既定 F30
//   CLEARFLOOR=20 CLEARN=6000 node ... --clearrate         … 階・試行数を指定
function clearRateReport() {
  const F = Number(process.env.CLEARFLOOR || 30);
  const N = Number(process.env.CLEARN || 5000);
  const sample = (profile) => {
    let reach = 0, clear = 0, sum = 0;
    for (let i = 0; i < N; i++) { const d = simRun({ ...profile }, `cr-${profile.tag}-${profile.picker}-${i}`); sum += d; if (d >= F) reach++; if (d > F) clear++; }
    return { reach: reach / N, clear: clear / N, mean: sum / N };
  };
  const pct = (x) => (x * 100).toFixed(1) + "%";
  console.log(`=== 第${F}階 到達/踏破率（always-continue・撤退せず限界まで押した1ラン・N=${N}） ===`);
  console.log(`弟子強度\t方針\t到達(≥F${F})\t踏破(クリアF${F})\t平均到達`);
  for (const t of TIERS) {
    for (const picker of ["none", "greedy"]) {
      const r = sample({ ...t, picker });
      console.log(`${t.label}\t${picker}\t${pct(r.reach)}\t${pct(r.clear)}\t${r.mean.toFixed(1)}`);
    }
  }
  // 中堅・各流派特化＝「1つの戦い方にコミットした現実的プレイ」の F踏破率（none と greedy の中間目安）。
  console.log(`\n--- 中堅・各流派特化の 第${F}階 踏破率（現実的な“ひと筋”プレイの目安） ---`);
  for (const cl of ["flush", "guard", "tempo", "value", "gamble"]) {
    const r = sample({ ...TIERS[1], picker: cl });
    console.log(`中堅・${cl}\t踏破 ${pct(r.clear)}（到達 ${pct(r.reach)}）`);
  }
}

const MC_N = Number(process.env.MCN || 2000); // 掃引高速化用：試行数を環境変数で絞れる
const FAST = process.argv.includes("--fast") || process.env.FAST; // 到達深度テーブルだけ出して終わる
function montecarlo(profile, N = MC_N) {
  const depths = [];
  for (let i = 0; i < N; i++) depths.push(simRun(profile, `mc-${profile.tag}-${i}`));
  depths.sort((a, b) => a - b);
  const q = (p) => depths[Math.min(depths.length - 1, Math.floor(p * depths.length))];
  const mean = depths.reduce((a, b) => a + b, 0) / depths.length;
  return { mean: +mean.toFixed(1), p10: q(0.1), median: q(0.5), p90: q(0.9), max: depths[depths.length - 1] };
}

// ---- レポート ----
const TIERS = [
  { tag: "weak", label: "弱・序盤弟子", avatarHpMax: 13000, baseStrength: 28 },
  { tag: "mid", label: "中堅弟子", avatarHpMax: 19000, baseStrength: 48 },
  { tag: "strong", label: "育成完了弟子", avatarHpMax: 25000, baseStrength: 70 },
];

function report() {
  console.log("=== ローグライト到達深度（always-continue・撤退なしの限界深度） ===");
  console.log("弟子強度\t方針\tmean\tp10\tmedian\tp90\tmax");
  for (const t of TIERS) {
    for (const picker of ["none", "greedy"]) {
      const r = montecarlo({ ...t, picker });
      console.log(`${t.label}\t${picker}\t${r.mean}\t${r.p10}\t${r.median}\t${r.p90}\t${r.max}`);
    }
  }
  if (FAST) return; // 掃引時は到達深度テーブルだけで切り上げ（重い分布計算を省く）
  console.log("\n=== バフ効果の差（中堅弟子・greedy vs none の median 深度比） ===");
  const mid = TIERS[1];
  const none = montecarlo({ ...mid, picker: "none" });
  const greedy = montecarlo({ ...mid, picker: "greedy" });
  console.log(`none median=${none.median} / greedy median=${greedy.median} / 伸び ×${(greedy.median / Math.max(1, none.median)).toFixed(2)}`);

  console.log("\n=== 流派均衡（中堅・各流派特化 vs 汎用greedy の median 深度） ===");
  {
    const clusters = ["flush", "guard", "tempo", "value", "gamble"];
    const meds = {};
    for (const cl of clusters) meds[cl] = montecarlo({ ...mid, picker: cl }).median;
    const gen = greedy.median;
    const vals = Object.values(meds);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    console.log(clusters.map((cl) => `${cl}:${meds[cl]}`).join("  ") + `  | 汎用greedy:${gen}`);
    console.log(`  流派間スプレッド hi/lo = ${(hi / Math.max(1, lo)).toFixed(2)}（1に近いほど均衡＝一意最適解なし）`);
  }

  console.log("\n=== レア度分布（drawCards・bias別の出現割合） ===");
  for (const bias of [0, 0.5, 1]) {
    const cnt = { common: 0, rare: 0, epic: 0, legendary: 0 };
    const N = 20000;
    for (let i = 0; i < N; i++) for (const c of drawCards(makeRng(`r-${bias}-${i}`), { count: 3, rarityBias: bias })) cnt[c.rarity]++;
    const tot = N * 3;
    console.log(`bias=${bias}\t` + Object.entries(cnt).map(([k, v]) => `${k} ${(v / tot * 100).toFixed(1)}%`).join("  "));
  }

  console.log("\n=== 生存曲線（各階の踏破率／到達数）・中堅greedy ===");
  const sv = survivalCurve({ ...TIERS[1], picker: "greedy" });
  const floors = Object.keys(sv.reached).map(Number).sort((a, b) => a - b).slice(0, 20);
  console.log(floors.map((f) => `F${f}:${((sv.won[f] || 0) / sv.reached[f] * 100).toFixed(0)}%(${sv.reached[f]})`).join("  "));

  console.log("\n=== 敵HPカーブ（階層別） ===");
  console.log([1, 3, 5, 8, 10, 15, 20, 30].map((f) => `F${f}:${floorEnemyHp(f)}`).join("  "));
  console.log(`基本重みweights例 F1 ally(s=48)=${(LEAGUE_SIM.weightBase + 48 * LEAGUE_SIM.weightPerStrength).toFixed(1)} / enemy(F10)=${(LEAGUE_SIM.weightBase + enemyStrengthOf(10, "x") * LEAGUE_SIM.weightPerStrength).toFixed(1)}`);
}

function assertTargets() {
  let n = 0; const ok = (c, m) => { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else n++; };
  const N = Number(process.env.ASSERTN || 1500);
  const mid = montecarlo({ ...TIERS[1], picker: "greedy" }, N);
  const midNone = montecarlo({ ...TIERS[1], picker: "none" }, N);
  const strong = montecarlo({ ...TIERS[2], picker: "greedy" }, N);
  const weak = montecarlo({ ...TIERS[0], picker: "none" }, N);
  // 目標帯（翻数係数モデル・深度＝到達フロア）。2026-07 追撃仕様（1戦=最大2〜3局・任意続行）への
  // シム追随で再校正（詳細: docs/roguelite-balance-recalibration-2026-07.md）。
  //   ・製品のランは大章クリア階（F30/F40）で帰還する有限ダンジョン（6f18643）＝深度は「F30/F40へ
  //     どれだけ余裕をもって届くか」の proxy。深度バンドは尾(p90)でなく median/p10 で締める。
  //   ・深度は GUARD=200 で打ち切り＝201 は「F200超」の意（非打ち切り実測 中堅greedy median≒316）。
  ok(midNone.median >= 18 && midNone.median <= 60, `無策(中堅none) 数十階で消耗死 18〜60 (=${midNone.median})`);
  // 2026-07-11 ボス必勝制：F10ボスが最初の「本物の関門」＝不運な無策はそこで散る（p10=10 は
  // 「F10ボスまでは必ず届く」の意）。それより手前（F3等）で即死しないことを下限で担保する。
  ok(midNone.p10 >= 9, `不運な無策でも最初のボス(F10)までは届く p10≥9 (=${midNone.p10})`);
  ok(mid.median >= midNone.median + 30, `バフ＋進路選択が無策より遥かに深い (+30超: ${mid.median} vs ${midNone.median})`);
  // 下限90＝「コミットした中堅がF30/F40を余裕で踏破できる地力」の proxy。上限は GUARD 打ち切りで
  // 実質検査不能（深層マラソン問題＝エンドレス復活時の宿題。ディレクター判断待ち。同docの提案①参照）。
  ok(mid.median >= 90, `中堅greedy median ≥90（F30/F40有限ダンジョンを余裕で踏破する proxy） (=${mid.median})`);
  // 2026-07-11 ボス必勝制：下振れランは早期ボス（F10/F20）で散り得る＝p10 はボス階級に落ちる。
  // 「深く潜れる」担保は median（≥90・上のアサート）が主役。p10 は「2つ目のボス圏まで届く」下限に再バンド。
  ok(mid.p10 >= 15, `中堅greedy の下振れでも2つ目のボス圏まで届く p10≥15 (=${mid.p10})`);
  ok(strong.median >= mid.median - 10, `育成完了 ≳ 中堅 (${strong.median} ≳ ${mid.median})`);
  ok(weak.median <= midNone.median + 5, `弱弟子(none) ≲ 中堅(none) (${weak.median} ≲ ${midNone.median})`);
  // 流派均衡（提案A・P1「唯一最適解を作らない」）：どの流派に寄せても近い深度＝一意最適解がない。
  const CN = Math.min(N, 900); // 流派4本ぶん回すので件数は控えめに
  const clMeds = {};
  for (const cl of ["flush", "guard", "tempo", "value", "gamble"]) clMeds[cl] = montecarlo({ ...TIERS[1], picker: cl }, CN).median;
  const cv = Object.values(clMeds);
  const clLo = Math.min(...cv), clHi = Math.max(...cv);
  // ※ 深度が GUARD 打ち切り(201)に張り付くとスプレッドは 1.0 側へ寄る（=検査が甘くなる）。
  //   打ち切り前の帯で開いた場合（弱体化の回帰）は従来どおり検出できる。
  ok(clHi / Math.max(1, clLo) <= 1.5, `流派間スプレッド hi/lo ≤1.5＝一意最適解なし (=${(clHi / clLo).toFixed(2)} ${JSON.stringify(clMeds)})`);
  ok(cv.every((m) => m >= 70), `各流派が成立帯(≥70)に届く (=${JSON.stringify(clMeds)})`);
  ok(cv.every((m) => m >= midNone.median + 20), `各流派が無策より明確に深い (+20超 vs none=${midNone.median}: ${JSON.stringify(clMeds)})`);
  // レア度（bias0）
  const cnt = { common: 0, rare: 0, epic: 0, legendary: 0 }; const RN = 30000;
  for (let i = 0; i < RN; i++) for (const c of drawCards(makeRng(`a-${i}`), { count: 3 })) cnt[c.rarity]++;
  const pct = (k) => cnt[k] / (RN * 3) * 100;
  ok(pct("legendary") >= 0.5 && pct("legendary") <= 5, `legendary 0.5〜5% (=${pct("legendary").toFixed(2)})`);
  ok(pct("common") >= 45, `common が主体 ≥45% (=${pct("common").toFixed(1)})`);
  console.log(`roguelite-balance assertions: ${n} passed`);
}

if (process.argv.includes("--clearrate")) {
  clearRateReport();
} else {
  report();
  if (ASSERT) assertTargets();
}
