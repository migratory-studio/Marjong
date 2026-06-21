// ローグライト データ層の回帰 — src/data/rogueliteCardMaster.js / src/roguelite/*。
//   node test/roguelite.mjs
import assert from "node:assert";
import {
  ROGUELITE_CARD_MASTER, RARITY_WEIGHTS, RARITY_META, cardById, drawCards, isGrantCard,
  cardCategory, CARD_CATEGORY,
} from "../src/data/rogueliteCardMaster.js";
import { applyEffect, applyCard, freshMods } from "../src/roguelite/cardEffects.js";
import {
  newRun, allyScaledHp, floorEnemyHp, handsForType, isBossFloor,
  enemyUnitForFloor, rogueliteDamageDeltas, explainRogueliteDamage, lethalCapFrac, rarityBiasFor, seatedAllies, benchAbilityIds, runWiped, survivorCount, DAMAGE_SCALE,
  carrySlotsFor, excludedCardIds, rollDraft, allPartyDown, healParty, rollHangover,
  shopStock, buyShopItem, shrineOffers,
} from "../src/roguelite/run.js";
import { ROGUELITE_FLOOR_MASTER, floorTypeById, drawFloorChoices, coinsForClear, forgeCost, SKILL_LEVEL_CAP } from "../src/data/rogueliteFloorMaster.js";
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
  "dealMul", "takeReduce", "grantAbility", "compound", "friendlyGuard",
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

// 分類（A案：バフ/必殺技/道具）
{
  eq(cardCategory(cardById("deal-up-common")), "buff", "dealMul=バフ");
  eq(cardCategory(cardById("maxhp-up-common")), "buff", "maxHpUp=バフ");
  eq(cardCategory(cardById("skill-up")), "buff", "skillLevelUp=バフ");
  eq(cardCategory(cardById("grant-lucky-draw")), "skill", "grantAbility=必殺技");
  eq(cardCategory(cardById("heal-small")), "item", "heal=道具");
  eq(cardCategory(cardById("ally-tsumo-ward")), "item", "庇いの守り=道具");
  eq(cardCategory({ category: "skill", effect: { kind: "heal" } }), "skill", "card.category で上書きできる");
  for (const c of ROGUELITE_CARD_MASTER) ok(CARD_CATEGORY[cardCategory(c)], `全カードに妥当な分類: ${c.id}`);
}
ok(!isGrantCard(cardById("heal-small")), "非grant 判定");

// ---------- HP スケール ----------
eq(allyScaledHp(25000), 1000, "25000点→1000HP");
eq(floorEnemyHp(1), 700, "階層1の敵HP=700（硬すぎ緩和）");
ok(floorEnemyHp(5) > floorEnemyHp(1), "深い階ほど敵HP増");
ok(floorEnemyHp(99) === floorEnemyHp(30), "30階で頭打ち（青天井回避）");
eq(handsForType(floorTypeById("normal")), 1, "通常戦闘=1局");
eq(handsForType(floorTypeById("elite")), 2, "強敵戦闘=2局");
eq(handsForType(floorTypeById("boss")), 2, "ボス=2局");
ok(isBossFloor(10) && !isBossFloor(3), "ボスは10階ごと");

// ---- フロア種別マスタ ----
const KNOWN_FLOOR_KINDS = new Set(["battle", "rest", "banquet", "treasure", "event", "shop", "gamble", "shrine", "forge"]);
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

