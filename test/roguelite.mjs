// ローグライト データ層の回帰 — src/data/rogueliteCardMaster.js / src/roguelite/*。
//   node test/roguelite.mjs
import assert from "node:assert";
import {
  ROGUELITE_CARD_MASTER, RARITY_WEIGHTS, RARITY_META, cardById, drawCards, isGrantCard,
} from "../src/data/rogueliteCardMaster.js";
import { applyEffect, applyCard, freshMods } from "../src/roguelite/cardEffects.js";
import {
  newRun, allyScaledHp, floorEnemyHp, handsForType, isBossFloor,
  enemyUnitForFloor, rogueliteDamageDeltas, rarityBiasFor, seatedAllies, DAMAGE_SCALE,
  carrySlotsFor, excludedCardIds, rollDraft, allPartyDown, healParty, rollHangover,
  shopStock, buyShopItem, shrineOffers,
} from "../src/roguelite/run.js";
import { ROGUELITE_FLOOR_MASTER, floorTypeById, drawFloorChoices, coinsForClear } from "../src/data/rogueliteFloorMaster.js";
import { ROGUELITE_EVENT_MASTER, pickEvent } from "../src/data/rogueliteEventMaster.js";
import { makeRng } from "../src/autobattle/autoBattle.js";
import { abilityDef } from "../src/data/abilityMaster.js";
import { pickVoiceLine } from "../src/data/voiceLines.js";
import { Game } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.strictEqual(a, b, m); n++; };

// ---------- マスタ整合 ----------
const KNOWN_KINDS = new Set([
  "heal", "maxHpUp", "skillLevelUp", "paramBoost", "addBench",
  "dealMul", "takeReduce", "grantAbility", "compound",
]);
const ids = new Set();
for (const c of ROGUELITE_CARD_MASTER) {
  ok(c.id && !ids.has(c.id), `card id 一意: ${c.id}`); ids.add(c.id);
  ok(c.name && c.desc, `card 文言あり: ${c.id}`);
  ok(RARITY_META[c.rarity], `rarity 妥当: ${c.id}=${c.rarity}`);
  ok(c.effect && KNOWN_KINDS.has(c.effect.kind), `effect.kind 既知: ${c.id}=${c.effect?.kind}`);
  if (c.effect.kind === "compound") {
    for (const p of c.effect.parts) ok(KNOWN_KINDS.has(p.kind), `compound part 既知: ${c.id}`);
  }
}
ok(RARITY_WEIGHTS.legendary < RARITY_WEIGHTS.common, "レジェンダリは最も出にくい");
eq(cardById("heal-small")?.id, "heal-small", "cardById 解決");
eq(cardById("nope"), null, "cardById 未知=null");
ok(isGrantCard(cardById("grant-lucky-draw")), "grant 判定");
ok(!isGrantCard(cardById("heal-small")), "非grant 判定");

// ---------- HP スケール ----------
eq(allyScaledHp(25000), 1000, "25000点→1000HP");
eq(floorEnemyHp(1), 1000, "階層1の敵HP=1000");
ok(floorEnemyHp(5) > floorEnemyHp(1), "深い階ほど敵HP増");
ok(floorEnemyHp(99) === floorEnemyHp(30), "30階で頭打ち（青天井回避）");
eq(handsForType(floorTypeById("normal")), 1, "通常戦闘=1局");
eq(handsForType(floorTypeById("elite")), 2, "強敵戦闘=2局");
eq(handsForType(floorTypeById("boss")), 2, "ボス=2局");
ok(isBossFloor(10) && !isBossFloor(3), "ボスは10階ごと");

