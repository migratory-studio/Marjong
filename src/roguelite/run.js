// ローグライト・ラン状態モデル — docs/shitei-calendar-and-roguelite.md「B. ローグライト」。
//
// 1本のラン（party / hp / floor / 取得カード / rngシード）を表す可変状態と、
// 階層→敵生成・HPスケール・ダメージ変換・レア度バイアスの純ロジックを集約する。
// 麻雀エンジン自体は持たない（ペア戦エンジンを main.js 側で流用）。UI/保存/通信に非依存。
//
// HPスケール（独自・エンジン非改変で実現）:
//   点棒(麻雀の素点) を DAMAGE_SCALE で割って「ローグライトHP」に写す。味方も敵も同じ係数。
//   → 序盤の敵HP=1000。育てた弟子(avatarHpMax 25000)もほぼ 1000 から始まり、満貫クラスの
//     和了1発で 200〜400 程度を削る＝1戦は数和了で決着。階層で敵HPだけ増やして難度を上げる。

import { makeMob } from "../data/mobMaster.js";
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { paramsFromLv, makeRng } from "../autobattle/autoBattle.js";
import { freshMods, applyCard, clusterTakeCapFrac, clusterTakeRaiseFrac } from "./cardEffects.js";
import { ROGUELITE_CARD_MASTER, drawCards, cardById } from "../data/rogueliteCardMaster.js";
import { SHOP_PRICE, SHOP_HEAL_PRICE, SHOP_MAXHP_PRICE } from "../data/rogueliteFloorMaster.js";
import { itemMods } from "./itemEffects.js";
import { drawItems } from "../data/rogueliteItemMaster.js";
import { biomeMods } from "../data/rogueliteBiomeMaster.js";

// 点棒→HP の写像係数（25000点 → 1000HP）。味方HP・与被ダメ双方に一貫適用。
export const DAMAGE_SCALE = 1000 / 25000; // = 0.04
export const ROGUELITE_BASE_ENEMY_HP = 700; // 階層1の敵HP。硬すぎ＝アガリ不発の体感を緩和（1000→700。満貫1発で約半分削れ、2発で撃破）。
// 敵HPは「線形」成長（複利の暴騰＝深層で硬すぎる体感を断つ）。1階ごとに BASE のこの割合ずつ増える。
const ENEMY_HP_SLOPE = 0.08;
const ENEMY_HP_CAP_FLOOR = 30; // この階層で頭打ち（青天井回避）
const BOSS_EVERY = 10; // この階層ごとにボスフロア（10F・進路選択では強制配置）

// バランス校正値（test/roguelite-balance.mjs で実測決定・1か所集約）。
// テストはこのオブジェクトを書き換えて掃引できる（本番は既定値）。
export const RL_TUNE = {
  regenFrac: 0.18,    // 1階踏破ごとの部分回復（最大HP比）。回復しすぎず消耗を残す。
  floorDmgStart: 8,   // この階から被ダメ深度倍率が立ち上がる（F8まで地力で抜けられる＝「うまく戦えばいける」）
  floorDmgSlope: 0.25, // 深度1階あたりの被ダメ増（線形・緩やか）。一撃死クジ(旧4.0)を廃し、難度の主役は「翻数(点数帯)係数」へ。F1〜60は“じわじわ重くなる”だけ。
  floorDmgKnee: 40,    // この階から二次加速が立ち上がる（深層エンドレスの“壁”）。線形だけだと最適化ビルドが永遠に終わらないため。
  floorDmgAccel: 0.04, // 二次加速係数。(floor-knee)^2 に乗る＝深いほど加速度的に重い。F90前後で安手すら受け切れなくなる＝最適化ビルドでも必ず終わる。
  dealCap: 2.4,       // 与ダメ倍率の実効上限（積み過ぎの無双化を防ぐ）。攻め一辺倒の最適化を緩める（3.0→2.4）
  takeFloor: 0.4,     // 被ダメ倍率の実効下限＝軽減は最大60%まで（持続を有界にする）
  friendlyMul: 0.3,   // 味方の和了で味方が払う分（＝主に自摸の同士討ち）を大幅軽減（1.0→0.3）。「味方がトぶ不思議」対策。
  dealDepthStart: 1,  // 与ダメ深度ボーナスの立ち上がり階
  dealDepthSlope: 0.04, // 深度1階あたりの与ダメ増。敵HP成長に追従させ「アガっても嬉しくない」を解消。
  // 翻数(＝点数帯)→被ダメ係数。麻雀の手の重さをHPダメージへ直結させる中核レバー。
  //   満貫未満は和らげ「安手では死ににくい」、跳満で跳ね上げ「あてられるとぶっ飛ぶ」、倍満/役満はさらに痛い。
  //   [gross素点しきい値, 係数] の昇順テーブルを線形補間（端は端値でクランプ）。
  hanTier: [[2000, 0.45], [3900, 0.55], [5200, 0.62], [7700, 0.72], [8000, 0.80], [12000, 1.30], [16000, 1.65], [24000, 2.0], [32000, 2.4]],
  // 1ハンドで味方が失うHPの上限（最大HP比）。満タンからの一撃全滅を防ぎ「HPを積めば耐える」を成立させる。
  // 序盤〜中盤(F1〜lethalCapFadeStart)は固定で守り、深層エンドレスでだけ超ゆっくり開く＝ランは“深く”だが必ず終わる。
  lethalCapBase: 0.55,      // 立ち上がりの上限（F1〜lethalCapFadeStart はこの割合で頭打ち）
  lethalCapFadeStart: 40,   // この階まで上限は固定（中盤までは満タン一撃死なし）
  lethalCapFadeSlope: 0.02, // 1階あたり上限が緩む量（F62前後で1.0＝即死復活。深層エンドレスは終わる）
  tsumoCapMul: 0.7,         // ツモ被弾の席あたり上限＝ron上限×この値。「ツモられてもトビまではしない（が痛い）」。
};