// 編成（lineup）：出場順を入れ替えると着卓・控えが追従する
{
  const p3 = [
    { id: "you", char: { id: "you", abilities: [{ abilityId: "lucky-draw", params: {} }] }, avatarHpMax: 25000 },
    { id: "a", char: { id: "a", abilities: [{ abilityId: "chunchan", params: {} }] }, avatarHpMax: 20000 },
    { id: "b", char: { id: "b", abilities: [{ abilityId: "danger-sense", params: {} }] }, avatarHpMax: 20000 },
  ];
  const r3 = newRun(p3, "lineup");
  // 既定（lineup未設定）：HP上位2人＝you,a or you,b。控え=3人目の能力。
  ok(benchAbilityIds(r3).length >= 1, "既定で控え能力あり");
  // lineupで b を2番目に繰り上げ→ you,b が着卓、a が控え。
  r3.lineup = ["you", "b", "a"];
  const seats = seatedAllies(r3).map((m) => m.id);
  eq(seats[0], "you", "lineup: 席0=you");
  eq(seats[1], "b", "lineup: 席1=b（繰り上げ）");
  ok(benchAbilityIds(r3).includes("chunchan"), "lineup: a(chunchan)が控え");
  ok(!benchAbilityIds(r3).includes("danger-sense"), "lineup: b(danger-sense)は着卓で控えに出さない");
}

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
  // トんだメンバーは回復しない＝復活しない
  const r3 = newRun([
    { id: "you", char: { id: "you", abilities: [] }, avatarHpMax: 25000 },
    { id: "p2", char: { id: "p2", abilities: [] }, avatarHpMax: 25000 },
    { id: "p3", char: { id: "p3", abilities: [] }, avatarHpMax: 25000 },
  ], "revive");
  r3.party[2].hp = 0; r3.party[0].hp = 300;
  healParty(r3, 1.0); // 全回復でも…
  eq(r3.party[2].hp, 0, "トんだメンバーは回復しない（復活しない）");
  eq(r3.party[0].hp, 1000, "生存メンバーは満タンまで回復");
  // ゲームオーバー＝生存1人以下（runWiped）
  ok(!runWiped(r3), "生存2人なら継続（runWiped=false）");
  r3.party[1].hp = 0;
  ok(runWiped(r3), "生存1人で runWiped=true（着卓できない）");
  eq(survivorCount(r3), 1, "生存者数=1");
  // ソロランは1人でも全滅まで続行
  const solo = newRun([{ id: "s", char: { id: "s", abilities: [] }, avatarHpMax: 25000 }], "solo");
  ok(!runWiped(solo), "ソロランは1人でも継続");
  solo.party[0].hp = 0;
  ok(runWiped(solo), "ソロランも全滅で終了");
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

// ---------- スキルレベル（全員Lv1スタート→バフ/鍛冶屋でUP） ----------
{
  const r = newRun(party, "skill");
  eq(r.skillLevel, 1, "スキルLvは1スタート");
  applyCard(r, cardById("skill-up"));
  eq(r.skillLevel, 2, "秘伝の伝授で+1");
  for (let k = 0; k < 20; k++) applyCard(r, cardById("skill-up"));
  eq(r.skillLevel, SKILL_LEVEL_CAP, `スキルLvは上限${SKILL_LEVEL_CAP}で頭打ち`);
  ok(forgeCost(5) > forgeCost(1), "鍛冶費用はLvが上がるほど高い");
  ok(forgeCost(1) > 0, "鍛冶費用は正");
  eq(floorTypeById("forge").kind, "forge", "鍛冶屋フロアあり");
}

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

// ---------- ダメージ変換（floor1：fdm=1, dealDepth=1, friendlyMul=0.3） ----------
run = newRun(party, "s");
// 席0,2=ally / 1,3=enemy。味方が和了(席0)し敵席1へ -8000、味方席3が -2000 被弾（同士討ち）。
const roles = ["ally", "enemy", "ally", "enemy"];
let dd = rogueliteDamageDeltas(run, { deltas: [0, -8000, -2000, 0], roles, winnerSeat: 0 });
eq(dd[1], Math.round(-8000 * DAMAGE_SCALE), "敵失点を等倍スケール（mod無し・floor1）");
eq(dd[2], Math.round(-2000 * DAMAGE_SCALE * 0.3), "味方の和了で味方が払う＝同士討ちは大幅軽減(×0.3)");
eq(dd[0], 0, "得点側はHP不変（オーバーヒール無し）");

// dealMul/takeReduce 適用
applyCard(run, cardById("deal-up-rare")); // dealMul ×1.25
applyCard(run, cardById("take-down-common")); // takeMul ×0.9
dd = rogueliteDamageDeltas(run, { deltas: [0, -8000, -2000, 0], roles, winnerSeat: 0 });
eq(dd[1], Math.round(-8000 * DAMAGE_SCALE * 1.25), "敵失点に与ダメ倍率");
eq(dd[2], Math.round(-2000 * DAMAGE_SCALE * 0.9 * 0.3), "同士討ちは被ダメ軽減×同士討ち軽減");
// 敵が和了したら dealMul は掛からない（味方失点には軽減のみ・floor1はfdm=1）
dd = rogueliteDamageDeltas(run, { deltas: [-3000, 0, 0, 0], roles, winnerSeat: 1 });
eq(dd[0], Math.round(-3000 * DAMAGE_SCALE * 0.9), "敵和了時は味方失点に軽減のみ（floor1）");