// ---- フロア種別マスタ ----
const KNOWN_FLOOR_KINDS = new Set(["battle", "rest", "banquet", "treasure", "event", "shop", "gamble", "shrine"]);
const fids = new Set();
for (const f of ROGUELITE_FLOOR_MASTER) {
  ok(f.id && !fids.has(f.id), `floor id 一意: ${f.id}`); fids.add(f.id);
  ok(f.name && KNOWN_FLOOR_KINDS.has(f.kind), `floor kind 既知: ${f.id}=${f.kind}`);
  if (f.kind === "battle") ok(["mob", "named", "boss"].includes(f.enemy), `battle enemy 妥当: ${f.id}`);
}
eq(floorTypeById("boss").weight, 0, "ボスは抽選プール外（強制配置）");
{
  const choices = drawFloorChoices(makeRng("r1"), { count: 3 });
  eq(choices.length, 3, "進路3択");
  eq(new Set(choices.map((c) => c.id)).size, 3, "進路は重複なし");
  ok(choices.some((c) => c.kind === "battle"), "進路に必ず戦闘系を含む（手詰まり回避）");
  ok(!choices.some((c) => c.id === "boss"), "進路にボスは出ない");
  // 強制枠（序盤の遭遇イベント確定）
  for (let i = 0; i < 20; i++) {
    const ch = drawFloorChoices(makeRng(`force-${i}`), { count: 3, force: ["event"] });
    ok(ch.some((c) => c.id === "event"), `force=event で必ず遭遇が出る (#${i})`);
  }
}

// ---- 遭遇イベントマスタ ----
const eids = new Set();
for (const e of ROGUELITE_EVENT_MASTER) {
  ok(e.id && !eids.has(e.id), `event id 一意: ${e.id}`); eids.add(e.id);
  ok((e.lines || []).length > 0 && (e.choices || []).length === 2, `event は会話＋2択: ${e.id}`);
  for (const c of e.choices) ok(c.label && c.outcome, `choice に label/outcome: ${e.id}`);
}
ok(pickEvent(makeRng("e1")), "pickEvent が1件返す");

// 付与カードの能力が実在する（party 不要なのでここで）。
for (const c of ROGUELITE_CARD_MASTER) {
  if (c.effect?.kind === "grantAbility") ok(abilityDef(c.effect.abilityId), `付与カードの能力が実在: ${c.id}=${c.effect.abilityId}`);
}

// 意思決定セリフ（buffFamily 条件・追撃・撤退）が詩玥で解決できる。
for (const fam of ["attack", "defense", "sustain", "ability"]) {
  ok(pickVoiceLine("shiyue", "rlBuff", { buffFamily: fam }), `rlBuff/${fam} の詩玥セリフが解決`);
}
ok(pickVoiceLine("shiyue", "rlPursue", {}), "追撃セリフ");
ok(pickVoiceLine("shiyue", "rlRetreat", {}), "撤退セリフ");
// 満貫帯(8000)は「mid」＝地味な低点数セリフにならない（scoreTier 照合ズレの修正）
{
  const mid = new Set();
  for (let i = 0; i < 30; i++) mid.add(pickVoiceLine("shiyue", "agari", { isYakuman: false, score: 8000 }));
  ok(![...mid].some((l) => /地味/.test(l || "")), "満貫(8000)で“地味”セリフが出ない");
  ok([...mid].some((l) => /満貫|決める|仕上げ/.test(l || "")), "満貫帯の手応えセリフが出る");
  ok(pickVoiceLine("shiyue", "agari", { score: 1000 }) && /地味|小さく/.test([...Array(20)].map(() => pickVoiceLine("shiyue", "agari", { score: 1000 })).join("")), "小場(1000)は小場セリフ");
}
// HP/点棒系バフでは点棒嫌いに触れる固有セリフが出る（汎用フォールバックも混じるので複数試行で確認）。
ok([...Array(20)].map(() => pickVoiceLine("shiyue", "rlBuff", { buffFamily: "sustain" })).some((l) => /点棒|盾|嫌い/.test(l || "")), "HP/点棒系バフは点棒嫌いに触れる（固有性）");

// エンジンの maxHands（定められた局数で打ち切り）。連荘も1局＝handNumber で数える。
{
  const mk = (opts) => new Game(CHARACTERS.slice(0, 4).map((c) => ({ character: c, abilities: instantiateAbilities(c) })), -1, 1, opts);
  const g = mk({ maxRounds: 1, maxHands: 2 });
  g.handNumber = 1; g._endHand(false, 1, false); // 1局目終了 → まだ続く
  ok(!g.isGameOver(), "maxHands=2：1局では終わらない");
  g.handNumber = 2; g._endHand(false, 2, false); // 2局目終了 → 打ち切り
  ok(g.isGameOver(), "maxHands=2：2局で打ち切り（定められた局数）");
  const g2 = mk({ maxRounds: 1 }); // maxHands 未指定＝従来（東風1周）
  g2.handNumber = 2; g2._endHand(false, 1, false);
  ok(!g2.isGameOver(), "maxHands 未指定は従来挙動（東風途中で終わらない）");
}

