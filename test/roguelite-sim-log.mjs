// 楼光の館・詳細プレイログ・シミュレータ（人が読む用）。
//   node test/roguelite-sim-log.mjs            … 既定パーティで3ラン、HP増減まで全ログ
//   RUNS=5 node test/roguelite-sim-log.mjs     … ラン数を変える
//   PARTY=shiyue,kuidoshi node ...             … パーティを変える（CHARACTERSのid）
//   POLICY=greedy|none  RETREAT=12  ...        … 方針/撤退階
//
// 実麻雀エンジンは回さず、balance harness と同じモデル（leagueAutoSim の局取り重み×打点分布
// → run.js の rogueliteDamageDeltas で点棒→HPへ写像）。フロア種別・進路・追撃・回復は本番ロジック。
// ※強さは選択ゲージのparams(attack/defense/quirk/difficulty)から導出した近似値（実対局の腕は別）。

import { makeRng, paramsFromLv, PARAM_KEYS } from "../src/autobattle/autoBattle.js";
import { LEAGUE_SIM } from "../src/autobattle/leagueAutoSim.js";
import { CHARACTERS } from "../src/characters/characters.js";
import {
  newRun, enemyUnitForFloor, seatedAllies, allPartyDown, handsForType,
  rogueliteDamageDeltas, rollDraft, floorDamageMul, healParty, rollHangover,
  shopStock, buyShopItem, shrineOffers, allyScaledHp, DAMAGE_SCALE, REGEN_FRAC,
} from "../src/roguelite/run.js";
import { applyCard, applyEffect } from "../src/roguelite/cardEffects.js";
import { cardById } from "../src/data/rogueliteCardMaster.js";
import { floorTypeById, drawFloorChoices, coinsForClear } from "../src/data/rogueliteFloorMaster.js";
import { pickEvent } from "../src/data/rogueliteEventMaster.js";

const RUNS = Number(process.env.RUNS || 3);
const POLICY = process.env.POLICY || "greedy";
const RETREAT_AT = Number(process.env.RETREAT || 0); // 0=撤退せず全滅まで
const PARTY_IDS = (process.env.PARTY || "shiyue,kuidoshi").split(",");

// 選択ゲージparams → ざっくり強さ（20..90）。先頭=操作キャラ。
function strengthOf(c) {
  const p = c.params || {};
  return Math.max(20, Math.min(90, 35 + (p.difficulty || 2) * 5 + (p.attack || 2) * 2 + (p.defense || 2)));
}
const avgEnemy = (p) => PARAM_KEYS.reduce((s, k) => s + (p[k] || 0), 0) / PARAM_KEYS.length;
function enemyStrength(floor, salt, kind) {
  const lvBump = kind === "boss" ? 2 : kind === "named" ? 1 : 0;
  const lv = Math.max(1, Math.min(10, Math.round(1 + (floor - 1) * 0.6) + lvBump));
  return avgEnemy(paramsFromLv(lv, salt)) + lvBump * 6;
}

const FT = {
  normal: floorTypeById("normal"), elite: floorTypeById("elite"), boss: floorTypeById("boss"),
};
const fmt = (n) => Math.round(n).toLocaleString();
const log = (...a) => console.log(...a);

// ---- パーティ生成（実キャラ） ----
function buildParty() {
  const members = PARTY_IDS.map((id) => CHARACTERS.find((c) => c.id === id)).filter(Boolean);
  return members.map((c) => ({ id: c.id, char: c, avatarHpMax: c.stats?.startingPoints ?? 14000, baseStrength: strengthOf(c) }));
}

