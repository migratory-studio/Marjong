// ローグライト データ層の回帰 — src/data/rogueliteCardMaster.js / src/roguelite/*。
//   node test/roguelite.mjs
import assert from "node:assert";
import {
  ROGUELITE_CARD_MASTER, RARITY_WEIGHTS, RARITY_META, cardById, drawCards, isGrantCard,
  cardCategory, CARD_CATEGORY, CLUSTER_SYNERGY, CLUSTER_META, clusterOf,
} from "../src/data/rogueliteCardMaster.js";
import { applyEffect, applyCard, freshMods, clusterDealMul, clusterProgress, clusterTakeCapFrac, clusterTakeRaiseFrac, clusterPickPreview, recomputeClusterCount } from "../src/roguelite/cardEffects.js";
import {
  newRun, allyScaledHp, floorEnemyHp, floorDamageMul, tv, handsForType, isBossFloor,
  enemyUnitForFloor, rogueliteDamageDeltas, explainRogueliteDamage, lethalCapFrac, hanTierMul, rarityBiasFor, seatedAllies, benchAbilityIds, runWiped, survivorCount, serializeRun, deserializeRun, DAMAGE_SCALE,
  carrySlotsFor, excludedCardIds, rollDraft, allPartyDown, healParty, rollHangover,
  shopStock, buyShopItem, shrineOffers,
  rollTableSize, tableSizeLabel, isSoloTable, TABLE_SIZE_DIST, ABILITY_SOURCE_MAX, gainAbilitySource, spendAbilitySource,
  ROGUELITE_SOLO_PENALTY, soloPenaltyHint,
} from "../src/roguelite/run.js";
import { ROGUELITE_FLOOR_MASTER, floorTypeById, drawFloorChoices, coinsForClear, forgeCost, SKILL_LEVEL_CAP } from "../src/data/rogueliteFloorMaster.js";
import { ROGUELITE_ITEM_MASTER, itemById, drawItems, ITEM_SLOTS, ITEM_KIND_META } from "../src/data/rogueliteItemMaster.js";
import { useItem, itemMods, consumeBanquetCharm, takeNextBattle } from "../src/roguelite/itemEffects.js";
import { ROGUELITE_EVENT_MASTER, pickEvent } from "../src/data/rogueliteEventMaster.js";
import { makeRng } from "../src/autobattle/autoBattle.js";
import { abilityDef } from "../src/data/abilityMaster.js";
import { pickVoiceLine } from "../src/data/voiceLines.js";
import { CHARACTER_VOICE_MASTER } from "../src/data/characterVoiceMaster.js";
import { bossMemoryTier, readBossTally, recordBossOutcome, withBossTally } from "../src/roguelite/bossMemory.js";
import { previewBossChars } from "../src/roguelite/run.js";
import { ROGUELITE_CHAPTER_MASTER, chapterById, firstChapterId, isChapterUnlocked, chaptersWithState, canOrbUnlock, nextChapterAfter } from "../src/data/rogueliteChapterMaster.js";
import { Game } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.strictEqual(a, b, m); n++; };