// ---------- ラン生成 ----------
const party = [
  { id: "you", char: { id: "you", abilities: [{ abilityId: "lucky-draw", params: {} }] }, avatarHpMax: 25000 },
  { id: "pal", char: { id: "pal", abilities: [] }, avatarHpMax: 12000 },
];
let run = newRun(party, "seed-1");
eq(run.floor, 1, "初期階層1");
eq(run.party.length, 2, "パーティ2人");
eq(run.party[0].hp, 1000, "あなたHP=1000");
eq(run.party[1].hpMax, allyScaledHp(12000), "相棒HPMax正規化");
eq(run.mods.dealMul, 1, "初期 dealMul=1");

// 着卓は先頭2人
eq(seatedAllies(run)[0].id, "you", "席0=あなた");

// 敵生成は決定論（同seed/同階層/同種別で一致）
const NORMAL = floorTypeById("normal");
const e1 = enemyUnitForFloor(run, NORMAL);
const e2 = enemyUnitForFloor(newRun(party, "seed-1"), NORMAL);
eq(e1.members[0].name, e2.members[0].name, "敵生成は決定論");
eq(e1.members.length, 2, "敵2人");
eq(e1.members[0].stats.startingPoints, floorEnemyHp(1), "通常敵HP=階層HP");
// 種別で質が変わる：強敵/ボスはHP・能力が上乗せ
const eliteU = enemyUnitForFloor(run, floorTypeById("elite"));
ok(eliteU.isElite && eliteU.members[0].abilities.length > 0, "強敵=能力持ち");
ok(eliteU.members[0].stats.startingPoints > floorEnemyHp(1), "強敵はHP上乗せ");
const bossU = enemyUnitForFloor(run, floorTypeById("boss"));
ok(bossU.isBoss && bossU.members[0].isRival, "ボス=ネームドライバル");
// 追撃 salt で別個体
ok(enemyUnitForFloor(run, NORMAL, ":p1").members[0].name !== undefined, "salt付きでも生成できる");

// ---------- 回復・二日酔い ----------
{
  const r = newRun(party, "heal");
  r.party[0].hp = 200; r.party[1].hp = 100;
  healParty(r, 0.3);
  eq(r.party[0].hp, 200 + Math.round(1000 * 0.3), "休息30%回復");
  ok(!allPartyDown(r), "生存中は allPartyDown=false");
  r.party.forEach((m) => (m.hp = 0));
  ok(allPartyDown(r), "全員0で allPartyDown=true");
  const r2 = newRun(party, "hang");
  rollHangover(r2, 1, makeRng("x")); // chance=1 で必ず二日酔い
  ok(r2.party.every((m) => m.hungover), "宴会chance=1で全員二日酔い");
}