// 深度スケールの一撃死上限（最大HP比）。中盤まで固定、深層で 1.0（=上限なし）へ超ゆっくり漸近。
export function lethalCapFrac(floor = 1) {
  return Math.min(1, RL_TUNE.lethalCapBase + Math.max(0, floor - RL_TUNE.lethalCapFadeStart) * RL_TUNE.lethalCapFadeSlope);
}

// 翻数(点数帯)→被ダメ係数。gross＝和了者が得た素点（ron=満額・ツモ=合計）。RL_TUNE.hanTier を線形補間。
export function hanTierMul(gross = 0) {
  const t = RL_TUNE.hanTier;
  const g = Math.abs(gross);
  if (g <= t[0][0]) return t[0][1];
  if (g >= t[t.length - 1][0]) return t[t.length - 1][1];
  for (let i = 1; i < t.length; i++) {
    if (g <= t[i][0]) {
      const [g0, m0] = t[i - 1], [g1, m1] = t[i];
      return m0 + (m1 - m0) * (g - g0) / (g1 - g0);
    }
  }
  return t[t.length - 1][1];
}
export const REGEN_FRAC = RL_TUNE.regenFrac; // 後方互換の別名（参照箇所用）

// 深度被ダメ倍率：param 上限（敵Lv10）の先でも難度が上がり続ける＝エンドレスが必ず終わる。
// ※ 敵の攻撃で味方が受ける失点にだけ乗る（味方同士の自摸被弾には乗せない＝rogueliteDamageDeltas 参照）。
export function floorDamageMul(floor = 1) {
  const lin = Math.max(0, floor - RL_TUNE.floorDmgStart) * RL_TUNE.floorDmgSlope;
  const knee = Math.max(0, floor - (RL_TUNE.floorDmgKnee || Infinity));
  return 1 + lin + knee * knee * (RL_TUNE.floorDmgAccel || 0); // 深層は二次加速＝必ず終わる壁
}

// 与ダメ深度ボーナス：階層が深いほど敵HPが増えるので、味方の与ダメも緩やかに伸ばして
// 「アガリの手応え（敵HPがちゃんと削れる）」を深層まで保つ。
export function dealDepthMul(floor = 1) {
  return 1 + Math.max(0, floor - RL_TUNE.dealDepthStart) * RL_TUNE.dealDepthSlope;
}

// ---- HP スケール ----

// 味方の avatarHpMax（点棒スケール）→ ローグライトHP。
export function allyScaledHp(avatarHpMax = 25000) {
  return Math.max(200, Math.round((avatarHpMax || 25000) * DAMAGE_SCALE));
}

// 館の気脈：フロアを進むほど味方の最大HPも緩やかに底上げ（基礎HP比・線形＝複利爆発しない）。
// 敵HPが階層で増える(floorEnemyHp)のに追従させ、攻撃特化ビルドでも深層で「相手の合計HPを上回る」
// ＝制圧ボーナスを狙える余地を残す狙い。0.03＝控えめ（実測：育成完了greedy max140で有界・無限化しない）。
export const FLOOR_HP_GROWTH = 0.03;
export function growMaxHp(run) {
  if (!run || !Array.isArray(run.party)) return;
  for (const m of run.party) {
    if (m.hp <= 0) continue; // トんだメンバーは育たない（脱落はランを通して継続）
    const add = Math.round((m.baseHp || m.hpMax) * FLOOR_HP_GROWTH);
    m.hpMax += add; m.hp += add; // 現在HPも同量底上げ（進むだけで少し回復＝前進の手応え）
  }
}

// 階層→敵1人あたりのHP（線形成長・上限で頭打ち）。複利をやめ、深層でも傾斜がなだらか。
export function floorEnemyHp(floor = 1) {
  const f = Math.min(floor, ENEMY_HP_CAP_FLOOR);
  return Math.round(ROGUELITE_BASE_ENEMY_HP * (1 + ENEMY_HP_SLOPE * (f - 1)));
}