// ---- 1戦（手牌ごとにHP増減をログ） ----
function simBattle(run, rng, floorType, pursue, label) {
  const allies = seatedAllies(run);
  const enemy = enemyUnitForFloor(run, floorType, pursue ? ":p" : "");
  const roles = ["ally", "enemy", "ally", "enemy"];
  const names = [allies[0].char.name, enemy.members[0].name, (allies[1].char.name) + (allies[1] === allies[0] ? "(影)" : ""), enemy.members[1].name];
  const hp = [allies[0].hp, enemy.members[0].stats.startingPoints, allies[1].hp, enemy.members[1].stats.startingPoints];
  const strength = [
    allies[0].baseStrength + run.mods.grantedAbilityIds.length * 8 * (allies[0].hungover ? 0 : 1),
    enemyStrength(run.floor, `${run.seed}:e0:${run.floor}`, floorType.enemy),
    allies[1].baseStrength + run.mods.grantedAbilityIds.length * 8 * (allies[1].hungover ? 0 : 1),
    enemyStrength(run.floor, `${run.seed}:e1:${run.floor}`, floorType.enemy),
  ];
  const weights = strength.map((s) => LEAGUE_SIM.weightBase + Math.max(0, s) * LEAGUE_SIM.weightPerStrength);
  const pick = (excl = -1) => { let t = 0; for (let i = 0; i < 4; i++) if (i !== excl) t += weights[i]; let r = rng() * t; for (let i = 0; i < 4; i++) { if (i === excl) continue; if ((r -= weights[i]) < 0) return i; } return excl === 0 ? 1 : 0; };
  const allyDownNow = () => hp[0] <= 0 && hp[2] <= 0;
  const enemyDownNow = () => hp[1] <= 0 && hp[3] <= 0;
  const hands = pursue ? 1 : handsForType(floorType);
  const winds = ["東", "南", "西", "北"];
  log(`    ${label}  局数=${hands}  深度被ダメ倍率=${floorDamageMul(run.floor).toFixed(2)}x`);
  log(`      HP  ${names[0]}:${fmt(hp[0])}  ${names[2]}:${fmt(hp[2])}  ／ 敵 ${names[1]}:${fmt(hp[1])}  ${names[3]}:${fmt(hp[3])}`);
  for (let h = 0; h < hands; h++) {
    if (allyDownNow() || enemyDownNow()) break;
    const label2 = `${winds[h % 4]}${(h % 4) + 1}局`;
    if (rng() < LEAGUE_SIM.drawRate) { log(`      ${label2}: 流局`); continue; }
    const w = pick();
    const tsumo = rng() < LEAGUE_SIM.tsumoRate;
    const scale = 1 + Math.max(-0.3, (strength[w] - 30) / 160);
    let value = Math.round(((LEAGUE_SIM.valueMin + Math.pow(rng(), 1.6) * (LEAGUE_SIM.valueMax - LEAGUE_SIM.valueMin)) * scale) / 100) * 100;
    const deltas = [0, 0, 0, 0];
    if (tsumo) { const share = Math.max(100, Math.round(value / 3 / 100) * 100); for (let i = 0; i < 4; i++) if (i !== w) deltas[i] = -share; deltas[w] = share * 3; }
    else { const v = pick(w); deltas[v] = -value; deltas[w] = value; }
    const hpd = rogueliteDamageDeltas(run, { deltas, roles, winnerSeat: w });
    const before = [...hp];
    for (let i = 0; i < 4; i++) hp[i] = Math.max(0, hp[i] + hpd[i]);
    // ログ：誰が和了→誰のHPがいくら減ったか
    const win = `${names[w]}${tsumo ? " ツモ" : " ロン"} ${fmt(value)}`;
    const hits = [0, 1, 2, 3].filter((i) => hpd[i] < 0).map((i) => `${names[i]} ${fmt(before[i])}→${fmt(hp[i])} (${fmt(hpd[i])})`);
    log(`      ${label2}: ${win}  ⇒  ${hits.join(" / ") || "（HP変化なし）"}`);
    if (allyDownNow()) { log(`      ＞＞ 味方ペア全滅！`); }
    if (enemyDownNow()) { log(`      ＞＞ 敵ペアを撃破！`); }
  }
  allies[0].hp = hp[0]; if (allies[1] !== allies[0]) allies[1].hp = hp[2];
  const allyDown = allyDownNow();
  const allyHp = Math.max(0, hp[0]) + Math.max(0, hp[2]);
  const allyFull = allies[0].hpMax + allies[1].hpMax;
  const enemyHp = Math.max(0, hp[1]) + Math.max(0, hp[3]);
  const cleared = !allyDown;
  log(`      結果: ${cleared ? (enemyDownNow() ? "撃破！" : "耐え抜いた") : "全滅"}  味方残HP=${fmt(allyHp)}/${fmt(allyFull)}  敵残HP=${fmt(enemyHp)}`);
  return { cleared, koAny: hp[1] <= 0 || hp[3] <= 0, enemyDown: enemyDownNow(), hpRatio: allyFull ? allyHp / allyFull : 0 };
}