// ---------- マスタ整合 ----------
const KNOWN_KINDS = new Set([
  "heal", "maxHpUp", "maxHpAdd", "skillLevelUp", "paramBoost", "addBench",
  "dealMul", "takeReduce", "grantAbility", "compound", "friendlyGuard",
  "streakDeal", "lowHpPower", "revengeDeal", "riichiDeal", // 条件付き（動的）バフ
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
const KNOWN_FLOOR_KINDS = new Set(["battle", "rest", "banquet", "treasure", "event", "shop", "gamble", "shrine", "forge", "recruit"]);
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
  // ボス直前の整え枠：force=rest/shop で必ず回復系が1枠出る
  for (let i = 0; i < 20; i++) {
    const ch = drawFloorChoices(makeRng(`preboss-${i}`), { count: 3, force: ["rest"] });
    ok(ch.some((c) => c.id === "rest"), `force=rest で必ず休息が出る (#${i})`);
    const ch2 = drawFloorChoices(makeRng(`preboss2-${i}`), { count: 3, force: ["shop"] });
    ok(ch2.some((c) => c.id === "shop"), `force=shop で必ずショップが出る (#${i})`);
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
  // 既定（lineup未設定）：パーティ順 you,a が着卓・b が控え（固定）。控え=3人目の能力。
  ok(benchAbilityIds(r3).length >= 1, "既定で控え能力あり");
  // lineupで b を2番目に繰り上げ→ you,b が着卓、a が控え。
  r3.lineup = ["you", "b", "a"];
  const seats = seatedAllies(r3).map((m) => m.id);
  eq(seats[0], "you", "lineup: 席0=you");
  eq(seats[1], "b", "lineup: 席1=b（繰り上げ）");
  ok(benchAbilityIds(r3).includes("chunchan"), "lineup: a(chunchan)が控え");
  ok(!benchAbilityIds(r3).includes("danger-sense"), "lineup: b(danger-sense)は着卓で控えに出さない");
}

// 着卓は固定＝HPで自動入れ替えしない（「勝手に入れ替わる」対策）
{
  const p3 = [
    { id: "a", char: { id: "a", abilities: [] }, avatarHpMax: 25000 },
    { id: "b", char: { id: "b", abilities: [] }, avatarHpMax: 25000 },
    { id: "c", char: { id: "c", abilities: [] }, avatarHpMax: 25000 },
  ];
  const r = newRun(p3, "noswap");
  // 着卓中の b が控え c よりHP低くなっても、自動で c に入れ替えない（並び順固定）。
  r.party[1].hp = 100; r.party[2].hp = 900;
  const s = seatedAllies(r).map((m) => m.id);
  eq(s[0], "a", "固定: 席0=a(you)");
  eq(s[1], "b", "固定: 席1=b（HPが低くても自動で控えcに入れ替えない）");
  // 着卓が倒れたときだけ控えが繰り上がる（戦死は埋めるしかない）。
  r.party[1].hp = 0;
  eq(seatedAllies(r)[1].id, "c", "着卓が倒れたら控えcが繰り上がる");
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
  eq(stock.length, 6, "ショップ在庫＝バフ2＋道具1＋回復＋最大HP＋能力の源");
  ok(stock.some((it) => it.type === "heal") && stock.some((it) => it.type === "maxhp"), "回復/最大HP商品あり");
  ok(stock.some((it) => it.type === "source"), "能力の源が並ぶ（上限未満）");
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
applyEffect(run, { kind: "addBench" }); // PT枠増加カードは廃止（3人固定）だが effect kind は存続
eq(run.mods.benchSlots, 1, "addBench 効果で控え枠+1");

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
// 敵が和了したら dealMul は掛からない（味方失点には軽減＋翻数係数・floor1はfdm=1）
// 敵席1が 3000 でロン（勝者得点を席1に入れる＝翻数判定の正典）。3000=安手帯→係数で軽くなる。
dd = rogueliteDamageDeltas(run, { deltas: [-3000, 3000, 0, 0], roles, winnerSeat: 1 });
eq(dd[0], Math.round(-3000 * DAMAGE_SCALE * 0.9 * hanTierMul(3000)), "敵和了時は味方失点に軽減＋翻数係数（安手は軽い・floor1）");

// ---------- 一撃死上限（hpMax を渡すと最大HP比で被ダメをクランプ） ----------
{
  const r = newRun(party, "cap"); r.floor = 6; // 深度浅め＝cap基準
  const hpMax = [1000, 0, 1000, 0];
  // 敵の特大ツモを席0が受ける（fdm込みでも cap=lethalCapFrac(6)*1000 を超えない）
  const dCap = rogueliteDamageDeltas(r, { deltas: [-99999, 0, 0, 0], roles, winnerSeat: 1, hpMax });
  const cap = Math.round(1000 * lethalCapFrac(6));
  eq(dCap[0], -cap, "1ハンドの被ダメは最大HP比の上限でクランプ");
  eq(lethalCapFrac(1), lethalCapFrac(40), "中盤(F40)まで上限は固定＝満タン一撃死なし");
  ok(lethalCapFrac(40) < lethalCapFrac(60), "上限は深層(F40超)で緩む＝一撃死が戻る");
  eq(lethalCapFrac(63), 1, "十分深ければ上限なし（=1.0・F63前後）");
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
  // 深いフロアで、敵の攻撃（winner=enemy）→味方失点に fdm＋翻数係数が乗る。味方の自摸（winner=ally）→乗らない。
  const r = newRun(party, "depth"); r.floor = 20;
  // 敵が満貫(8000)ロン（勝者得点を席1に）。味方の自摸被弾(同士討ち)と比べて遥かに重い。
  const enemyHit = rogueliteDamageDeltas(r, { deltas: [-8000, 8000, 0, 0], roles, winnerSeat: 1 });
  const allyTsumo = rogueliteDamageDeltas(r, { deltas: [8000, 0, -8000, 0], roles, winnerSeat: 0 });
  ok(Math.abs(enemyHit[0]) > Math.abs(allyTsumo[2]) * 3, "敵の攻撃は深度倍率＋翻数で重い／味方の自摸被弾は軽い");
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

// ---------- 道具（B案：3スロット・消費/常設/自動） ----------
{
  // マスタ整合
  for (const it of ROGUELITE_ITEM_MASTER) {
    ok(it.id && it.name && it.desc, `道具に文言: ${it.id}`);
    ok(ITEM_KIND_META[it.kind], `道具の種別が妥当: ${it.id}=${it.kind}`);
  }
  const r = newRun(party, "items");
  eq(r.items.length, 0, "道具は0スロットスタート");
  // 消費：治癒の霊薬＝生存メンバー回復
  r.party[0].hp = 100; r.items = ["heal-potion"];
  const res = useItem(r, "heal-potion");
  ok(res.ok && r.items.length === 0, "治癒の霊薬は使うと消費される");
  ok(r.party[0].hp > 100, "治癒の霊薬で回復した");
  // 次戦効果：弱体の札→run.nextBattle.enemyHpMul、takeNextBattleで取り出しクリア
  r.items = ["weaken-talisman"]; useItem(r, "weaken-talisman");
  eq(r.nextBattle.enemyHpMul, 0.75, "弱体の札で次戦の敵HP係数");
  const nb = takeNextBattle(r);
  eq(nb.enemyHpMul, 0.75, "takeNextBattle で取り出せる");
  eq(Object.keys(r.nextBattle).length, 0, "取り出したらクリア");
  // 地図の写し＝reroll（routeReroll++）
  r.items = ["map-copy"]; const rr = useItem(r, "map-copy");
  eq(rr.action, "reroll", "地図の写しは reroll を返す");
  eq(r.routeReroll, 1, "routeReroll が増える");
  // 鍛えの一服＝スキルLv+1
  r.items = ["forge-tea"]; useItem(r, "forge-tea");
  eq(r.skillLevel, 2, "鍛えの一服でスキルLv+1");
  // 常設：商人の天秤=光貨×1.3 / 強運=レア度+ / 軽身=fdm緩和 / 癒し=回復×1.5
  const rp = newRun(party, "passive");
  rp.items = ["merchant-scale", "lucky-charm", "light-body", "healing-censer"];
  const im = itemMods(rp);
  ok(Math.abs(im.coinMul - 1.3) < 1e-9, "商人の天秤 coinMul=1.3");
  ok(im.draftRarityBonus >= 0.2, "強運の根付 draftRarityBonus");
  ok(im.fdmReduceFrac >= 0.2, "軽身の符 fdmReduce");
  ok(Math.abs(im.healMul - 1.5) < 1e-9, "癒しの香炉 healMul=1.5");
  // 自動：酔い止め＝宴会で消費
  const rt = newRun(party, "trigger"); rt.items = ["sober-charm"];
  ok(consumeBanquetCharm(rt) && rt.items.length === 0, "酔い止めは宴会で消費される");
  ok(!consumeBanquetCharm(newRun(party, "none")), "酔い止め未所持なら何もしない");
  // drawItems は未所持から
  const drawn = drawItems(makeRng("it"), { count: 2, exclude: ["heal-potion"] });
  ok(drawn.every((x) => x.id !== "heal-potion"), "drawItems は exclude を避ける");
  eq(ITEM_SLOTS, 3, "スロットは3");
}

// ---------- 中断ランの一時セーブ（serialize/deserialize 往復） ----------
{
  const r = newRun(party, "save");
  r.floor = 7; r.coins = 88; r.skillLevel = 3; r.cleared = 6;
  r.items = ["heal-potion", "merchant-scale"]; r.nextBattle = { dealMul: 1.3 }; r.routeReroll = 2;
  r.lineup = ["pal", "you"]; r.eventSeen = true;
  applyCard(r, cardById("deal-up-rare")); // dealMul 変化
  r.party[1].hp = 123; r.party[1].hungover = true;
  const data = serializeRun(r);
  ok(!data.party[0].char, "シリアライズは char を保存しない（id のみ）");
  const resolve = (id) => party.find((p) => p.id === id)?.char || null;
  const back = deserializeRun(data, resolve);
  eq(back.floor, 7, "復元: floor");
  eq(back.coins, 88, "復元: coins");
  eq(back.skillLevel, 3, "復元: skillLevel");
  eq(back.items.join(","), "heal-potion,merchant-scale", "復元: items");
  eq(back.nextBattle.dealMul, 1.3, "復元: nextBattle");
  eq(back.routeReroll, 2, "復元: routeReroll");
  eq(back.lineup.join(","), "pal,you", "復元: lineup");
  ok(back.eventSeen, "復元: eventSeen");
  ok(Math.abs(back.mods.dealMul - r.mods.dealMul) < 1e-9, "復元: mods.dealMul");
  eq(back.party[1].hp, 123, "復元: メンバーHP");
  ok(back.party[1].hungover, "復元: 二日酔い");
  ok(back.party[0].char === resolve("you"), "復元: char を id から再解決");
  // バージョン不一致・メンバー解決不能は復元失敗（null＝再開させない）
  eq(deserializeRun({ ...data, v: 99 }, resolve), null, "バージョン不一致は null");
  eq(deserializeRun(data, () => null), null, "メンバー解決不能は null");
  eq(deserializeRun(null, resolve), null, "null データは null");
}

// 一撃死緩和＋次戦バフが rogueliteDamageDeltas に効く（battleMods）
{
  const r = newRun(party, "bmods"); r.floor = 12; // 深度倍率が立つ階（floorDmgStart=8 以降）
  const base = rogueliteDamageDeltas(r, { deltas: [0, -8000, 0, 0], roles, winnerSeat: 0 })[1];
  const drum = rogueliteDamageDeltas(r, { deltas: [0, -8000, 0, 0], roles, winnerSeat: 0, battleMods: { dealMul: 1.3 } })[1];
  ok(Math.abs(drum) > Math.abs(base), "鼓舞の陣太鼓（battleMods.dealMul）で与ダメ増");
  // 軽身の符（passive fdm緩和）：被ダメが軽くなる。HP最大は大きめにして一撃死上限に張り付かせない
  // （深層は被ダメ倍率が大きく、上限で頭打ちになると差が出ないため）。
  const enemyHit = rogueliteDamageDeltas(r, { deltas: [-3000, 0, 0, 0], roles, winnerSeat: 1, hpMax: [1000000, 0, 1000000, 0] })[0];
  const rl = newRun(party, "bmods2"); rl.floor = 12; rl.items = ["light-body"];
  const enemyHitLight = rogueliteDamageDeltas(rl, { deltas: [-3000, 0, 0, 0], roles, winnerSeat: 1, hpMax: [1000000, 0, 1000000, 0] })[0];
  ok(Math.abs(enemyHitLight) < Math.abs(enemyHit), "軽身の符で深層被ダメが軽くなる");
}

// ---- バイオーム（層）----
{
  const { ROGUELITE_BIOME_MASTER, biomeForBand, bandOfFloor, biomeEffectChips, biomeById } = await import("../src/data/rogueliteBiomeMaster.js");
  eq(bandOfFloor(1), 0, "F1=帯0"); eq(bandOfFloor(10), 0, "F10=帯0"); eq(bandOfFloor(11), 1, "F11=帯1"); eq(bandOfFloor(21), 2, "F21=帯2");
  for (let s = 0; s < 12; s++) eq(biomeForBand(`b0-${s}`, 0).id, "ruins", `帯0は必ず中立(${s})`);
  // minBand ゲート：奈落(minBand3)は帯1〜2では出ない、帯3以降で出うる。
  for (let s = 0; s < 60; s++) ok(biomeForBand(`g1-${s}`, 1).id !== "abyss", `奈落は帯1で出ない(${s})`);
  for (let s = 0; s < 60; s++) ok(biomeForBand(`g2-${s}`, 2).id !== "abyss", `奈落は帯2で出ない(${s})`);
  ok([...Array(200)].some((_, s) => biomeForBand(`g3-${s}`, 3).id === "abyss"), "奈落は帯3以降で出うる");
  // 通常(中立)層は帯1以降も確率で当選し、深いほど出にくい。
  const neutralRate = (band) => [...Array(300)].filter((_, s) => biomeForBand(`nr-${s}`, band).id === "ruins").length / 300;
  ok(neutralRate(1) > 0.15, "帯1で通常層がそこそこ出る");
  ok(neutralRate(5) < neutralRate(1), "深いほど通常層が出にくい");
  // 直前帯と同じ層は避ける（決定論）
  for (let s = 0; s < 80; s++) { const a = biomeForBand(`rep-${s}`, 4), b = biomeForBand(`rep-${s}`, 5); ok(!(a.id !== "ruins" && a.id === b.id), `連続回避(${s})`); }
  // 効果チップ：奈落はHP最大減チップを持つ
  ok(biomeEffectChips(biomeById("abyss")).some((c) => /HP最大/.test(c.t)), "奈落チップにHP最大減");
  ok(biomeEffectChips(biomeById("ruins")).some((c) => /特殊効果なし/.test(c.t)), "中立は特殊効果なしチップ");
  for (const bdef of ROGUELITE_BIOME_MASTER) ok(bdef.id && bdef.name && bdef.bg && bdef.glyph, `biome 必須項目: ${bdef.id}`);
  // 巡りの賽：reroll で層が変わりうる／reroll 0 は従来と同一（後方互換）。
  const { biomeForFloor, biomeOf } = await import("../src/data/rogueliteBiomeMaster.js");
  eq(biomeForBand("x", 2, 0).id, biomeForBand("x", 2).id, "reroll=0 は従来と同一");
  ok([...Array(80)].some((_, s) => biomeForBand(`rr-${s}`, 2, 1).id !== biomeForBand(`rr-${s}`, 2, 0).id), "reroll=1 で層が変わりうる");
  { // biomeOf が run.biomeRerolls を反映
    const r = { seed: "bz", floor: 21, biomeRerolls: {} };
    const a = biomeOf(r); r.biomeRerolls[2] = 1; const b = biomeOf(r);
    ok(a.id === biomeForFloor("bz", 21, 0).id && b.id === biomeForFloor("bz", 21, 1).id, "biomeOf が帯ごとの reroll を見る");
  }
}
// 巡りの賽（道具）：floor-select 使用対象外／消費ヘルパ
{
  const { isActiveItem, biomeDieId, consumeBiomeDie } = await import("../src/roguelite/itemEffects.js");
  const { itemById } = await import("../src/data/rogueliteItemMaster.js");
  ok(itemById("biome-dice"), "巡りの賽が存在");
  ok(!isActiveItem("biome-dice"), "巡りの賽はフロア選択の使用対象外");
  ok(isActiveItem("heal-potion"), "通常の消費道具は使用対象");
  const run = { items: ["biome-dice", "heal-potion"] };
  eq(biomeDieId(run), "biome-dice", "賽の所持判定");
  ok(consumeBiomeDie(run) && !run.items.includes("biome-dice"), "賽を消費して消える");
  ok(!consumeBiomeDie(run), "賽が無ければ消費しない");
}
// 必殺技は常に最高(legendary)かその1つ下(epic)／役満ご祝儀＝オールレジェンダリー
{
  for (const c of ROGUELITE_CARD_MASTER) {
    if (c.effect?.kind === "grantAbility") ok(["epic", "legendary"].includes(c.rarity), `必殺技は epic/legendary: ${c.id}=${c.rarity}`);
  }
  // forceRarity:"legendary" は全てレジェンダリー（在庫4枚＝3枚引ける）
  for (let s = 0; s < 30; s++) {
    const d = drawCards(makeRng(`leg-${s}`), { count: 3, forceRarity: "legendary" });
    ok(d.length === 3 && d.every((c) => c.rarity === "legendary"), `forceRarity=legendary で全レジェ(${s})`);
  }
  // rollDraft allLegendary も全レジェ
  const run = newRun(party, "yaktest"); run.floor = 7;
  const d = rollDraft(run, { allLegendary: true });
  ok(d.length === 3 && d.every((c) => c.rarity === "legendary"), "rollDraft allLegendary は全レジェ");
}
// HP成長は既定で青天井（上限なし）＝取れば必ず伸びる（「+90%で凍結＝壊れて見える」対策）。
// ランが終わるのは被ダメ青天井が担保するのでHP上限は不要。hpMulCap は検証用ノブ（数値時のみクランプ）。
{
  const { BUFF_TUNE } = await import("../src/roguelite/cardEffects.js");
  ok(BUFF_TUNE.hpMulCap == null, "既定は hpMulCap=null（HP上限なし）");
  // 既定（上限なし）：積むほど伸び続ける（途中で凍結しない）。
  const run = newRun(party, "hpcap");
  const base = run.party[0].hpMax;
  let prev = run.mods.hpMul;
  for (let i = 0; i < 20; i++) { applyEffect(run, { kind: "maxHpUp", mul: 1.4 }); ok(run.mods.hpMul > prev, "HPバフは取るたび必ず増える（凍結しない）"); prev = run.mods.hpMul; }
  ok(run.mods.hpMul > 5 && run.party[0].hpMax > base * 5, `青天井で大きく伸びる (hpMul=${run.mods.hpMul.toFixed(1)})`);
  // 検証ノブ：cap を数値にするとその倍率で頭打ち（掃引テスト用の経路が生きている）。
  BUFF_TUNE.hpMulCap = 1.9;
  try {
    const run2 = newRun(party, "hpcap2");
    const base2 = run2.party[0].hpMax;
    for (let i = 0; i < 20; i++) applyEffect(run2, { kind: "maxHpUp", mul: 1.4 });
    ok(run2.mods.hpMul <= 1.9 + 1e-6, `cap=1.9 指定時は上限以下 (${run2.mods.hpMul.toFixed(2)})`);
    ok(run2.party[0].hpMax <= Math.round(base2 * 1.9) + 2, "cap指定時は hpMax も上限内");
  } finally { BUFF_TUNE.hpMulCap = null; } // 他テストへ漏らさない
}

// ボス＝プレイアブルキャラ（編成中＋弟子は除外）／強敵＝ネームドモブ
{
  const { CHARACTER_MASTER } = await import("../src/data/characterMaster.js");
  const cmIds = new Set(CHARACTER_MASTER.map((c) => c.id));
  const party2 = [
    { id: "shiyue", char: { id: "shiyue" }, avatarHpMax: 14000 },
    { id: "kuidoshi", char: { id: "kuidoshi" }, avatarHpMax: 13000 },
  ];
  const run = newRun(party2, "bossplay"); run.floor = 10;
  const boss = enemyUnitForFloor(run, { enemy: "boss" });
  ok(boss.isBoss && boss.members.length === 2, "ボスは2人");
  ok(boss.members.every((m) => cmIds.has(m.id.replace(/^boss:/, ""))), "ボスはプレイアブルキャラ実体");
  ok(!boss.members.some((m) => /shiyue|kuidoshi/.test(m.id)), "編成中キャラはボスに出ない");
  ok(boss.members.some((m) => (m.abilities || []).length > 0), "ボスは本人の能力を持つ");
  ok(boss.members.every((m) => !m.isMob), "ボスはモブ扱いでない（実立ち絵）");
  const elite = enemyUnitForFloor(run, { enemy: "named" });
  ok(elite.isElite && elite.members.some((m) => m.isElite), "強敵はネームドモブ");
}

// 荒牌平局フラグ（楼光のノーテン罰符ダメージのトリガ）
{
  const seated = CHARACTERS.slice(0, 4).map((c) => ({ character: c, abilities: instantiateAbilities(c) }));
  const g = new Game(seated, -1, 1, { maxRounds: 1 });
  g._exhaustiveDraw();
  ok(g.lastResult?.draw === true, "荒牌＝draw");
  ok(g.lastResult?.exhaustive === true, "荒牌平局に exhaustive フラグ（途中流局と区別）");
  ok(Array.isArray(g.lastResult?.tenpai) && g.lastResult.tenpai.length === 4, "tenpai 配列（ノーテン判定用）");
  // ノーテン罰符の想定計算（main.js 側のUI処理と同じ式）：最大HP×20%、カリュブディスで×3。
  const dmg20 = Math.round(1000 * 0.20), dmg60 = Math.round(1000 * 0.20 * 3);
  eq(dmg20, 200, "ノーテン罰符 20%=200"); eq(dmg60, 600, "カリュブディス3倍=600");
}

// ── 提案A：流派（クラスター）しきい値シナジー（スライス1＝染め么九流） ──────────────
{
  const party = CHARACTERS.slice(0, 3).map((c) => ({ id: c.id, hp: 1000, hpMax: 1000, baseHp: 1000 }));

  // マスタ整合：CLUSTER_META と CLUSTER_SYNERGY のキーが一致／flush が定義済み。
  ok(CLUSTER_META.flush && CLUSTER_SYNERGY.flush, "flush 流派が CLUSTER_META/SYNERGY に存在");
  ok(Object.keys(CLUSTER_SYNERGY).every((k) => CLUSTER_META[k]), "全シナジーに表示メタがある");
  // 染め札のタグ整合（rootou＝核／flush-omote・flush-tetsu＝スケーラ）。
  eq(clusterOf(cardById("grant-rootou")), "flush", "老頭の構え＝flush 核");
  eq(clusterOf(cardById("flush-omote")), "flush", "一色への傾倒＝flush");
  eq(clusterOf(cardById("flush-tetsu")), "flush", "孤高の一色＝flush");
  eq(clusterOf(cardById("heal-small")), null, "無所属カードは cluster=null");

  // 集計：applyCard で clusterCount が積まれる。
  const run = newRun(party, "cluster-flush");
  run.clusterTierCap = 2; // この節はシナジー計算式の検証＝2段目まで解放した状態（段キャップ自体の検証は別節）
  eq(run.mods.clusterCount.flush || 0, 0, "初期 flush=0");
  applyCard(run, cardById("grant-rootou"));      // flush 1
  applyCard(run, cardById("flush-omote"));        // flush 2
  eq(run.mods.clusterCount.flush, 2, "染め札2枚で flush=2");

  // しきい値未達（2枚）＝染め手でもボーナスなし。
  eq(clusterDealMul(run, { flushWin: true }), 1, "2枚＝開眼前は与ダメ倍率1");
  // 非染め手＝しきい値到達でも発火しない。
  applyCard(run, cardById("flush-tetsu"));        // flush 3（開眼）
  eq(run.mods.clusterCount.flush, 3, "染め札3枚で flush=3");
  eq(clusterDealMul(run, { flushWin: false }), 1, "染め手でない局はシナジー不発");
  // 開眼（3枚）＋染め手＝+50%。
  eq(Math.round(clusterDealMul(run, { flushWin: true }) * 100), 150, "3枚＋染め手＝×1.5（開眼+50%）");

  // 極み（5枚）＝最大段 +110%（累積しない＝段で跳ねる）。
  applyCard(run, cardById("flush-omote")); applyCard(run, cardById("flush-omote")); // flush 5
  eq(run.mods.clusterCount.flush, 5, "染め札5枚で flush=5");
  eq(Math.round(clusterDealMul(run, { flushWin: true }) * 100), 210, "5枚＋染め手＝×2.1（極み+110%・段は累積しない）");

  // legible：進捗（現在枚数・次のしきい値・開眼済み段数）。
  const prog = clusterProgress(run).find((p) => p.cluster === "flush");
  ok(prog && prog.count === 5 && prog.reached === 2 && prog.nextAt === null, "進捗＝5枚/2段開眼/次なし");
  const run2 = newRun(party, "cluster-prog2"); applyCard(run2, cardById("grant-rootou"));
  const prog2 = clusterProgress(run2).find((p) => p.cluster === "flush");
  ok(prog2 && prog2.count === 1 && prog2.nextAt === 3, "1枚時の次しきい値は3");

  // 後方互換：clusterCount を持たない古いセーブでも resolver が落ちない。
  eq(clusterDealMul({ mods: {} }, { flushWin: true }), 1, "clusterCount 無しでも安全（後方互換）");

  // シリアライズ往復で clusterCount が保たれる。
  const round = deserializeRun(serializeRun(run), (id) => party.find((p) => p.id === id) || { id, hp: 1000, hpMax: 1000, baseHp: 1000 });
  eq(round.mods.clusterCount.flush, 5, "シリアライズ往復で flush=5 が保持");
}

// ── 提案A スライス2：守備耐久流（guard）＝被ダメ上限を締める分散低減（P3） ──────────
{
  const party = CHARACTERS.slice(0, 3).map((c) => ({ id: c.id, hp: 1000, hpMax: 1000, baseHp: 1000 }));

  // マスタ整合：guard 流派とタグ。
  ok(CLUSTER_META.guard && CLUSTER_SYNERGY.guard?.takeCap, "guard 流派＝takeCap シナジーが存在");
  eq(clusterOf(cardById("grant-danger-sense")), "guard", "危険感知＝guard 核");
  eq(clusterOf(cardById("take-down-common")), "guard", "薄い守り＝guard");
  eq(clusterOf(cardById("take-down-rare")), "guard", "堅い構え＝guard");
  eq(clusterOf(cardById("ally-tsumo-ward")), "guard", "庇いの守り＝guard");
  eq(clusterOf(cardById("fortress")), "guard", "不動の城壁＝guard");

  // takeCap 解決：未達=null、3枚=0.30、5枚=0.20（最も低い達成段）。
  const run = newRun(party, "cluster-guard");
  run.clusterTierCap = 2; // 計算式検証＝2段目(不抜)まで解放
  eq(clusterTakeCapFrac(run), null, "守備0枚＝既定上限（null）");
  applyCard(run, cardById("take-down-common")); applyCard(run, cardById("take-down-common")); // 2
  eq(clusterTakeCapFrac(run), null, "守備2枚＝まだ締まらない（null）");
  applyCard(run, cardById("grant-danger-sense")); // 3（核）
  eq(run.mods.clusterCount.guard, 3, "守備3枚");
  eq(clusterTakeCapFrac(run), 0.30, "守備3枚＝被ダメ上限0.30（鉄壁）");
  applyCard(run, cardById("take-down-common")); applyCard(run, cardById("ally-tsumo-ward")); // 5
  eq(run.mods.clusterCount.guard, 5, "守備5枚");
  eq(clusterTakeCapFrac(run), 0.20, "守備5枚＝被ダメ上限0.20（不抜・最も低い段）");

  // 被ダメ層への反映：守備上限が既定(深度由来)より固いとき、実際に被ダメがクランプされる。
  // 敵ロン(席1が勝者)で席0の味方が大きく被弾するケースを、守備なし vs 守備5枚で比較。
  const roles = ["ally", "enemy", "ally", "enemy"];
  const hpMax = [1000, 1000, 1000, 1000];
  const bigLoss = [-32000, 32000, 0, 0]; // 役満級の素点（HP変換前）
  const bare = newRun(party.map((p) => ({ ...p })), "guard-dmg-bare");
  const dmgBare = rogueliteDamageDeltas(bare, { deltas: bigLoss.slice(), roles, winnerSeat: 1, hpMax, battleMods: {} });
  const fort = newRun(party.map((p) => ({ ...p })), "guard-dmg-fort");
  fort.clusterTierCap = 2; // 計算式検証＝2段目(不抜0.20)まで解放
  // 守備6枚（≧5）＝被ダメ上限0.20。applyCard は集計のみ（maxStacks は draft 除外で別管理）。
  for (let k = 0; k < 5; k++) applyCard(fort, cardById("take-down-common"));
  applyCard(fort, cardById("grant-danger-sense"));
  eq(clusterTakeCapFrac(fort), 0.20, "守備6枚＝上限0.20");
  const dmgFort = rogueliteDamageDeltas(fort, { deltas: bigLoss.slice(), roles, winnerSeat: 1, hpMax, battleMods: {} });
  ok(Math.abs(dmgFort[0]) < Math.abs(dmgBare[0]), "守備流は被ダメが既定より固く締まる");
  ok(Math.abs(dmgFort[0]) <= Math.round(1000 * 0.20) + 1, "守備5枚以上で席0被ダメは最大HPの20%以下");

  // legible：guard の進捗チップは「鉄壁」呼称（攻めの開眼と別）。
  const prog = clusterProgress(run).find((p) => p.cluster === "guard");
  ok(prog && prog.count === 5 && prog.reached === 2 && prog.nextAt === null, "guard 進捗＝5枚/2段/次なし");
  eq(CLUSTER_META.guard.awaken, "鉄壁", "guard の到達呼称は鉄壁");

  // 攻め(flush)と守り(guard)が独立して同居できる。
  const mix = newRun(party, "cluster-mix");
  applyCard(mix, cardById("grant-rootou")); applyCard(mix, cardById("flush-omote")); applyCard(mix, cardById("flush-tetsu")); // flush3
  applyCard(mix, cardById("take-down-common")); applyCard(mix, cardById("take-down-rare")); applyCard(mix, cardById("brace-common")); // guard3
  eq(Math.round(clusterDealMul(mix, { flushWin: true }) * 100), 150, "混色：染め3で×1.5");
  eq(clusterTakeCapFrac(mix), 0.30, "混色：守備3で上限0.30");
}

// ── 提案A スライス3：速攻(tempo)・打点(value)流派＋発火条件の差別化 ─────────────────
{
  const party = CHARACTERS.slice(0, 3).map((c) => ({ id: c.id, hp: 1000, hpMax: 1000, baseHp: 1000 }));

  // 4流派が出揃い、各 deal 流派は別トリガーで差別化されている。
  ok(CLUSTER_META.tempo && CLUSTER_META.value, "tempo/value 流派メタが存在");
  eq(CLUSTER_SYNERGY.tempo.deal.trigger, "tsumoWin", "速攻＝ツモ和了で発火");
  eq(CLUSTER_SYNERGY.value.deal.trigger, "bigWin", "打点＝満貫以上で発火");
  eq(CLUSTER_SYNERGY.flush.deal.trigger, "flushWin", "染め＝染め手で発火");
  const dealSyns = Object.values(CLUSTER_SYNERGY).filter((s) => s.deal);
  const triggers = new Set(dealSyns.map((s) => s.deal.trigger));
  eq(triggers.size, dealSyns.length, "deal系流派はすべて別トリガー（差別化・重複なし）");

  // タグ整合（核＋スケーラ）。
  eq(clusterOf(cardById("grant-lucky-draw")), "tempo", "幸運のツモ＝tempo核");
  eq(clusterOf(cardById("ride-the-wave")), "tempo", "波に乗る＝tempo");
  eq(clusterOf(cardById("tempo-sen")), "tempo", "先手の気構え＝tempo");
  eq(clusterOf(cardById("grant-dora-pull")), "value", "ドラ手繰り＝value核");
  eq(clusterOf(cardById("backwater-riichi")), "value", "背水のリーチ＝value");
  eq(clusterOf(cardById("deal-up-legend")), "value", "天衣無縫＝value（warping札を流派へ再配置）");
  eq(clusterOf(cardById("value-tame")), "value", "打点への布石＝value");

  // 速攻：ツモ和了でのみ跳ねる（ロン和了では不発）。
  const t = newRun(party, "cluster-tempo");
  applyCard(t, cardById("tempo-sen")); applyCard(t, cardById("tempo-sen")); applyCard(t, cardById("tempo-sen")); // tempo 3
  eq(clusterDealMul(t, { tsumoWin: true }), 1.4, "速攻3＋ツモ＝×1.4（加速）");
  eq(clusterDealMul(t, { tsumoWin: false }), 1, "速攻3＋ロン＝不発");

  // 打点：満貫以上でのみ跳ねる。
  const v = newRun(party, "cluster-value");
  applyCard(v, cardById("grant-dora-pull")); applyCard(v, cardById("backwater-riichi")); applyCard(v, cardById("value-tame")); // value 3
  eq(clusterDealMul(v, { bigWin: true }), 1.5, "打点3＋満貫＝×1.5（会心）");
  eq(clusterDealMul(v, { bigWin: false }), 1, "打点3＋安手＝不発");

  // 複数トリガー該当（ツモの満貫染め手）は掛け合わさる＝混色コミットのご褒美。
  const all = newRun(party, "cluster-all");
  applyCard(all, cardById("flush-omote")); applyCard(all, cardById("flush-omote")); applyCard(all, cardById("flush-omote")); // flush 3
  applyCard(all, cardById("tempo-sen")); applyCard(all, cardById("tempo-sen")); applyCard(all, cardById("tempo-sen")); // tempo 3
  applyCard(all, cardById("value-tame")); applyCard(all, cardById("value-tame")); applyCard(all, cardById("value-tame")); // value 3
  const triple = clusterDealMul(all, { flushWin: true, tsumoWin: true, bigWin: true });
  eq(Math.round(triple * 100), Math.round(1.5 * 1.4 * 1.5 * 100), "ツモ満貫染め手＝3流派が掛かる(×1.5×1.4×1.5)");
  // 1つだけ該当なら1流派分のみ。
  eq(clusterDealMul(all, { flushWin: true, tsumoWin: false, bigWin: false }), 1.5, "染め手のみ＝染め分だけ");
}

// ── 提案A スライス5：ドラフト時シナジー予告（clusterPickPreview） ──────────────────
{
  const party = CHARACTERS.slice(0, 3).map((c) => ({ id: c.id, hp: 1000, hpMax: 1000, baseHp: 1000 }));
  const run = newRun(party, "preview");
  // 無所属カードは null。
  eq(clusterPickPreview(run, cardById("heal-small")), null, "無所属カードは予告なし");
  // 染め0枚→1枚目を取る：crosses=false、開眼(at3)まであと2。
  let pv = clusterPickPreview(run, cardById("grant-rootou"));
  ok(pv && pv.from === 0 && pv.to === 1 && !pv.crosses && pv.nextAt === 3, "染め1枚目＝開眼まであと2(nextAt3)");
  // 染め2枚所持→3枚目で「取ると開眼」(crosses=true)。
  applyCard(run, cardById("flush-omote")); applyCard(run, cardById("flush-omote"));
  pv = clusterPickPreview(run, cardById("grant-rootou"));
  ok(pv && pv.from === 2 && pv.to === 3 && pv.crosses, "染め3枚目を取ると開眼(crosses)");
  eq(pv.awaken, "開眼", "染めの呼称は開眼");
  // 守備の呼称は鉄壁、取ると到達で crosses。
  const g = newRun(party, "preview-g");
  applyCard(g, cardById("take-down-common")); applyCard(g, cardById("take-down-common"));
  const pg = clusterPickPreview(g, cardById("grant-danger-sense"));
  ok(pg && pg.crosses && pg.awaken === "鉄壁", "守備3枚目を取ると鉄壁(crosses)");
}

// ── QA反映：必殺技忘却での clusterCount desync 防止（recomputeClusterCount） ──────────
{
  const party = CHARACTERS.slice(0, 3).map((c) => ({ id: c.id, hp: 1000, hpMax: 1000, baseHp: 1000 }));
  const run = newRun(party, "forget-cluster");
  applyCard(run, cardById("grant-rootou"));   // flush 1（付与札）
  applyCard(run, cardById("flush-omote"));     // flush 2
  applyCard(run, cardById("flush-omote"));     // flush 3（開眼）
  eq(run.mods.clusterCount.flush, 3, "染め3（うち付与札1）");
  eq(clusterTakeCapFrac({ mods: {} }), null, "空modsでtakeCap安全(再掲)");
  // 付与札(grant-rootou)を手放した想定：run.cards から除いて再集計＝オーバーカウントしない。
  run.cards.splice(run.cards.indexOf("grant-rootou"), 1);
  recomputeClusterCount(run);
  eq(run.mods.clusterCount.flush, 2, "付与札を忘却→染め2へ正しく減る（desyncしない）");
  eq(clusterDealMul(run, { flushWin: true }), 1, "忘却後は開眼未達＝シナジー不発（オーバーカウント防止）");
  // 再集計は run.cards が単一情報源：全カード除去で0に。
  run.cards.length = 0; recomputeClusterCount(run);
  eq(run.mods.clusterCount.flush || 0, 0, "全除去で0");
}

// ── 博打(gamble)流派＝守備の真逆・高分散（5本目） ───────────────────────────────
{
  const party = CHARACTERS.slice(0, 3).map((c) => ({ id: c.id, hp: 1000, hpMax: 1000, baseHp: 1000 }));
  ok(CLUSTER_META.gamble && CLUSTER_SYNERGY.gamble?.deal && CLUSTER_SYNERGY.gamble?.takeRaise, "博打＝deal(anyWin)＋takeRaise の両刃シナジー");
  eq(CLUSTER_SYNERGY.gamble.deal.trigger, "anyWin", "博打＝どんな和了でも発火(anyWin)");
  eq(clusterOf(cardById("gamble-ittetsu")), "gamble", "乾坤一擲＝gamble");
  eq(clusterOf(cardById("last-stand")), "gamble", "火事場＝gamble(再配置)");
  eq(clusterOf(cardById("gamble-odds")), "gamble", "丁か半か＝gamble");

  const g = newRun(party, "cluster-gamble");
  g.clusterTierCap = 2; // 計算式検証＝2段目(一擲)まで解放
  applyCard(g, cardById("gamble-ittetsu")); applyCard(g, cardById("gamble-ittetsu")); applyCard(g, cardById("gamble-ittetsu")); // gamble 3
  eq(g.mods.clusterCount.gamble, 3, "博打3");
  // anyWin＝どんな和了でも +35%（ロンでもツモでも安手でも）。
  eq(clusterDealMul(g, { anyWin: true }), 1.35, "博打3＝どんな和了でも×1.35(総取り)");
  eq(clusterDealMul(g, { anyWin: false }), 1, "和了でなければ不発");
  // takeRaise＝被ダメ上限を上げる（守備の真逆）。0枚=0、3枚=+0.20、5枚=+0.45。
  eq(clusterTakeRaiseFrac(newRun(party, "g0")), 0, "博打0＝上限上げなし");
  eq(clusterTakeRaiseFrac(g), 0.20, "博打3＝被ダメ上限+0.20(大振り)");
  applyCard(g, cardById("gamble-odds")); applyCard(g, cardById("gamble-odds")); // gamble 5
  eq(clusterTakeRaiseFrac(g), 0.45, "博打5＝被ダメ上限+0.45");

  // 被ダメ層：博打は守備と逆＝同じ大被弾で被ダメ上限が緩み「より痛い」。
  const roles = ["ally", "enemy", "ally", "enemy"]; const hpMax = [1000, 1000, 1000, 1000];
  const big = [-32000, 32000, 0, 0];
  const bare = newRun(party.map((p) => ({ ...p })), "g-bare");
  const dmgBare = rogueliteDamageDeltas(bare, { deltas: big.slice(), roles, winnerSeat: 1, hpMax, battleMods: {} });
  const gam = newRun(party.map((p) => ({ ...p })), "g-raise");
  for (let k = 0; k < 5; k++) applyCard(gam, cardById("gamble-ittetsu"));
  const dmgGam = rogueliteDamageDeltas(gam, { deltas: big.slice(), roles, winnerSeat: 1, hpMax, battleMods: {} });
  ok(Math.abs(dmgGam[0]) >= Math.abs(dmgBare[0]), "博打は被ダメ上限が緩み、無策以上に痛い（高分散）");

  // legible：呼称は総取り。
  eq(CLUSTER_META.gamble.awaken, "総取り", "博打の到達呼称は総取り");
  const prog = clusterProgress(g).find((p) => p.cluster === "gamble");
  ok(prog && prog.count === 5 && prog.reached === 2, "博打進捗＝5枚/2段");
}

// ── 流派の段階解放（clusterTierCap）：初期1段目まで・ショップで2段目解放（ディレクション 2026-06-27） ──
{
  const party = CHARACTERS.slice(0, 3).map((c) => ({ id: c.id, hp: 1000, hpMax: 1000, baseHp: 1000 }));

  // newRun の既定は 1段目まで（開眼/鉄壁等）。
  const base = newRun(party, "tiercap-default");
  eq(base.clusterTierCap, 1, "newRun の既定 clusterTierCap=1（1段目まで）");

  // 染め5枚を積んでも、初期(cap=1)では1段目(+50%)止まり＝2段目(+110%)は効かない。
  const flush5 = (run) => { for (let k = 0; k < 5; k++) applyCard(run, cardById("flush-omote")); return run; };
  flush5(base);
  eq(base.mods.clusterCount.flush, 5, "染め5枚（枚数自体は積まれる）");
  eq(Math.round(clusterDealMul(base, { flushWin: true }) * 100), 150, "cap=1：5枚でも開眼(+50%)止まり＝極みは未解放");

  // ショップ「流派の極意」解放後（cap=2）は2段目(+110%)が効く＝同じ5枚で跳ねる。
  const unlocked = flush5(newRun(party, "tiercap-unlocked"));
  unlocked.clusterTierCap = 2;
  eq(Math.round(clusterDealMul(unlocked, { flushWin: true }) * 100), 210, "cap=2：5枚で極み(+110%)＝×2.1");

  // 守備も同様：cap=1 は5枚でも鉄壁(0.30)止まり、cap=2 で不抜(0.20)。
  const gd = newRun(party, "tiercap-guard"); for (let k = 0; k < 5; k++) applyCard(gd, cardById("take-down-common"));
  eq(clusterTakeCapFrac(gd), 0.30, "cap=1：守備5枚でも鉄壁(0.30)止まり");
  gd.clusterTierCap = 2;
  eq(clusterTakeCapFrac(gd), 0.20, "cap=2：守備5枚で不抜(0.20)");

  // legible：cap=1 では進捗の到達は1段、未解放しきい値(5)が lockedTiers に出る（玉ゲージの鍵表示の素）。
  const prog = clusterProgress(base).find((p) => p.cluster === "flush");
  ok(prog && prog.reached === 1 && prog.nextAt === null, "cap=1：5枚は開眼1段のみ・次の(解放済み)しきい値なし");
  ok(prog && Array.isArray(prog.lockedTiers) && prog.lockedTiers.includes(5) && prog.fullMax === 5, "cap=1：未解放しきい値5が lockedTiers/fullMax に見える");

  // 予告：cap=1 では極み(at5)への crosses を約束しない（取っても段は越えない）。
  const pv4 = newRun(party, "tiercap-pv"); for (let k = 0; k < 4; k++) applyCard(pv4, cardById("flush-omote"));
  const pv = clusterPickPreview(pv4, cardById("flush-omote"));
  ok(pv && pv.from === 4 && pv.to === 5 && !pv.crosses && pv.nextAt === null, "cap=1：5枚目を取っても極みは未解放＝crossesしない");

  // 継続同期：シリアライズ往復で clusterTierCap が保たれる（中断ラン再開で解放状態を失わない）。
  const rt = newRun(party, "tiercap-roundtrip"); rt.clusterTierCap = 2;
  const round = deserializeRun(serializeRun(rt), (id) => party.find((p) => p.id === id) || { id, hp: 1000, hpMax: 1000, baseHp: 1000 });
  eq(round.clusterTierCap, 2, "シリアライズ往復で clusterTierCap=2 を保持");
  // 旧セーブ（clusterTierCap 未保存）は 1 に寄せる（既定）。
  const legacy = serializeRun(newRun(party, "tiercap-legacy")); delete legacy.clusterTierCap;
  const restored = deserializeRun(legacy, (id) => party.find((p) => p.id === id) || { id, hp: 1000, hpMax: 1000, baseHp: 1000 });
  eq(restored.clusterTierCap, 1, "旧セーブ（未保存）は clusterTierCap=1 に復元");
}

// ---------- 提案B：ボス記憶（bossTally）の純関数＋対局前口上の照合 ----------
{
  // 段階(tier)判定：初遭遇/再戦/雪辱。
  eq(bossMemoryTier(undefined), "first", "記録なし＝初遭遇");
  eq(bossMemoryTier({ w: 0, l: 0 }), "first", "0-0＝初遭遇");
  eq(bossMemoryTier({ w: 2, l: 0 }), "rematch", "勝ち越し0敗＝再戦");
  eq(bossMemoryTier({ w: 0, l: 1 }), "revenge", "1敗＝雪辱");
  eq(bossMemoryTier({ w: 3, l: 1 }), "revenge", "敗北の記憶を最優先＝雪辱");
  eq(bossMemoryTier({ w: -5, l: -5 }), "first", "負値はクランプして初遭遇");

  // 勝敗記録は入力を破壊しない＆正しく加算。
  const t0 = {};
  const t1 = recordBossOutcome(t0, "shiyue", true);
  eq(Object.keys(t0).length, 0, "recordBossOutcome は入力を破壊しない");
  eq(t1.shiyue.w, 1, "勝利でw+1"); eq(t1.shiyue.l, 0, "勝利でlは据置");
  const t2 = recordBossOutcome(t1, "shiyue", false);
  eq(t2.shiyue.w, 1, "敗北でwは据置"); eq(t2.shiyue.l, 1, "敗北でl+1");
  eq(recordBossOutcome(t0, "", true).constructor, Object, "charId空でも安全（コピー返し）");

  // readBossTally：欠損/不正は安全に空へ正規化。
  eq(Object.keys(readBossTally(null)).length, 0, "profile無し＝空");
  eq(readBossTally({ roguelite: { bossTally: { kuidoshi: { w: "2", l: 1 } } } }).kuidoshi.w, 2, "文字列wも数値化");

  // withBossTally：roguelite 他フィールドを保全しつつ bossTally だけ差し替え。
  const merged = withBossTally({ orbs: 9, roguelite: { bestFloor: 12, carry: ["x"] } }, t2);
  eq(merged.orbs, 9, "withBossTally は他フィールド保全(orbs)");
  eq(merged.roguelite.bestFloor, 12, "withBossTally は roguelite.bestFloor 保全");
  eq(merged.roguelite.bossTally.shiyue.l, 1, "withBossTally は bossTally を載せる");

  // previewBossChars：ボス階は2人を決定論で先読み、非ボス階は空。
  const party = [{ id: "shiyue", char: { id: "shiyue" } }];
  const r = newRun(party, "boss-preview");
  r.floor = 10; // 10階＝ボス
  const bossFt = floorTypeById("boss");
  const b1 = previewBossChars(r, bossFt);
  const b2 = previewBossChars(r, bossFt);
  eq(b1.length, 2, "ボス階は2人先読み");
  eq(b1.map((c) => c.id).join(","), b2.map((c) => c.id).join(","), "previewBossChars は決定論（同seed=同顔ぶれ）");
  ok(!b1.some((c) => c.id === "shiyue"), "編成中キャラはボスに出ない");
  eq(previewBossChars(newRun(party, "x"), floorTypeById("normal")).length, 0, "非ボス階は空");

  // 対局前口上：全キャラが各 tier で rlBossIntro を返す（汎用モック注入で穴がない）。
  for (const id of Object.keys(CHARACTER_VOICE_MASTER)) {
    for (const tier of ["first", "rematch", "revenge"]) {
      ok(typeof pickVoiceLine(id, "rlBossIntro", { bossMemoryTier: tier }) === "string", `rlBossIntro 返る: ${id}/${tier}`);
    }
  }
  // tier を渡さなければ出さない（cond.bossMemoryTier 未一致）。
  eq(pickVoiceLine("shiyue", "rlBossIntro", {}), null, "tier未指定では rlBossIntro は出ない");
  // 詩玥/凌雲は先行の固有口上を持つ（汎用モックと差し替わっている）。
  ok(pickVoiceLine("shiyue", "rlBossIntro", { bossMemoryTier: "first" }).includes("ツモれば勝ち"), "詩玥は固有のボス口上");
}

// ---------- 提案B スライス2：相棒が潜行履歴に反応（固有性）＋群像の二人相槌 ----------
{
  // 固有性：詩玥は最多流派ごとに専用 rlBuff を持つ（cond.rlMainCluster）。
  for (const cl of ["flush", "guard", "tempo", "value", "gamble"]) {
    const lines = (CHARACTER_VOICE_MASTER.shiyue || []).filter((e) => e.event === "rlBuff" && e.cond?.rlMainCluster === cl);
    ok(lines.length >= 1, `詩玥 rlBuff 流派専用あり: ${cl}`);
  }
  // 流派 ctx を渡すと専用 or 汎用が返る（必ず文字列）。
  ok(typeof pickVoiceLine("shiyue", "rlBuff", { rlMainCluster: "flush" }) === "string", "rlMainCluster で rlBuff 返る");
  // 撤退癖：閾値未満では habit 専用行は候補に入らない（汎用 rlRetreat は常に在る）。
  const habitLine = (CHARACTER_VOICE_MASTER.shiyue || []).find((e) => e.event === "rlRetreat" && e.cond?.rlRetreatHabitMin === 3);
  ok(habitLine, "詩玥 撤退癖専用セリフ定義あり");
  ok(typeof pickVoiceLine("shiyue", "rlRetreat", { rlRetreatHabit: 5 }) === "string", "撤退癖ありで rlRetreat 返る");
  ok(typeof pickVoiceLine("shiyue", "rlRetreat", {}) === "string", "撤退癖なしでも汎用 rlRetreat は返る");
  // 自己ベスト更新中：rlDeepRun は厳密一致（未供給=false 扱い）。
  const deep = (CHARACTER_VOICE_MASTER.shiyue || []).find((e) => e.event === "rlPursue" && e.cond?.rlDeepRun === true);
  ok(deep, "詩玥 自己ベスト更新中の rlPursue あり");

  // 群像の二人相槌：全キャラが rlBanter/rlBanterReply を持つ（withBanter 補完で穴なし）。
  for (const id of Object.keys(CHARACTER_VOICE_MASTER)) {
    ok(typeof pickVoiceLine(id, "rlBanter", {}) === "string", `rlBanter 返る: ${id}`);
    ok(typeof pickVoiceLine(id, "rlBanterReply", {}) === "string", `rlBanterReply 返る: ${id}`);
  }
  // 詩玥/凌雲は固有のバンター（汎用注入されず、本人の文だけ）を持つ。
  for (const id of ["shiyue", "kuidoshi"]) {
    ok((CHARACTER_VOICE_MASTER[id] || []).filter((e) => e.event === "rlBanter").length >= 2, `${id} は固有 rlBanter を持つ`);
    ok((CHARACTER_VOICE_MASTER[id] || []).filter((e) => e.event === "rlBanterReply").length >= 2, `${id} は固有 rlBanterReply を持つ`);
  }
}

// ---------- 提案B スライス3：死＝継続（rlWipe）＋見守り（P7/P8） ----------
{
  // 全キャラが rlWipe を持つ（withWipe 補完で穴なし＝どの相棒が先頭でも別れ際が出る）。
  for (const id of Object.keys(CHARACTER_VOICE_MASTER)) {
    ok(typeof pickVoiceLine(id, "rlWipe", {}) === "string", `rlWipe 返る: ${id}`);
  }
  // 見守り(P8)：浅い到達(reached=1)でも必ず言葉が出る＝null退行しない。
  ok(typeof pickVoiceLine("shiyue", "rlWipe", { rlReached: 1 }) === "string", "浅い全滅でも rlWipe 返る");
  // 深い到達では rlReachedMin の専用行が候補に入る（詩玥に rlReachedMin:12 を定義）。
  const deepWipe = (CHARACTER_VOICE_MASTER.shiyue || []).find((e) => e.event === "rlWipe" && e.cond?.rlReachedMin === 12);
  ok(deepWipe, "詩玥 深い全滅の見守りセリフあり");
  ok(typeof pickVoiceLine("shiyue", "rlWipe", { rlReached: 20 }) === "string", "深い全滅でも rlWipe 返る");
  // 浅い帯セリフ（rlReachedMax:6）は深い全滅では候補外＝「最初はこんなもん」が深層で出ない（トーン整合）。
  const shallowWipe = (CHARACTER_VOICE_MASTER.shiyue || []).find((e) => e.event === "rlWipe" && e.cond?.rlReachedMax === 6);
  ok(shallowWipe, "詩玥 浅い全滅の励ましセリフあり（rlReachedMax:6）");
  { // 多数回引いて、深い全滅(reached=20)では浅セリフ本文が一度も返らないことを確認。
    let leaked = false;
    for (let i = 0; i < 80; i++) if (pickVoiceLine("shiyue", "rlWipe", { rlReached: 20 }) === shallowWipe.text) { leaked = true; break; }
    ok(!leaked, "深い全滅で浅い励ましセリフは出ない（rlReachedMax 効く）");
  }
  // P7：全滅の別れ際は懲罰語（没収/力尽き）でなく継続の語。詩玥 rlWipe に「また登」系の継続表現がある。
  const wipeTexts = (CHARACTER_VOICE_MASTER.shiyue || []).filter((e) => e.event === "rlWipe").map((e) => e.text).join(" ");
  ok(/また登|残る|刻まれ/.test(wipeTexts), "詩玥 rlWipe は継続フレーミング(また登る/残る/刻まれる)");
  ok(!/没収|力尽き/.test(wipeTexts), "詩玥 rlWipe に懲罰語(没収/力尽き)が無い");
}

// ---------- 提案B 大章（記憶）選択ハブ：マスタ整合＋解禁ツリー ----------
{
  // マスタ整合：id一意・必須文言・tone妥当・unlock参照は実在id・clearFloor>0。
  // ※ 大2章は comingSoon（空＝予告枠）なので aim/cast/blurb は緩める（中身を勝手に増やさない方針）。
  const cids = new Set();
  const validTones = new Set(["gold", "jade", "ember", "ash"]);
  for (const ch of ROGUELITE_CHAPTER_MASTER) {
    ok(ch.id && !cids.has(ch.id), `chapter id 一意: ${ch.id}`); cids.add(ch.id);
    ok(ch.title && ch.subtitle && ch.blurb, `chapter 文言あり: ${ch.id}`);
    ok(validTones.has(ch.tone), `chapter tone 妥当: ${ch.id}=${ch.tone}`);
    ok(typeof ch.clearFloor === "number" && ch.clearFloor > 0, `chapter clearFloor>0: ${ch.id}`);
    if (ch.unlock != null) ok(chapterById(ch.unlock), `chapter unlock 参照は実在: ${ch.id}->${ch.unlock}`);
    if (!ch.comingSoon) ok(Array.isArray(ch.cast) && ch.cast.length >= 1, `playable章は cast あり: ${ch.id}`);
  }
  // ちょうど1本が常時解禁（unlock===null）＝最初の記憶＝師匠をめぐる群像（大1章）。
  eq(ROGUELITE_CHAPTER_MASTER.filter((c) => c.unlock == null).length, 1, "常時解禁の章はちょうど1本");
  ok(firstChapterId(), "firstChapterId が取れる");
  eq(chapterById(firstChapterId()).unlock, null, "firstChapter は unlock=null");
  ok(!chapterById(firstChapterId()).comingSoon, "firstChapter は遊べる（comingSoonでない）");
  // 大1章＝師匠群像：弟子＋御庭番が一本に集約されている（割っていない）。
  const ch1cast = new Set((chapterById(firstChapterId()).cast || []).map((p) => p.id));
  for (const id of ["shiyue", "kuidoshi", "mamori", "yao_chu", "chun_chan"]) ok(ch1cast.has(id), `大1章 cast に ${id} を含む`);

  // 解禁ロジック：踏破有無に関わらず、遊べるのは大1章のみ（大2章は comingSoon＝常に封）。
  const open0 = chaptersWithState([]);
  eq(open0.filter((c) => c.unlocked).length, 1, "踏破0なら解禁は1本だけ");
  ok(open0.find((c) => c.id === firstChapterId()).unlocked, "踏破0でも最初の記憶は解禁");
  const coming = ROGUELITE_CHAPTER_MASTER.find((c) => c.comingSoon);
  ok(coming, "大2章＝comingSoon プレースホルダが存在（空）");
  ok(!isChapterUnlocked(coming, []), "comingSoon は未踏破では封");
  ok(!isChapterUnlocked(coming, [firstChapterId()]), "comingSoon は大1章踏破でも開かない（中身が空）");
  eq(chaptersWithState([firstChapterId()]).find((c) => c.id === firstChapterId()).cleared, true, "踏破済フラグが立つ");
  // 大1章の踏破階＝F30（周回案・3ボス群像／2026-06-26）。10だと1ボスで薄い → 30へ。
  eq(chapterById("mentor").clearFloor, 30, "大1章 clearFloor=30（F30踏破）");
  // 次章解禁ヘルパ：大1章を踏破しても、次は comingSoon（空）なので「開く中身」は無い＝null（踏破演出は予告に留める）。
  eq(nextChapterAfter("mentor"), null, "mentor の次は comingSoon＝nextChapterAfter は null（嘘の解禁を出さない）");
  eq(nextChapterAfter(null), null, "nextChapterAfter(null)=null（保険）");
  // newRun は chapterId / bossPool を保持し、serialize/deserialize で往復する。
  const r = newRun([{ id: "shiyue", char: { id: "shiyue" } }], "chap-seed", "mentor", ["kuidoshi", "mamori", "yao_chu"]);
  eq(r.chapterId, "mentor", "newRun が chapterId を保持");
  eq((r.bossPool || []).join(","), "kuidoshi,mamori,yao_chu", "newRun が bossPool を保持");
  const round = deserializeRun(serializeRun(r), (id) => ({ id }));
  eq(round.chapterId, "mentor", "chapterId は保存往復で残る");
  eq((round.bossPool || []).join(","), "kuidoshi,mamori,yao_chu", "bossPool は保存往復で残る");

  // ボス陣＝この記憶の群像から引く（提案B・縦軸の結びつけ）。詩玥編成で大1章なら、ボスは残りの群像から。
  const ch1 = chapterById(firstChapterId());
  const bossPool = ch1.cast.map((c) => c.id);
  const br = newRun([{ id: "shiyue", char: { id: "shiyue" } }], "boss-pool", ch1.id, bossPool);
  br.floor = 10;
  const bosses = previewBossChars(br, floorTypeById("boss"));
  eq(bosses.length, 2, "ボスは2人");
  ok(bosses.every((c) => bossPool.includes(c.id)), "ボスは記憶の群像（章cast）から選ばれる");
  ok(bosses.every((c) => c.id !== "shiyue"), "編成中の相棒はボスに出ない");
}

// ---------- フロア別ボス配役（2026-06-26・大1章＝F10真守+モブ / F20詩玥・凌雲 / F30姚玖・春嬋） ----------
{
  const chap = chapterById("mentor");
  ok(chap.bossFloors && chap.bossFloors[10] && chap.bossFloors[20] && chap.bossFloors[30], "大1章に F10/20/30 のボス配役がある");
  const castIds = chap.cast.map((c) => c.id);
  // 配役と衝突しない中立パーティで配役そのものを検証。
  const pr = newRun([{ id: "x_player", char: { id: "x_player" } }], "cast-seed", "mentor", castIds, chap.bossFloors);
  const bossFt = floorTypeById("boss");
  // F10：真守＋ネームドモブ（口上対象＝真守のみ／卓は2人）。
  pr.floor = 10;
  eq(previewBossChars(pr, bossFt).map((c) => c.id).join(","), "mamori", "F10 口上=真守のみ（モブ枠は口上に出ない）");
  const f10 = enemyUnitForFloor(pr, bossFt);
  eq(f10.members.length, 2, "F10 ボス卓は2人");
  ok(f10.members.some((m) => m.id === "boss:mamori"), "F10 に真守ボスが立つ");
  ok(f10.members.some((m) => m.isElite), "F10 のもう1枠はネームドモブ");
  // F20：詩玥・凌雲。
  pr.floor = 20;
  eq(previewBossChars(pr, bossFt).map((c) => c.id).sort().join(","), "kuidoshi,shiyue", "F20=詩玥・凌雲");
  // F30：姚玖・春嬋（締め）。
  pr.floor = 30;
  eq(previewBossChars(pr, bossFt).map((c) => c.id).sort().join(","), "chun_chan,yao_chu", "F30=姚玖・春嬋");
  // 配役外の深層ボス階（F40）は cast から決定論ランダム（bossPool フォールバック）＝2人立つ。
  pr.floor = 40;
  eq(previewBossChars(pr, bossFt).length, 2, "配役外F40は群像から2人（フォールバック）");
  // 配役キャラが編成中なら、その枠はモブへ退避（卓は必ず埋まる安全側）。
  const pr2 = newRun([{ id: "shiyue", char: { id: "shiyue" } }], "cast-seed2", "mentor", castIds, chap.bossFloors);
  pr2.floor = 20;
  ok(!previewBossChars(pr2, bossFt).some((c) => c.id === "shiyue"), "編成中の詩玥はF20ボスに出ない（モブ退避）");
  // 保存往復で bossFloors が残る。
  const round2 = deserializeRun(serializeRun(pr), (id) => ({ id }));
  ok(round2.bossFloors && round2.bossFloors[10], "bossFloors は保存往復で残る");
}

// ---------- 大章ごとの難度オーバーライド（tuning スキャフォルド・2026-06-26） ----------
{
  // 無指定（null）＝グローバル既定と完全一致（後方互換）。
  eq(floorEnemyHp(10, null), floorEnemyHp(10), "tuning=null は敵HP既定と一致");
  eq(floorDamageMul(30, null), floorDamageMul(30), "tuning=null は被ダメ深度既定と一致");
  eq(lethalCapFrac(50, null), lethalCapFrac(50), "tuning=null は一撃死上限既定と一致");
  // tv：指定キーは上書き・無指定キーは fallback。
  eq(tv({ baseEnemyHp: 900 }, "baseEnemyHp", 700), 900, "tv 指定キーは上書き");
  eq(tv({ baseEnemyHp: 900 }, "enemyHpSlope", 0.08), 0.08, "tv 無指定キーは fallback");
  eq(tv(null, "baseEnemyHp", 700), 700, "tv tuning=null は fallback");
  // 敵HP：base を上げると硬くなる（F10 で既定より大きい）。
  const hard = { baseEnemyHp: 1000, enemyHpSlope: 0.12 };
  ok(floorEnemyHp(10, hard) > floorEnemyHp(10), "tuning baseEnemyHp↑ で敵HPが増える");
  // 被ダメ深度：slope を上げると深層が重い（F40 で既定より大きい）。
  ok(floorDamageMul(40, { floorDmgSlope: 0.6 }) > floorDamageMul(40), "tuning floorDmgSlope↑ で被ダメ深度が増える");
  // 一撃死上限：fadeStart を早めると深層で早く開く（F35 で既定より大きいか同等）。
  ok(lethalCapFrac(45, { lethalCapFadeStart: 20 }) >= lethalCapFrac(45), "tuning lethalCapFadeStart↓ で上限が早く開く");
  // 章マスタの tuning が run に乗り、保存往復で残る。
  const tr = newRun([{ id: "x", char: { id: "x" } }], "tune-seed", "mentor", ["shiyue"], null, { baseEnemyHp: 850 });
  eq(tr.tuning?.baseEnemyHp, 850, "newRun が tuning を保持");
  const tround = deserializeRun(serializeRun(tr), (id) => ({ id }));
  eq(tround.tuning?.baseEnemyHp, 850, "tuning は保存往復で残る");
  // enemyUnitForFloor が run.tuning を反映（硬い章は敵HPが大きい）。
  const plain = newRun([{ id: "x", char: { id: "x" } }], "tune-seed2", "mentor", ["shiyue"]);
  plain.floor = 5; tr.floor = 5;
  ok(enemyUnitForFloor(tr, floorTypeById("normal")).members[0].stats.startingPoints
     > enemyUnitForFloor(plain, floorTypeById("normal")).members[0].stats.startingPoints, "tuning硬い章はenemyUnitForFloorの敵HPが大きい");
  // 現状の mentor 章は tuning 無指定＝既定のまま（挙動不変）。
  eq(chapterById("mentor").tuning ?? null, null, "mentor は tuning 無指定（既定のまま）");
}

// ---------- 提案B 章intro口上（縦軸の結びつけ） ----------
{
  // 全キャラが rlChapterIntro を持つ（withChapterIntro 補完で穴なし＝どの相棒でも導入が出る）。
  for (const id of Object.keys(CHARACTER_VOICE_MASTER)) {
    ok(typeof pickVoiceLine(id, "rlChapterIntro", {}) === "string", `rlChapterIntro 返る: ${id}`);
  }
  // 詩玥/凌雲は固有の章intro（汎用注入されず本人の文）。
  for (const id of ["shiyue", "kuidoshi"]) {
    ok((CHARACTER_VOICE_MASTER[id] || []).filter((e) => e.event === "rlChapterIntro").length >= 2, `${id} は固有 rlChapterIntro を持つ`);
  }
}

// ---------- 提案B ① 双方向2択（プレイヤーが返す→キャラが覚える） ----------
{
  // 別れ際の返し：climb/rest で出し分け、どちらも文字列が返る（全キャラ withResolve 補完）。
  for (const id of Object.keys(CHARACTER_VOICE_MASTER)) {
    ok(typeof pickVoiceLine(id, "rlResolve", { resolveChoice: "climb" }) === "string", `rlResolve climb 返る: ${id}`);
    ok(typeof pickVoiceLine(id, "rlResolve", { resolveChoice: "rest" }) === "string", `rlResolve rest 返る: ${id}`);
  }
  // resolveChoice 未指定では返さない（厳密一致）。
  eq(pickVoiceLine("shiyue", "rlResolve", {}), null, "resolveChoice 未指定では rlResolve は出ない");
  // 「覚える」：また登るを重ねた相棒の専用 chapterIntro が rlResolveClimbMin で解放（閾値未満は出ない）。
  const climbLine = (CHARACTER_VOICE_MASTER.shiyue || []).find((e) => e.event === "rlChapterIntro" && e.cond?.rlResolveClimbMin === 3);
  ok(climbLine, "詩玥 rlResolveClimbMin の章intro あり（挑み続ける性分を覚えている）");
  { // rlResolveClimb=5 のとき専用行が候補入り、=0 では出ない
    let leakedHigh = false, leakedLow = false;
    for (let i = 0; i < 80; i++) { if (pickVoiceLine("shiyue", "rlChapterIntro", { rlResolveClimb: 0 }) === climbLine.text) leakedLow = true; }
    for (let i = 0; i < 80; i++) { if (pickVoiceLine("shiyue", "rlChapterIntro", { rlResolveClimb: 5 }) === climbLine.text) leakedHigh = true; }
    ok(!leakedLow, "climb0 では覚えてるセリフは出ない");
    ok(leakedHigh, "climb5 では覚えてるセリフが候補に入る");
  }
}

// ---------- 提案B ② 宝珠で章解禁（仕組み・大2は触らない） ----------
{
  // 合成データで宝珠解禁ロジックを検証（マスタ本体＝大2 comingSoon は触らない方針）。
  const playable = { id: "ch_x", comingSoon: false, unlock: "prev", orbUnlockCost: 30 };
  ok(!isChapterUnlocked(playable, [], []), "前提未踏破・宝珠未解禁なら封");
  ok(isChapterUnlocked(playable, ["prev"], []), "前提踏破で解禁");
  ok(isChapterUnlocked(playable, [], ["ch_x"]), "宝珠で先行解禁済みなら解禁（別ルート）");
  // canOrbUnlock：封・非予告枠・値付き・所持十分なときだけ true。
  ok(canOrbUnlock(playable, [], [], 30), "宝珠ちょうどで解禁可");
  ok(!canOrbUnlock(playable, [], [], 29), "宝珠不足は不可");
  ok(!canOrbUnlock(playable, ["prev"], [], 999), "既に踏破解禁済みなら宝珠解禁は不要(false)");
  ok(!canOrbUnlock(playable, [], ["ch_x"], 999), "既に宝珠解禁済みなら再解禁不可");
  // comingSoon（空＝大2 相当）は宝珠でも開けない（中身が無い）。
  const empty = { id: "ch_empty", comingSoon: true, unlock: "prev", orbUnlockCost: 30 };
  ok(!canOrbUnlock(empty, ["prev"], [], 999), "comingSoon は宝珠でも開けない");
  ok(!isChapterUnlocked(empty, ["prev"], ["ch_empty"]), "comingSoon は宝珠解禁IDがあっても封");
  // 値付けの無い章は宝珠対象外。
  ok(!canOrbUnlock({ id: "ch_y", comingSoon: false, unlock: "prev" }, [], [], 999), "orbUnlockCost 無しは宝珠対象外");
  // 実マスタ：大2(comingSoon) は宝珠でも開かない＝大2は触らない方針が成立。
  const realComing = ROGUELITE_CHAPTER_MASTER.find((c) => c.comingSoon);
  if (realComing) ok(!canOrbUnlock(realComing, [firstChapterId()], [], 99999), "実マスタ大2は宝珠でも開けない");
  // chaptersWithState は orbUnlocked フラグを付ける。
  ok("orbUnlocked" in chaptersWithState([], [])[0], "chaptersWithState が orbUnlocked を付与");
}

// ---------- 卓サイズ（4麻/3麻/2麻）----------
{
  eq(tableSizeLabel(4), "四麻", "卓サイズ表記4");
  eq(tableSizeLabel(3), "三麻", "卓サイズ表記3");
  eq(tableSizeLabel(2), "二麻", "卓サイズ表記2");
  ok(!isSoloTable(4) && isSoloTable(3) && isSoloTable(2), "ソロ判定（3/2のみ）");
  // 着順ペナルティ：三麻=2位10%/3位30%、二麻=ラス40%。1位は無傷（表に無い＝0）。
  eq(ROGUELITE_SOLO_PENALTY[3][2], 0.10, "三麻2位ペナルティ10%");
  eq(ROGUELITE_SOLO_PENALTY[3][3], 0.30, "三麻3位ペナルティ30%");
  eq(ROGUELITE_SOLO_PENALTY[2][2], 0.40, "二麻ラスペナルティ40%");
  ok(!ROGUELITE_SOLO_PENALTY[3][1] && !ROGUELITE_SOLO_PENALTY[2][1], "ソロ1位は無傷（表に無い）");
  ok(soloPenaltyHint(3).includes("2位") && soloPenaltyHint(2).includes("ラス"), "ペナルティヒント文言");
  // 分布 6:3:1 を多数試行で概ね満たす（決定論rng）。
  const rng = makeRng("size");
  const cnt = { 2: 0, 3: 0, 4: 0 };
  for (let i = 0; i < 6000; i++) cnt[rollTableSize(rng, TABLE_SIZE_DIST.battle)]++;
  ok(cnt[4] > cnt[3] && cnt[3] > cnt[2], "4麻 > 3麻 > 2麻 の出現頻度");
  ok(cnt[4] > 2500 && cnt[4] < 3700, "4麻 ≒ 6/10");
  // ボス分布は 4 or 3 のみ（2は出ない）。
  const brng = makeRng("boss");
  let boss2 = 0;
  for (let i = 0; i < 2000; i++) if (rollTableSize(brng, TABLE_SIZE_DIST.boss) === 2) boss2++;
  eq(boss2, 0, "ボスは二麻にならない");
}

// ---------- 能力の源（初期1・上限3・休息/ショップ回復）----------
{
  const r = newRun(party, "src");
  eq(r.abilitySource, 1, "初期は1個");
  eq(gainAbilitySource(r, 1), 2, "回復で+1");
  eq(gainAbilitySource(r, 5), ABILITY_SOURCE_MAX, "上限3を超えない");
  ok(spendAbilitySource(r, 1), "消費成立");
  eq(r.abilitySource, 2, "消費で-1");
  r.abilitySource = 0;
  ok(!spendAbilitySource(r, 1), "0個では消費不可");
  // serialize 往復で保持。
  r.abilitySource = 2;
  const back = deserializeRun(serializeRun(r), (id) => party.find((p) => p.id === id)?.char || party[0].char);
  eq(back.abilitySource, 2, "セーブ往復で能力の源を保持");
  // 上限到達ならショップ在庫に源は並ばない。
  const full = newRun(party, "full"); full.abilitySource = ABILITY_SOURCE_MAX;
  ok(!shopStock(full, makeRng("x")).some((it) => it.type === "source"), "上限なら源は売り場に出ない");
  // 上限到達で買おうとしても光貨を払わない。
  full.coins = 999;
  ok(!buyShopItem(full, { type: "source", price: 30 }), "上限では源を購入不可");
  eq(full.coins, 999, "購入不可なら光貨は減らない");
}

console.log(`roguelite.mjs: ${n} checks passed`);