// 階層→敵の強さ Lv（paramsFromLv 用・1..10 目安）。深いほど強い。
function floorEnemyLv(floor = 1) {
  return Math.max(1, Math.min(10, Math.round(1 + (floor - 1) * 0.6)));
}

// 1戦の「定められた局数」はフロア種別の baseHands が真実（マスタ駆動）。
// この局数を耐え切るか、どちらかがトビで決着＝サクサク。未指定は通常戦闘＝1局。
export function handsForType(floorType) {
  return floorType?.baseHands || 1;
}

// 風の上限（外枠）。局数上限（maxHands）が先に効くので常に東風(1)で十分。
export function roundsForFloor() {
  return 1;
}

export function isBossFloor(floor = 1) {
  return floor % BOSS_EVERY === 0;
}

// ---- メタ進行（ローグライク引継ぎ） ----
//
// 到達記録（bestFloor）が深いほど次ランへ引き継げるバフ枠が増える＝正のフィードバック。
// 「累積しない」（docs確定）：毎ラン終了時に枠数ぶん選び直し＝手持ちは常に次の1ランぶん。
// 常に1枠以上（最初から少し持ち越せる＝とっつき）。
export function carrySlotsFor(bestFloor = 0) {
  if (bestFloor >= 10) return 4;
  if (bestFloor >= 6) return 3;
  if (bestFloor >= 3) return 2;
  return 1;
}

// ---- ラン生成 ----

// パーティ（charById で解決済みの CHARACTER 互換配列）から新規ランを作る。
//   party: [{ id, char, avatarHpMax }] の配列（先頭=あなた）。最低1人。
//   seed:  乱数シード（省略時は時刻）。テストは固定 seed を渡す。
export function newRun(party, seed) {
  const members = (party || []).map((p) => {
    const hpMax = allyScaledHp(p.avatarHpMax ?? p.char?.stats?.startingPoints ?? 25000);
    return { id: p.id, char: p.char, hpMax, hp: hpMax, baseHp: hpMax, hungover: false }; // baseHp=館の気脈の底上げ基準（初期HP最大）
  });
  return {
    seed: seed != null ? String(seed) : String(Date.now()),
    floor: 1,
    party: members, // 先頭2人が着卓・3人目以降は控え（パッシブ能力源）
    cards: [], // 取得カードid（履歴）
    mods: freshMods(),
    cleared: 0, // 撃破した戦数
    coins: 0,   // ラン内通貨「光貨」（ショップ/鍛冶屋）
    skillLevel: 1, // パーティ共通のスキルレベル（全員Lv1スタート・バフ/鍛冶屋でUP・能力が強化）
    forgeOvercharge: 0, // 鍛冶屋・限界突破の購入回数（Lv上限後に攻撃力を鍛えた段数。コスト急騰の基準）
    items: [],     // 道具スロット（最大3。active=フロア選択で使う / passive=常設 / trigger=自動）
    nextBattle: {}, // 「次の1戦だけ」効果（道具で仕込む。launch で消費）
    routeReroll: 0, // 地図の写しで進路を引き直した回数（seedずらし用）
    biomeRerolls: {}, // 帯番号→巡りの賽で層を引き直した回数（biomeOf がseedずらしに使う）
    orbsEarned: 0, // このランで稼いだアカウント通貨「宝珠」（層到達ごとに加算→終了時にprofileへ commit）
    visited: [], // 通過したフロアid（進路の被り回避・来歴）
    alive: true,
  };
}

export { applyCard };

// ---- 一時セーブ（localStorage）用シリアライズ ----
// char（CHARACTER全体）は保存せず id だけ持つ。復元時に resolveChar(id) で再解決する。
const RUN_SAVE_VERSION = 2;
export function serializeRun(run) {
  if (!run || !Array.isArray(run.party)) return null;
  return {
    v: RUN_SAVE_VERSION,
    seed: run.seed, floor: run.floor, cleared: run.cleared, coins: run.coins,
    skillLevel: run.skillLevel, forgeOvercharge: run.forgeOvercharge || 0, cards: [...(run.cards || [])], items: [...(run.items || [])],
    mods: run.mods, nextBattle: run.nextBattle || {}, routeReroll: run.routeReroll || 0,
    biomeRerolls: { ...(run.biomeRerolls || {}) }, orbsEarned: run.orbsEarned || 0,
    lineup: run.lineup || null, visited: [...(run.visited || [])], eventSeen: !!run.eventSeen,
    party: run.party.map((m) => ({ id: m.id, hp: m.hp, hpMax: m.hpMax, baseHp: m.baseHp ?? m.hpMax, hungover: !!m.hungover })),
  };
}