// ---------- 第2弾：光貨・ショップ・祠 ----------
ok(coinsForClear({ floor: 10, kind: "boss" }) > coinsForClear({ floor: 1, kind: "mob" }), "深い/ボスほど光貨多い");
ok(coinsForClear({ floor: 5, kind: "named" }) > coinsForClear({ floor: 5, kind: "mob" }), "強敵は光貨上乗せ");
{
  const r = newRun(party, "shop");
  const stock = shopStock(r, makeRng("s"));
  eq(stock.length, 5, "ショップ在庫＝バフ3＋回復＋最大HP");
  ok(stock.some((it) => it.type === "heal") && stock.some((it) => it.type === "maxhp"), "回復/最大HP商品あり");
  ok(stock.every((it) => it.price > 0), "全商品に値段");
  r.coins = 0;
  ok(!buyShopItem(r, stock[0]), "光貨不足は購入不可");
  r.coins = 200; const before = r.coins;
  const card = stock.find((it) => it.type === "card");
  ok(buyShopItem(r, card), "購入成立");
  eq(r.coins, before - card.price, "光貨を消費");
  ok(r.cards.includes(card.card.id), "購入カードが取得履歴に");
  r.party[0].hp = 100; buyShopItem(r, stock.find((it) => it.type === "heal"));
  eq(r.party[0].hp, 100 + Math.round(r.party[0].hpMax * 0.5), "回復商品で50%回復");
}
{
  const r = newRun(party, "shrine");
  const offers = shrineOffers(r);
  eq(offers.length, 3, "祠は2供物＋去る");
  ok(offers.some((o) => o.outcome.hurtFrac) && offers.some((o) => o.outcome.coins < 0), "HP供物と光貨供物がある");
  ok(offers.some((o) => Object.keys(o.outcome).length === 0), "「去る」は無効果");
}
{
  // 満タン時は純回復カードをドラフトに出さない（死に札の解消）。手負いなら出る。
  const r = newRun(party, "fulldraft");
  let healAtFull = false;
  for (let k = 0; k < 40; k++) { r.cleared = k; if (rollDraft(r, { hpRatio: 1 }).some((c) => c.effect.kind === "heal")) { healAtFull = true; break; } }
  ok(!healAtFull, "満タン時は純回復カードを出さない");
  r.party.forEach((m) => (m.hp = Math.round(m.hpMax * 0.3)));
  let sawHeal = false;
  for (let k = 0; k < 80; k++) { r.cleared = 200 + k; if (rollDraft(r, { hpRatio: 0.3 }).some((c) => c.effect.kind === "heal")) { sawHeal = true; break; } }
  ok(sawHeal, "手負いなら回復カードが候補に出る");
}

// ---------- カード効果 ----------
run = newRun(party, "s");
applyCard(run, cardById("heal-small")); // 満タンなので回復は頭打ち
eq(run.party[0].hp, 1000, "満タンからの回復は上限据置");
// ダメージを受けてから回復
run.party[0].hp = 400;
applyCard(run, cardById("heal-small")); // +25%最大=+250
eq(run.party[0].hp, 650, "25%回復=+250");

run = newRun(party, "s");
applyCard(run, cardById("maxhp-up-common")); // ×1.15
eq(run.party[0].hpMax, Math.round(1000 * 1.15), "最大HP+15%");
eq(run.party[0].hp, Math.round(1000 * 1.15), "現在HPも底上げ");

run = newRun(party, "s");
applyCard(run, cardById("deal-up-common")); // ×1.1
applyCard(run, cardById("deal-up-rare")); // ×1.25
ok(Math.abs(run.mods.dealMul - 1.375) < 1e-9, "与ダメ倍率は積");

run = newRun(party, "s");
applyCard(run, cardById("take-down-common")); // 1-0.1
ok(Math.abs(run.mods.takeMul - 0.9) < 1e-9, "被ダメ軽減 takeMul=0.9");

run = newRun(party, "s");
applyCard(run, cardById("grant-lucky-draw"));
ok(run.mods.grantedAbilityIds.includes("lucky-draw"), "付与能力を積む");
applyCard(run, cardById("grant-lucky-draw")); // 重複付与は1回
eq(run.mods.grantedAbilityIds.filter((x) => x === "lucky-draw").length, 1, "付与は重複しない");

run = newRun(party, "s");
applyCard(run, cardById("add-bench"));
eq(run.mods.benchSlots, 1, "控え枠+1");

// skillLevelUp / paramBoost は v1 ではカード化していないが、リゾルバの kind は将来用に維持。
run = newRun(party, "s");
applyEffect(run, { kind: "skillLevelUp", delta: 2 });
eq(run.mods.skillLevelDelta, 2, "skillLevelUp 集約（予約kind）");
applyEffect(run, { kind: "paramBoost", param: "fire", add: 20 });
eq(run.mods.paramAdd.fire, 20, "paramBoost 集約（予約kind）");

// compound（不動の城壁＝takeReduce+maxHpUp）
run = newRun(party, "s");
applyCard(run, cardById("fortress"));
ok(Math.abs(run.mods.takeMul - 0.6) < 1e-9, "compound takeReduce 反映");
eq(run.party[0].hpMax, Math.round(1000 * 1.25), "compound maxHpUp 反映");