// greedy なバフ選択。
function pickGreedy(cards) {
  const rank = (c) => { const k = c.effect.kind; if (k === "dealMul") return 100 * c.effect.mul; if (k === "compound") return 80; if (k === "takeReduce") return 60 + (c.effect.rate || 0) * 50; if (k === "maxHpUp") return 50 + c.effect.mul * 10; if (k === "grantAbility") return 45; if (k === "heal") return 30; return 10; };
  return [...cards].sort((a, b) => rank(b) - rank(a))[0] || null;
}

function regen(run, res) {
  const perf = Math.max(0.25, Math.min(1.3, 0.25 + (res.hpRatio ?? 0.5) * 0.85 + (res.koAny ? 0.25 : 0)));
  for (const m of run.party) m.hp = Math.min(m.hpMax, m.hp + Math.round(m.hpMax * REGEN_FRAC * perf));
  return perf;
}

function routePick(rng, run) {
  if (POLICY === "none") return FT.normal;
  const choices = drawFloorChoices(rng, { count: 3, force: (!run.eventSeen && run.floor >= 2 && run.floor <= 5) ? ["event"] : [] });
  const minFrac = Math.min(...run.party.map((m) => m.hp / m.hpMax));
  if (minFrac < 0.4) { const heal = choices.find((c) => c.kind === "rest" || c.kind === "banquet"); if (heal) return heal; }
  const pref = ["shop", "event", "treasure", "elite", "shrine", "gamble", "normal", "rest", "banquet"];
  for (const k of pref) { const f = choices.find((c) => c.id === k || c.kind === k); if (f) return f; }
  return choices[0];
}

// ---- 1ラン ----
function simRun(idx) {
  const seed = `log-${idx}`;
  const run = newRun(buildParty(), seed);
  for (const m of run.party) m.baseStrength = strengthOf(m.char); // newRun は強さを引き継がないので再付与
  const rng = makeRng(`${seed}:b`);
  log(`\n════════ ラン ${idx + 1} ════════`);
  log(`パーティ:`);
  for (const m of run.party) log(`  ${m.char.name}  HP ${fmt(m.hpMax)}（実点棒${fmt(m.char.stats?.startingPoints ?? 0)}→×${DAMAGE_SCALE}）  強さ≈${m.baseStrength}  役割:${m.char.role}  能力:${(m.char.abilities || []).map((a) => a.abilityId).join(",") || "なし"}`);
  let guard = 0;
  while (guard++ < 60) {
    const isBoss = run.floor % 10 === 0;
    const ft = isBoss ? FT.boss : (run.floor === 1 ? FT.normal : routePick(rng, run)); // 1階は通常戦闘（本番準拠）
    const head = `── 第 ${run.floor} 階 [${ft.name}]${isBoss ? "（ボス強制）" : ""} ──`;
    log(`\n${head}`);
    if (ft.kind !== "battle" && ft.kind !== "gamble") {
      // 特殊フロア
      if (ft.kind === "rest") { healParty(run, ft.healFrac ?? 0.3); log(`  休息：全員+${Math.round((ft.healFrac ?? 0.3) * 100)}% → ${run.party.map((m) => `${m.char.name}:${fmt(m.hp)}`).join(" ")}`); }
      else if (ft.kind === "banquet") { healParty(run, 1); rollHangover(run, ft.hangoverChance ?? 0.35, rng); const hung = run.party.filter((m) => m.hungover).map((m) => m.char.name); log(`  宴会：全回復${hung.length ? "／二日酔い: " + hung.join(",") : ""}`); }
      else if (ft.kind === "treasure") { const c = pickGreedy(rollDraft(run, { hpRatio: 1 })); if (c) { applyCard(run, c); log(`  宝箱：無料バフ「${c.name}」獲得`); } }
      else if (ft.kind === "event") { run.eventSeen = true; const ev = pickEvent(makeRng(`${seed}:ev:${run.floor}`)); const ch = ev.choices[0]; applyOutcome(run, ch.outcome); log(`  遭遇「${ev.title}」→「${ch.label}」 ${ch.reply}`); }
      else if (ft.kind === "shop") { const stock = shopStock(run, rng); let bought = []; for (const it of stock) { if ((run.coins || 0) >= it.price) { if (buyShopItem(run, it)) bought.push(`${it.name}(${it.price})`); } } log(`  ショップ：光貨${fmt(run.coins)} 残／購入: ${bought.join(", ") || "なし"}`); }
      else if (ft.kind === "shrine") { const o = shrineOffers(run)[0]; applyOutcome(run, o.outcome); log(`  祠：「${o.label}」 ${o.reply}`); }
      run.floor += 1;
      continue;
    }
    // 戦闘
    let res = simBattle(run, rng, ft, false, `戦闘`);
    const seated = seatedAllies(run); seated[0].hungover = false; if (seated[1] !== seated[0]) seated[1].hungover = false;
    if (!res.cleared) { endRun(run, false); return run.floor; }
    run.cleared += 1;
    const perf = regen(run, res);
    const earned = coinsForClear({ floor: run.floor, kind: ft.enemy, ko: res.koAny }) * (ft.kind === "gamble" ? 2 : 1);
    run.coins = (run.coins || 0) + earned;
    log(`    踏破！ 回復×${perf.toFixed(2)} → ${run.party.map((m) => `${m.char.name}:${fmt(m.hp)}`).join(" ")}  ／ 光貨+${earned}=${run.coins}`);
    const cards = rollDraft(run, { ko: res.koAny || ft.kind === "gamble", hpRatio: res.hpRatio });
    const c = pickGreedy(cards);
    if (c) { applyCard(run, c); log(`    バフ選択: 「${c.name}」（候補: ${cards.map((x) => x.name).join(" / ")}）`); }
    // 追撃
    let remaining = ft.pursueMax || 0;
    while (POLICY === "greedy" && remaining > 0 && Math.min(...run.party.map((m) => m.hp / m.hpMax)) > 0.55) {
      log(`    ＞ 追撃（残${remaining}）`);
      const pr = simBattle(run, rng, ft, true, `追撃戦`);
      if (!pr.cleared) { endRun(run, false); return run.floor; }
      run.cleared += 1; regen(run, pr);
      const c2 = pickGreedy(rollDraft(run, { ko: true, hpRatio: pr.hpRatio })); if (c2) { applyCard(run, c2); log(`      追撃バフ: 「${c2.name}」`); }
      remaining -= 1;
    }
    if (RETREAT_AT && run.floor >= RETREAT_AT) { endRun(run, true); return run.floor; }
    run.floor += 1;
  }
  endRun(run, true);
  return run.floor;
}