// 保存データ→run へ復元。resolveChar(id)→CHARACTER 互換オブジェクト（解決不能は null）。
// メンバーのどれか1人でも解決できなければ復元失敗（null）＝安全側（再開させない）。
export function deserializeRun(data, resolveChar) {
  if (!data || data.v !== RUN_SAVE_VERSION || !Array.isArray(data.party) || !data.party.length) return null;
  const party = [];
  for (const m of data.party) {
    const char = resolveChar?.(m.id);
    if (!char) return null;
    party.push({ id: m.id, char, hp: m.hp, hpMax: m.hpMax, baseHp: m.baseHp ?? m.hpMax, hungover: !!m.hungover });
  }
  return {
    seed: String(data.seed), floor: data.floor || 1, party,
    cards: [...(data.cards || [])], mods: { ...freshMods(), ...(data.mods || {}) },
    cleared: data.cleared || 0, coins: data.coins || 0, skillLevel: data.skillLevel || 1, forgeOvercharge: data.forgeOvercharge || 0,
    items: [...(data.items || [])], nextBattle: data.nextBattle || {}, routeReroll: data.routeReroll || 0,
    biomeRerolls: { ...(data.biomeRerolls || {}) }, orbsEarned: data.orbsEarned || 0,
    lineup: Array.isArray(data.lineup) ? data.lineup : undefined, visited: [...(data.visited || [])],
    eventSeen: !!data.eventSeen, alive: true,
  };
}

// パーティの「生存メンバー」を最大比 frac で回復（休息/宴会/ショップ）。「癒しの香炉」で回復量↑。
// トんだ(hp<=0)メンバーは回復しない＝一度トベば復活しない（ランを通して脱落）。
export function healParty(run, frac) {
  const f = frac * itemMods(run).healMul;
  for (const m of run.party) if (m.hp > 0) m.hp = Math.min(m.hpMax, m.hp + Math.round(m.hpMax * f));
}

// 二日酔い抽選（宴会）。各メンバー独立に chance で hungover を立てる。決定論 rng。
export function rollHangover(run, chance, rng) {
  for (const m of run.party) if (rng() < chance) m.hungover = true;
}

// ---- ショップ（第2弾・光貨） ----

// ショップ在庫を決定論生成：バフ2種＋道具1種（取得済み除外）＋全回復＋HP最大+。価格はレア度/固定。
export function shopStock(run, rng) {
  const cards = drawCards(rng, { count: 2, exclude: excludedCardIds(run) });
  const stock = cards.map((c) => ({ type: "card", card: c, price: SHOP_PRICE[c.rarity] || 20, name: c.name, desc: c.desc, rarity: c.rarity }));
  // 道具1種（未所持から）。
  const it = drawItems(rng, { count: 1, exclude: run.items })[0];
  if (it) stock.push({ type: "item", item: it, price: it.cost, name: it.name, desc: it.desc, rarity: "rare" });
  stock.push({ type: "heal", price: SHOP_HEAL_PRICE, name: "気付け薬", desc: "パーティ全員のHPを50%回復する。", rarity: "common" });
  stock.push({ type: "maxhp", price: SHOP_MAXHP_PRICE, name: "厚みの護符", desc: "HP最大値が一定値増える（深い階ほど大きい・現在HPも底上げ）。", rarity: "rare" });
  return stock;
}

// 購入：光貨が足りれば支払って効果適用。戻り値 true=購入成立。
export function buyShopItem(run, item) {
  if (!item || (run.coins || 0) < item.price) return false;
  // 道具は枠(3)が空いているときだけ（入れ替えはUIが要るので main 側が先取りする。ここはハーネス用）。
  if (item.type === "item") {
    if ((run.items || []).length >= 3) return false;
    run.coins -= item.price; run.items.push(item.item.id); return true;
  }
  run.coins -= item.price;
  if (item.type === "card") applyCard(run, item.card);
  else if (item.type === "heal") healParty(run, 0.5);
  else if (item.type === "maxhp") applyCard(run, { id: "_shop-maxhp", effect: { kind: "maxHpAdd", add: 200 } }); // 絶対値（複利インフレ防止・買い増しは線形）
  return true;
}

// ---- 祠（第2弾・供物） ----

// 祠の供物2択（＋去る）。痛みと引き換えの強大な恩恵。outcome は applyEventOutcome 互換。
export function shrineOffers(run) {
  return [
    { label: "HPを捧げる（最大HPの30%）", reply: "祠が応える――力が body に満ちる。", outcome: { hurtFrac: 0.3, effect: { kind: "compound", parts: [{ kind: "dealMul", mul: 1.4 }, { kind: "takeReduce", rate: 0.2 }] } } },
    { label: "光貨を捧げる（40）", reply: "供物は受け取られた。確かな手応え。", outcome: { coins: -40, effect: { kind: "maxHpAdd", add: 250 } } },
    { label: "何も捧げず去る", reply: "祠は沈黙したまま。", outcome: {} },
  ];
}

