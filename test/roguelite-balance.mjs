// ローグライト・バランス校正ハーネス — バフ数値／レア度確率／階層難度カーブの実測。
//   node test/roguelite-balance.mjs            … 計測レポート（人間が読む）
//   node test/roguelite-balance.mjs --assert   … 校正後の目標帯を回帰アサート
//
// 実麻雀エンジンは回さず、leagueAutoSim と同じ強度モデル（param平均→局取り重み＋打点分布）で
// 1局ずつ和了者と点移動を抽選し、run.js の rogueliteDamageDeltas で点棒→HP に写す（本番と同経路）。
// これで「階層が深いほど敵HPと強度が上がる中、味方がHPを保って踏破し続けられるか」を測る。

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

const ASSERT = process.argv.includes("--assert");

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
function enemyStrengthOf(floor, seed) {
  return avg(paramsFromLv(localEnemyLv(floor), seed));
}

// ---- 1戦の抽選（leagueAutoSim 流の局取り×打点 → HP写像） ----
function simBattle(run, rng, floorType, pursue = false) {
  const allies = seatedAllies(run);
  const enemy = enemyUnitForFloor(run, floorType, pursue ? ":p" : "");
  const roles = ["ally", "enemy", "ally", "enemy"];
  const hp = [allies[0].hp, enemy.members[0].stats.startingPoints, allies[1].hp, enemy.members[1].stats.startingPoints];
  const hpMax = [allies[0].hpMax, hp[1], allies[1].hpMax, hp[3]];
  const lvBump = floorType?.enemy === "boss" ? 2 : floorType?.enemy === "named" ? 1 : 0;
  const aStr = (m) => (m.hungover ? m.baseStrength : allyStrengthOf(run, m)); // 二日酔いは付与能力ぶんの底上げ無し
  const strength = [
    aStr(allies[0]),
    enemyStrengthOf(run.floor, `${run.seed}:e0:${run.floor}`) + lvBump * 6,
    aStr(allies[1]),
    enemyStrengthOf(run.floor, `${run.seed}:e1:${run.floor}`) + lvBump * 6,
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
  const hands = pursue ? 1 : (floorType?.baseHands || 1);
  for (let h = 0; h < hands; h++) {
    if (allyDownNow() || enemyDownNow()) break; // 決着（全滅 or 撃破）で即終了
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
    for (let i = 0; i < 4; i++) hp[i] = Math.max(0, hp[i] + hpd[i]);
  }
  // 結果反映：味方HPを run へ戻す（回復しない＝消耗が累積する）。
  allies[0].hp = hp[0];
  if (allies[1] !== allies[0]) allies[1].hp = hp[2];
  const allyDown = allyDownNow();
  const enemyDown = enemyDownNow();
  const allyHp = Math.max(0, hp[0]) + Math.max(0, hp[2]);
  const enemyHp = Math.max(0, hp[1]) + Math.max(0, hp[3]);
  const allyFull = hpMax[0] + hpMax[2];
  // 踏破＝全滅しなければ次へ（生存レース）。撃破(enemyDown)は早期決着＋高レアの燃料。
  const cleared = !allyDown;
  // outHpRace＝合計HPで競り負け。本番 onRogueliteBattleEnd の全員ペナルティ判定に対応。
  return { cleared, allyDown, enemyDown, koAny: hp[1] <= 0 || hp[3] <= 0, hpRatio: allyFull ? allyHp / allyFull : 0, outHpRace: allyHp < enemyHp };
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
  for (const m of run.party) if (m.hp > 0) m.hp = Math.min(m.hpMax, m.hp + Math.round(m.hpMax * TUNE.regenFrac * perf)); // トんだメンバーは回復しない
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
  applyHpRacePenalty(run, res, seated); // 合計HP敗北なら着卓2人に20%（全滅判定の前）
  if (runWiped(run)) return false; // ゲームオーバー＝生存1人以下（復活なし）
  run.cleared += 1; regenAll(run, res);
  run.coins = (run.coins || 0) + coinsForClear({ floor: run.floor, kind: floorType.enemy || "mob", ko: res.koAny }) * (floorType.kind === "gamble" ? 2 : 1);
  const pick = PICKERS[policy];
  let c = pick(rollDraft(run, { ko: res.koAny, hpRatio: res.hpRatio })); if (c) applyCard(run, c);
  // 追撃（greedy・HP健全なら pursueMax 回まで）
  let remaining = floorType.pursueMax || 0;
  while (isActive(policy) && remaining > 0 && Math.min(...run.party.map((m) => m.hp / m.hpMax)) > 0.55) {
    const pr = simBattle(run, rng, floorType, true);
    applyHpRacePenalty(run, pr, seated); // 追撃でも合計HP敗北なら着卓2人に20%
    if (runWiped(run)) return false; // 追撃中の全滅（生存1人以下）＝没収
    run.cleared += 1; regenAll(run, pr);
    c = pick(rollDraft(run, { ko: true, hpRatio: pr.hpRatio })); if (c) applyCard(run, c);
    remaining -= 1;
  }
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
  const run = newRun(party, seed);
  run.clusterTierCap = 2; // 流派2段目まで解放した「終盤(ショップ解禁後)」の均衡を検証する（既定の1段目はこの上位互換で必ず終了側）。
  for (const m of run.party) m.baseStrength = baseStrength;
  for (const id of carry) { const c = cardById(id); if (c) applyCard(run, c); }
  return run;
}

// ---- 1ラン（always-continue＝撤退せず限界まで）。深度＝到達フロア(run.floor)。 ----
function simRun(profile, seed) {
  const run = mkRun(profile, seed);
  const rng = makeRng(`${seed}:battle`);
  let guard = 0;
  while (guard++ < (Number(process.env.GUARD) || 200)) {
    const before = run.floor;
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
  // 目標帯（翻数係数モデル・深度＝到達フロア）。一撃死クジを廃し「点棒の殴り合い＝深く潜れる」へ再校正。
  //   ねらい：無バフでも数十階・バフ＋育成で100階級（"100いっちゃってOK"）。最適化の神引きは尾を引くが
  //   現実的プレイ(p10〜median)が指標。深度バンドは尾(p90)でなく median/p10 で締める。
  ok(midNone.median >= 25 && midNone.median <= 85, `無策(中堅none) 数十階で消耗死 25〜85 (=${midNone.median})`);
  ok(midNone.p10 >= 15, `不運な無策でも序盤即死しない p10≥15 (=${midNone.p10})`);
  ok(mid.median >= midNone.median + 30, `バフ＋進路選択が無策より遥かに深い (+30超: ${mid.median} vs ${midNone.median})`);
  ok(mid.median >= 90 && mid.median <= 260, `中堅greedy median 90〜260（100階級で必ず終わる帯） (=${mid.median})`);
  ok(mid.p10 >= 55, `中堅greedy は安定して深く潜れる p10≥55 (=${mid.p10})`);
  ok(strong.median >= mid.median - 10, `育成完了 ≳ 中堅 (${strong.median} ≳ ${mid.median})`);
  ok(weak.median <= midNone.median + 5, `弱弟子(none) ≲ 中堅(none) (${weak.median} ≲ ${midNone.median})`);
  // 流派均衡（提案A・P1「唯一最適解を作らない」）：どの流派に寄せても近い深度＝一意最適解がない。
  const CN = Math.min(N, 900); // 流派4本ぶん回すので件数は控えめに
  const clMeds = {};
  for (const cl of ["flush", "guard", "tempo", "value", "gamble"]) clMeds[cl] = montecarlo({ ...TIERS[1], picker: cl }, CN).median;
  const cv = Object.values(clMeds);
  const clLo = Math.min(...cv), clHi = Math.max(...cv);
  ok(clHi / Math.max(1, clLo) <= 1.5, `流派間スプレッド hi/lo ≤1.5＝一意最適解なし (=${(clHi / clLo).toFixed(2)} ${JSON.stringify(clMeds)})`);
  ok(cv.every((m) => m >= 70 && m <= 260), `各流派が成立帯(70〜260)で必ず終わる (=${JSON.stringify(clMeds)})`);
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