function applyOutcome(run, o) {
  if (!o) return;
  if (o.coins) run.coins = Math.max(0, (run.coins || 0) + o.coins);
  if (o.healFrac) healParty(run, o.healFrac);
  if (o.hurtFrac) for (const m of run.party) m.hp = Math.max(1, m.hp - Math.round(m.hpMax * o.hurtFrac));
  if (o.effect) applyEffect(run, o.effect);
  if (o.cardId) { const c = cardById(o.cardId); if (c) applyCard(run, c); }
}

function endRun(run, retreated) {
  const reached = retreated ? Math.max(1, run.floor - (run.floor % 10 === 0 ? 0 : 0)) : run.floor;
  log(`\n──── ラン終了：${retreated ? "撤退（記録確保）" : "全滅（没収）"} ／ 到達 第${run.floor}階 ／ 撃破${run.cleared}戦 ／ 光貨${run.coins} ────`);
  const held = {}; for (const id of run.cards) held[id] = (held[id] || 0) + 1;
  const list = Object.entries(held).map(([id, n]) => `${cardById(id)?.name || id}${n > 1 ? "×" + n : ""}`);
  log(`  最終ビルド: ${list.join(" / ") || "なし"}`);
}

// ---- 実行 ----
log(`楼光の館 シミュレーション・ログ`);
log(`パーティ: ${PARTY_IDS.join(", ")}  ／ 方針: ${POLICY}  ／ ${RETREAT_AT ? "第" + RETREAT_AT + "階で撤退" : "全滅まで"}  ／ ${RUNS}ラン`);
const depths = [];
for (let i = 0; i < RUNS; i++) depths.push(simRun(i));
log(`\n════════ まとめ ════════`);
log(`到達階層: ${depths.map((d, i) => `ラン${i + 1}=${d}階`).join(" / ")}`);
log(`平均到達: ${(depths.reduce((a, b) => a + b, 0) / depths.length).toFixed(1)}階`);