// 着卓する味方2人＝並び順で上から生存2人（自動入れ替えなし）。旧コメント（HP上位2人を自動ローテ）
// 並び順（編成 lineup → 無ければパーティ順）で「上から生存2人」を着卓させる。
// ★HPによる自動入れ替えはしない＝プレイヤーが「編成」で動かさない限り着卓メンバーは固定。
// 着卓中の誰かがトんだ場合だけ、次の控えが繰り上がる（戦死は埋めるしかないため）。
// 人間(party[0])が着卓2人に入るなら席0へ固定（操作キャラ）。生存1人なら影武者で卓を成立。
export function seatedAllies(run) {
  const ordered = partyOrder(run); // lineup or パーティ順（固定）
  const living = ordered.filter((m) => m.hp > 0);
  if (!living.length) return [run.party[0], run.party[0]]; // 全滅時の保険（通常は allPartyDown で先に終了）
  let fighters = living.slice(0, 2);
  if (fighters.length < 2) fighters = [fighters[0], fighters[0]];
  const you = run.party[0];
  if (fighters.includes(you) && fighters[0] !== you) fighters = [you, fighters.find((m) => m !== you) || you];
  return fighters;
}

// 控え判定もlineup順に追従させるためのヘルパ（active=着卓2人, bench=残り）。
export function partyOrder(run) {
  if (Array.isArray(run.lineup) && run.lineup.length) {
    const byId = new Map(run.party.map((m) => [m.id, m]));
    const ordered = run.lineup.map((id) => byId.get(id)).filter(Boolean);
    for (const m of run.party) if (!ordered.includes(m)) ordered.push(m);
    return ordered;
  }
  return [...run.party];
}

// 生存メンバー数（hp>0）。
export function survivorCount(run) {
  return (run.party || []).filter((m) => m.hp > 0).length;
}

// ゲームオーバー＝生存メンバーが1人以下（2対2の卓を味方2人で成立させられない＝戦えない）。
// ※ パーティ1人で始めたランは例外で1人でも続行（影武者で卓を成立）。
export function runWiped(run) {
  const total = (run.party || []).length;
  if (total <= 1) return survivorCount(run) === 0; // ソロランは全滅まで続行
  return survivorCount(run) <= 1;
}

// 旧API：全員トビ（互換・テスト用）。
export function allPartyDown(run) {
  return (run.party || []).length > 0 && run.party.every((m) => m.hp <= 0);
}

// 控えメンバー（出場順3人目以降）。パッシブ能力源として能力idを供出する。
export function benchAbilityIds(run) {
  return partyOrder(run).slice(2).flatMap((m) => (m.char?.abilities || []).map((ab) => ab.abilityId)).filter(Boolean);
}

// この階層の敵ユニット（2人）をフロア種別に応じて決定論生成。
//   floorType.enemy: 'mob'（通常）/ 'named'（強敵＝名前＋能力のモブ）/ 'boss'（ボス＝キャラ）
//   未指定は floor のボス判定にフォールバック（後方互換）。強敵/ボスはHP・Lvを上乗せ。
const ELITE_ABILITIES = ["lucky-draw", "chunchan", "dora-pull", "danger-sense"];

// ボス＝プレイアブルキャラ（編成中＋弟子を除く）から決定論で n 人選ぶ。
// 弟子(CompletedAvatar)は CHARACTER_MASTER に居ないので自然に除外。編成中キャラは id で除外。
function pickBossChars(run, rng, n) {
  const exclude = new Set((run.party || []).map((m) => m.id));
  const avail = CHARACTER_MASTER.filter((c) => c && c.id && !c.isMob && !exclude.has(c.id));
  const chosen = [];
  while (chosen.length < n && avail.length) chosen.push(avail.splice(Math.floor(rng() * avail.length), 1)[0]);
  return chosen;
}

// プレイアブルキャラ → ボス敵メンバー（HP・強さを階層スケールで上書き。立ち絵/能力は本人のもの）。
function bossMemberFromChar(char, hp, lv, seed) {
  return {
    id: `boss:${char.id}`,
    name: char.name, reading: char.reading || "", color: char.color || "#7c7f8a",
    role: "boss", isMob: false, isRival: true, rivalTitle: char.title || "館の主",
    bio: "", profile: "",
    stats: { startingPoints: hp },
    assets: char.assets || { icon: "", portrait: "", voices: {} },
    portraitPos: char.portraitPos || "top center",
    params: paramsFromLv(lv, seed),
    abilities: Array.isArray(char.abilities) ? char.abilities.map((a) => ({ ...a })) : [],
  };
}