// ---------- ダメージ変換 ----------
run = newRun(party, "s");
// 席0,2=ally / 1,3=enemy。味方が和了(席0)し敵席1へ -8000、味方席3が -2000 被弾。
const roles = ["ally", "enemy", "ally", "enemy"];
let dd = rogueliteDamageDeltas(run, { deltas: [0, -8000, -2000, 0], roles, winnerSeat: 0 });
eq(dd[1], Math.round(-8000 * DAMAGE_SCALE), "敵失点を等倍スケール（mod無し）");
eq(dd[2], Math.round(-2000 * DAMAGE_SCALE), "味方失点を等倍スケール（mod無し）");
eq(dd[0], 0, "得点側はHP不変（オーバーヒール無し）");

// dealMul/takeReduce 適用
applyCard(run, cardById("deal-up-rare")); // dealMul ×1.25
applyCard(run, cardById("take-down-common")); // takeMul ×0.9
dd = rogueliteDamageDeltas(run, { deltas: [0, -8000, -2000, 0], roles, winnerSeat: 0 });
eq(dd[1], Math.round(-8000 * DAMAGE_SCALE * 1.25), "敵失点に与ダメ倍率");
eq(dd[2], Math.round(-2000 * DAMAGE_SCALE * 0.9), "味方失点に被ダメ軽減");
// 敵が和了したら dealMul は掛からない
dd = rogueliteDamageDeltas(run, { deltas: [-3000, 0, 0, 0], roles, winnerSeat: 1 });
eq(dd[0], Math.round(-3000 * DAMAGE_SCALE * 0.9), "敵和了時は味方失点に軽減のみ");

// ---------- ドラフト ----------
const rng = makeRng("draft-seed");
const drawn = drawCards(rng, { count: 3 });
eq(drawn.length, 3, "3枚ドラフト");
eq(new Set(drawn.map((c) => c.id)).size, 3, "ドラフトは重複なし");
// exclude が効く
const ex = drawCards(makeRng("x"), { count: 3, exclude: drawn.map((c) => c.id) });
ok(ex.every((c) => !drawn.map((d) => d.id).includes(c.id)), "exclude 反映");
// rarityBias でレア寄せ（多数試行でepic+legendary比率が上がる）
const sampleRarity = (bias) => {
  let hi = 0; const N = 400;
  for (let i = 0; i < N; i++) {
    const cs = drawCards(makeRng(`b${bias}-${i}`), { count: 3, rarityBias: bias });
    hi += cs.filter((c) => c.rarity === "epic" || c.rarity === "legendary").length;
  }
  return hi / N;
};
ok(sampleRarity(1) > sampleRarity(0), "rarityBias=1 はレア以上が増える");

// ---------- メタ進行（引き継ぎ枠） ----------
eq(carrySlotsFor(0), 1, "記録0でも1枠（とっつき）");
eq(carrySlotsFor(2), 1, "〜2階=1枠");
eq(carrySlotsFor(3), 2, "3階=2枠");
eq(carrySlotsFor(6), 3, "6階=3枠");
eq(carrySlotsFor(10), 4, "10階=4枠");
ok(carrySlotsFor(99) === carrySlotsFor(10), "上限頭打ち");
// 引き継ぎバフを新ランへ適用（次ランは持って始まる）
run = newRun(party, "carry");
applyCard(run, cardById("deal-up-rare")); // 引き継いだ想定
ok(Math.abs(run.mods.dealMul - 1.25) < 1e-9, "引き継ぎバフは開始時に効く");
ok(run.cards.includes("deal-up-rare"), "引き継ぎも取得履歴に乗る（再選択可）");

// rarityBiasFor の単調性
ok(rarityBiasFor({ ko: true, hpRatio: 1, floor: 10 }) > rarityBiasFor({ ko: false, hpRatio: 0.3, floor: 1 }), "好成績ほど高バイアス");
ok(rarityBiasFor({}) >= 0 && rarityBiasFor({ ko: true, hpRatio: 1, floor: 30 }) <= 1, "バイアスは0..1");

console.log(`roguelite.mjs: ${n} checks passed`);