// ---------- 一撃死上限（hpMax を渡すと最大HP比で被ダメをクランプ） ----------
{
  const r = newRun(party, "cap"); r.floor = 6; // 深度浅め＝cap基準
  const hpMax = [1000, 0, 1000, 0];
  // 敵の特大ツモを席0が受ける（fdm込みでも cap=lethalCapFrac(6)*1000 を超えない）
  const dCap = rogueliteDamageDeltas(r, { deltas: [-99999, 0, 0, 0], roles, winnerSeat: 1, hpMax });
  const cap = Math.round(1000 * lethalCapFrac(6));
  eq(dCap[0], -cap, "1ハンドの被ダメは最大HP比の上限でクランプ");
  ok(lethalCapFrac(1) < lethalCapFrac(30), "上限は深層ほど緩む（一撃死が戻る）");
  eq(lethalCapFrac(40), 1, "十分深ければ上限なし（=1.0）");
  // hpMax を渡さなければクランプしない（後方互換）
  const dNoCap = rogueliteDamageDeltas(r, { deltas: [-99999, 0, 0, 0], roles, winnerSeat: 1 });
  ok(dNoCap[0] < -cap, "hpMax 無しは従来どおり上限なし");
}

// ---------- ダメージ内訳（explainRogueliteDamage：素点→各段→最終） ----------
{
  const r = newRun(party, "explain");
  applyCard(r, cardById("deal-up-rare")); // dealMul ×1.25
  const ex = explainRogueliteDamage(r, { deltas: [0, -8000, 0, 0], roles, winnerSeat: 0, hpMax: [1000, 0, 1000, 0] });
  const enemyRow = ex[1];
  eq(enemyRow.steps[0].k, "素点", "内訳の先頭は素点");
  eq(enemyRow.steps[0].v, -8000, "素点は元の点");
  ok(enemyRow.value < 0, "内訳の最終値（与ダメ）が出る");
  ok(enemyRow.steps.some((s) => /攻撃/.test(s.k)), "攻撃バフの段が出る");
  // 説明はお守りを消費しない
  const r2 = newRun(party, "explain2"); applyCard(r2, cardById("ally-tsumo-ward"));
  explainRogueliteDamage(r2, { deltas: [0, 0, -2000, 0], roles, winnerSeat: 0, hpMax: [1000, 0, 1000, 0] });
  eq(r2.mods.friendlyGuard, 1, "内訳表示ではお守りを消費しない");
}

// ---------- バランス調整：深度倍率は敵の攻撃だけ・与ダメは深度ボーナス・お守り ----------
{
  // 深いフロアで、敵の攻撃（winner=enemy）→味方失点に fdm が乗る。味方の自摸（winner=ally）→乗らない。
  const r = newRun(party, "depth"); r.floor = 10;
  const enemyHit = rogueliteDamageDeltas(r, { deltas: [-1000, 0, 0, 0], roles, winnerSeat: 1 });
  const allyTsumo = rogueliteDamageDeltas(r, { deltas: [0, 0, -1000, 0], roles, winnerSeat: 0 });
  ok(Math.abs(enemyHit[0]) > Math.abs(allyTsumo[2]) * 3, "敵の攻撃は深度倍率で重い／味方の自摸被弾は軽い");
  // 与ダメは深度で少し伸びる（floor10 > floor1）
  const dealF1 = rogueliteDamageDeltas(newRun(party, "d1"), { deltas: [0, -1000, 0, 0], roles, winnerSeat: 0 })[1];
  const dealF10 = rogueliteDamageDeltas(r, { deltas: [0, -1000, 0, 0], roles, winnerSeat: 0 })[1];
  ok(Math.abs(dealF10) > Math.abs(dealF1), "与ダメは深層ほど伸びる（アガリの手応え維持）");
}
{
  // お守り（friendlyGuard）：味方ツモ被弾を1回無効化→消費。
  const r = newRun(party, "ward");
  applyCard(r, cardById("ally-tsumo-ward"));
  eq(r.mods.friendlyGuard, 1, "庇いの守りで friendlyGuard=1");
  const d1 = rogueliteDamageDeltas(r, { deltas: [0, 0, -2000, 0], roles, winnerSeat: 0 });
  eq(d1[2], 0, "味方ツモ被弾をお守りで無効化");
  eq(r.mods.friendlyGuard, 0, "お守りは1個消費");
  const d2 = rogueliteDamageDeltas(r, { deltas: [0, 0, -2000, 0], roles, winnerSeat: 0 });
  ok(d2[2] < 0, "消費後は通常どおり同士討ち被弾");
  // 敵の攻撃ではお守りは消費しない
  const r2 = newRun(party, "ward2"); applyCard(r2, cardById("ally-tsumo-ward"));
  rogueliteDamageDeltas(r2, { deltas: [-2000, 0, 0, 0], roles, winnerSeat: 1 });
  eq(r2.mods.friendlyGuard, 1, "敵の攻撃ではお守りを消費しない");
}

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