export function enemyUnitForFloor(run, floorType = null, salt = "") {
  const floor = run.floor;
  const kind = floorType?.enemy || (isBossFloor(floor) ? "boss" : "mob");
  const hpMul = kind === "boss" ? 1.3 : kind === "named" ? 1.2 : 1;
  const lvBump = kind === "boss" ? 2 : kind === "named" ? 1 : 0;
  const hp = Math.round(floorEnemyHp(floor) * hpMul);
  const lv = Math.min(10, floorEnemyLv(floor) + lvBump + (biomeMods(run).enemyLvAdd || 0)); // 層で強敵化（喧噪の都）
  const rng = makeRng(`${run.seed}:floor${floor}:enemy${salt}`);
  const members = [];

  if (kind === "boss") {
    // ボス＝プレイアブルキャラ2人（編成中＋弟子は除外）。本人の立ち絵・能力で立ちはだかる。
    const bosses = pickBossChars(run, rng, 2);
    for (const c of bosses) members.push(bossMemberFromChar(c, hp, lv, `${run.seed}:boss${floor}:${c.id}${salt}`));
  } else if (kind === "named") {
    const abil = ELITE_ABILITIES[Math.floor(rng() * ELITE_ABILITIES.length)];
    const lead = makeMob({ seed: `${run.seed}:elite${floor}${salt}`, startingPoints: hp, abilityId: abil });
    lead.isElite = true; lead.params = paramsFromLv(lv, `${run.seed}:elite${floor}${salt}`); members.push(lead);
  }
  while (members.length < 2) {
    const mseed = `${run.seed}:f${floor}${salt}:m${members.length}`;
    const mob = makeMob({
      seed: mseed,
      startingPoints: hp,
      abilityId: floor >= 5 && members.length === 0 && kind === "mob" ? "danger-sense" : undefined,
    });
    mob.params = paramsFromLv(lv, mseed);
    members.push(mob);
  }

  return {
    id: `rl-enemy-${floor}`,
    kind,
    isBoss: kind === "boss",
    isElite: kind === "named",
    floor,
    members,
    label: kind === "boss" ? `${members[0].name}（ボス）` : kind === "named" ? `${members[0].name}（強敵）` : "立ちはだかる打ち手",
  };
}

// 流派の門（交代マス）：編成中＋弟子を除くプレイアブルキャラから候補 n 人（決定論）。
export function recruitCandidates(run, n = 3) {
  const exclude = new Set((run.party || []).map((m) => m.id));
  const avail = CHARACTER_MASTER.filter((c) => c && c.id && !c.isMob && !exclude.has(c.id));
  const rng = makeRng(`${run.seed}:recruit:${run.floor}:${run.routeReroll || 0}`);
  const out = [];
  while (out.length < n && avail.length) out.push(avail.splice(Math.floor(rng() * avail.length), 1)[0]);
  return out;
}

// 編成の releaseIdx 番を char で入れ替える（PTは3人のまま）。新メンバーはHP満タンで参加。
export function swapPartyMember(run, char, releaseIdx) {
  if (!char || releaseIdx == null || !run.party[releaseIdx]) return false;
  const hpMax = allyScaledHp(char.stats?.startingPoints ?? 25000);
  run.party[releaseIdx] = { id: char.id, char, hpMax, hp: hpMax, baseHp: hpMax, hungover: false };
  if (Array.isArray(run.lineup)) run.lineup = run.party.map((m) => m.id); // 並び順を整合
  return true;
}

// ---- 対局ダメージ → ローグライトHP 変換 ----
//
// ペア戦の素点差分(deltas: 席ごとの点棒増減)を、ローグライトHP差分へ写す。
//   roles: 席→"ally"|"enemy"（席0,2=ally / 1,3=enemy 想定）
//   winnerSeat: 和了者の席（流局時 null）
// 失点（負の delta）だけがHPを削る（ペア戦の被弾反映と同じ＝オーバーヒール無し）。
//   ・敵席の失点で、和了者が味方なら dealMul（与ダメ倍率）を掛ける。
//   ・味方席の失点には takeMul（被ダメ軽減）を掛ける。
// 戻り値: 席ごとのHP差分（負数・整数）。呼び出し側が hp[i]=max(0,hp[i]+d) で反映する。
// 味方の失点には「深度被ダメ倍率（run.floor）」も乗る＝深いほど痛い（エンドレスの難度ランプ）。
// 計算文脈（mod・深度倍率・上限）をまとめる。deltas/breakdown が共有＝二重実装を避ける。
function damageContext(run, roles, winnerSeat, hpMax, battleMods = {}, deltas = []) {
  const m = run.mods;
  const im = itemMods(run); // 常設道具（光貨/回復/レア度/深度緩和）の集計
  const bm = biomeMods(run); // 層モディファイア（被ダメ/与ダメ）。帯ごとに変わる。
  // 深度被ダメ倍率は「軽身の符」等で緩和（1.0 を割らないよう (fdm-1) 部分にだけ係数）。層の被ダメ係数を最後に掛ける。
  const baseFdm = floorDamageMul(run.floor || 1);
  const fdm = (1 + Math.max(0, baseFdm - 1) * (1 - im.fdmReduceFrac)) * (bm.dmgTakenMul || 1);
  // 翻数(点数帯)係数：和了者の得た素点(gross)で「手の重さ」を判定。ツモは払い手が複数＝負deltaが2席以上。
  const winnerGross = winnerSeat != null && deltas[winnerSeat] > 0 ? deltas[winnerSeat] : 0;
  const isTsumo = deltas.filter((d) => d < 0).length >= 2;
  // 一撃死防止の上限（最大HP比）。守備流派(takeCap)を達成していれば、その上限まで締める（min＝より固い方）。
  // ＝事故スパイクを抑える分散低減（提案A・守備流）。守備capも基準capと同じ深度減衰をかける＝
  // 序盤〜中盤は強固に守るが、深層では守りも崩れて必ずトぶ（守備不死を防ぐ＝「必ず終わる」を保つ）。
  // 博打(takeRaise)は上限を上げる＝大振り（高分散）／守備(takeCap)は上限を下げる＝鉄壁（低分散）。
  // 両取りなら最終的に守備の min が勝つ（守りが優先＝矛盾なく安全側）。
  const raise = clusterTakeRaiseFrac(run);
  const baseCap = Math.min(1, lethalCapFrac(run.floor || 1) + raise);
  const guardCapBase = clusterTakeCapFrac(run);
  const guardCap = guardCapBase == null ? null
    : Math.min(1, guardCapBase + Math.max(0, (run.floor || 1) - RL_TUNE.lethalCapFadeStart) * RL_TUNE.lethalCapFadeSlope);
  const cap = guardCap != null ? Math.min(baseCap, guardCap) : baseCap;
  return {
    winnerIsAlly: winnerSeat != null && roles[winnerSeat] === "ally",
    dealMul: Math.min(RL_TUNE.dealCap, m.dealMul * (battleMods.dealMul || 1)),   // 鼓舞=次戦攻撃↑
    takeMul: Math.max(RL_TUNE.takeFloor, m.takeMul * (battleMods.takeMul || 1)), // 鉄壁=次戦被ダメ↓
    fdm,
    deal: dealDepthMul(run.floor || 1) * (bm.dmgDealMul || 1), // 層の与ダメ係数（黄昏=攻め映え）
    friendlyMul: RL_TUNE.friendlyMul,
    tierMul: hanTierMul(winnerGross), // 安手は軽く・跳満以上は重く
    isTsumo,
    lethalCapFrac: cap,
    tsumoCapFrac: cap * RL_TUNE.tsumoCapMul, // ツモは席あたり上限を一段下げる＝トビにくい
    hpMax: hpMax || [],
  };
}

// 1席ぶんの被ダメを計算し、計算の各段（内訳）も返す。guardRef.n はお守り残数（消費する場合は減らす）。
// 戻り: { value(<=0 の整数), steps:[{k:ラベル, v:途中値}], capped, guardUsed }
function seatDamage(d, role, i, ctx, guardRef) {
  if (!(d < 0)) return { value: 0, steps: [], capped: false };
  let scaled = d * DAMAGE_SCALE;
  const steps = [{ k: "素点", v: d }, { k: "HP変換 ×0.04", v: Math.round(scaled) }];
  if (role === "enemy") {
    // 敵への与ダメ（味方が和了したときのみ）。
    if (ctx.winnerIsAlly) {
      scaled *= ctx.dealMul; if (ctx.dealMul > 1.001) steps.push({ k: `攻撃 ×${ctx.dealMul.toFixed(2)}`, v: Math.round(scaled) });
      scaled *= ctx.deal; if (ctx.deal > 1.001) steps.push({ k: `深度 ×${ctx.deal.toFixed(2)}`, v: Math.round(scaled) });
    }
    return { value: Math.round(scaled), steps, capped: false };
  }
  // 味方が払う失点。
  scaled *= ctx.takeMul; if (ctx.takeMul < 0.999) steps.push({ k: `防御 ×${ctx.takeMul.toFixed(2)}`, v: Math.round(scaled) });
  if (ctx.winnerIsAlly) {
    // 同士討ち（味方の和了で味方が払う＝主に自摸被弾）。お守りがあれば無効化（1個消費）。
    if (guardRef.n > 0) { guardRef.n -= 1; return { value: 0, steps: [{ k: "素点", v: d }, { k: "庇いの守りで無効化", v: 0 }], capped: false, guardUsed: true }; }
    scaled *= ctx.friendlyMul; steps.push({ k: `同士討ち ×${ctx.friendlyMul}`, v: Math.round(scaled) });
  } else {
    // 敵の和了で味方が払う失点：翻数(点数帯)係数 → 深度倍率の順で乗る。手の重さが主役。
    scaled *= ctx.tierMul; if (Math.abs(ctx.tierMul - 1) > 0.001) steps.push({ k: `翻数 ×${ctx.tierMul.toFixed(2)}`, v: Math.round(scaled) });
    scaled *= ctx.fdm; if (ctx.fdm > 1.001) steps.push({ k: `深度 ×${ctx.fdm.toFixed(2)}`, v: Math.round(scaled) });
  }
  let val = Math.round(scaled);
  let capped = false;
  // 一撃死防止：最大HP比の上限。敵の和了による被弾だけが対象（同士討ちは friendlyMul で別軽減済み）。
  // ツモ被弾は上限を一段下げて「トビまではしない」。
  const capFrac = ctx.winnerIsAlly ? ctx.lethalCapFrac : (ctx.isTsumo ? ctx.tsumoCapFrac : ctx.lethalCapFrac);
  const cap = ctx.hpMax[i] ? Math.round(ctx.hpMax[i] * capFrac) : 0;
  if (cap && -val > cap) { val = -cap; capped = true; steps.push({ k: `上限 最大HPの${Math.round(capFrac * 100)}%`, v: val }); }
  return { value: val, steps, capped };
}

// 対局の素点差分(deltas)を独自HPスケールへ写す（与ダメ倍率・被ダメ軽減・深度・一撃死上限・お守り込み）。
//   hpMax … 席ごとの最大HP（任意）。渡すと1ハンドの被ダメに最大HP比の上限を掛ける（満タン即死を防ぐ）。
//   battleMods … 「次の1戦だけ」効果（道具）。{ dealMul, takeMul } を一時的に上乗せする。
export function rogueliteDamageDeltas(run, { deltas, roles, winnerSeat, hpMax, battleMods }) {
  const ctx = damageContext(run, roles, winnerSeat, hpMax, battleMods, deltas);
  const guardRef = { n: run.mods.friendlyGuard || 0 };
  const out = deltas.map((d, i) => seatDamage(d, roles[i], i, ctx, guardRef).value);
  if (guardRef.n !== (run.mods.friendlyGuard || 0)) run.mods.friendlyGuard = guardRef.n; // 消費を反映
  return out;
}

// ダメージの内訳（演出用）。各席の計算過程 steps を返す。お守りは消費しない（表示のみ・コピーで判定）。
export function explainRogueliteDamage(run, { deltas, roles, winnerSeat, hpMax, battleMods }) {
  const ctx = damageContext(run, roles, winnerSeat, hpMax, battleMods, deltas);
  const guardRef = { n: run.mods.friendlyGuard || 0 };
  return deltas.map((d, i) => ({ seat: i, role: roles[i], ...seatDamage(d, roles[i], i, ctx, guardRef) }));
}

// ---- ドラフト ----

// このランで「もう出さない」カードid（非stackable取得済み／maxStacks到達）を集める。
export function excludedCardIds(run) {
  const count = {};
  for (const id of run.cards) count[id] = (count[id] || 0) + 1;
  const ex = [];
  for (const c of ROGUELITE_CARD_MASTER) {
    const n = count[c.id] || 0;
    if (n === 0) continue;
    if (c.stackable === false) ex.push(c.id);
    else if (c.maxStacks && n >= c.maxStacks) ex.push(c.id);
  }
  return ex;
}

// 勝利後のバフドラフト3枚を決定論抽選（階層×撃破数でseed）。成績でレア度を上振れ。
//   perf: { ko, hpRatio } （rarityBiasFor へ渡す）。perf.bias で直接バイアス上書き（賭場=1）。
// HPがほぼ満タンなら純回復カード（kind:"heal"）は無駄なので候補から外す（偏り/死に札の解消）。
export function rollDraft(run, perf = {}) {
  const rng = makeRng(`${run.seed}:draft:${run.floor}:${run.cleared}`);
  // 役満ご祝儀：オールレジェンダリー（在庫が足りなければ epic でフォールバック）。
  if (perf.allLegendary) return drawCards(rng, { count: 3, forceRarity: "legendary", exclude: excludedCardIds(run) });
  const base = perf.bias != null ? perf.bias : rarityBiasFor({ ...perf, floor: run.floor });
  const rarityBias = Math.max(0, Math.min(1, base + itemMods(run).draftRarityBonus + (biomeMods(run).draftBias || 0))); // 強運の根付＋層(喧噪の都)で底上げ
  const exclude = excludedCardIds(run);
  const minFrac = Math.min(...run.party.map((m) => m.hp / (m.hpMax || 1)));
  if (minFrac > 0.85) {
    for (const c of ROGUELITE_CARD_MASTER) if (c.effect?.kind === "heal") exclude.push(c.id);
  }
  return drawCards(rng, { count: 3, rarityBias, exclude });
}

// ---- ドラフトのレア度バイアス ----
//
// 「飛ばすほど高レア」「点差で上回るほど」「深層ほど」＝物語の燃料（詩玥の点棒嫌いと緊張）。
//   ko       … 相手を1人以上飛ばして決着したか
//   hpRatio  … 決着時の自パーティHP残率(0..1)（圧勝ほど高い→ご褒美寄せ）
//   floor    … 到達階層
// 0..1 を返す（drawCards の rarityBias）。
export function rarityBiasFor({ ko = false, hpRatio = 0.5, floor = 1 } = {}) {
  let b = 0;
  if (ko) b += 0.35; // 飛ばし
  b += Math.max(0, hpRatio - 0.5) * 0.4; // 余裕勝ち
  b += Math.min(0.25, (floor - 1) * 0.03); // 深層
  return Math.max(0, Math.min(1, b));
}
