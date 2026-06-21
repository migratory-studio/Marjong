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
import { buildRivalById, RIVAL_IDS } from "../data/tournamentRivalMaster.js";
import { paramsFromLv, makeRng } from "../autobattle/autoBattle.js";
import { freshMods, applyCard } from "./cardEffects.js";
import { ROGUELITE_CARD_MASTER, drawCards, cardById } from "../data/rogueliteCardMaster.js";
import { SHOP_PRICE, SHOP_HEAL_PRICE, SHOP_MAXHP_PRICE } from "../data/rogueliteFloorMaster.js";

// 点棒→HP の写像係数（25000点 → 1000HP）。味方HP・与被ダメ双方に一貫適用。
export const DAMAGE_SCALE = 1000 / 25000; // = 0.04
export const ROGUELITE_BASE_ENEMY_HP = 700; // 階層1の敵HP。硬すぎ＝アガリ不発の体感を緩和（1000→700。満貫1発で約半分削れ、2発で撃破）。
const ENEMY_HP_GROWTH = 0.11; // 1階ごとの敵HP増加率（複利）。硬すぎ＝アガリ不発の体感を緩和（0.14→0.11）。
const ENEMY_HP_CAP_FLOOR = 30; // この階層で頭打ち（青天井回避）
const BOSS_EVERY = 10; // この階層ごとにボスフロア（10F・進路選択では強制配置）

// バランス校正値（test/roguelite-balance.mjs で実測決定・1か所集約）。
// テストはこのオブジェクトを書き換えて掃引できる（本番は既定値）。
export const RL_TUNE = {
  regenFrac: 0.18,    // 1階踏破ごとの部分回復（最大HP比）。回復しすぎず消耗を残す。
  floorDmgStart: 5,   // この階から被ダメ深度倍率が立ち上がる（序盤は警戒不要）
  floorDmgSlope: 1.8, // 深度1階あたりの被ダメ増（青天井＝必ず終わる主レバー）。「自分が柔らかすぎる」体感を緩和（2.2→1.8）。
  dealCap: 3.0,       // 与ダメ倍率の実効上限（積み過ぎの無双化を防ぐ）
  takeFloor: 0.4,     // 被ダメ倍率の実効下限＝軽減は最大60%まで（持続を有界にする）
  friendlyMul: 0.3,   // 味方の和了で味方が払う分（＝主に自摸の同士討ち）を大幅軽減（1.0→0.3）。「味方がトぶ不思議」対策。
  dealDepthStart: 1,  // 与ダメ深度ボーナスの立ち上がり階
  dealDepthSlope: 0.04, // 深度1階あたりの与ダメ増。敵HP成長に追従させ「アガっても嬉しくない」を解消。
};
export const REGEN_FRAC = RL_TUNE.regenFrac; // 後方互換の別名（参照箇所用）

// 深度被ダメ倍率：param 上限（敵Lv10）の先でも難度が上がり続ける＝エンドレスが必ず終わる。
// ※ 敵の攻撃で味方が受ける失点にだけ乗る（味方同士の自摸被弾には乗せない＝rogueliteDamageDeltas 参照）。
export function floorDamageMul(floor = 1) {
  return 1 + Math.max(0, floor - RL_TUNE.floorDmgStart) * RL_TUNE.floorDmgSlope;
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

// 階層→敵1人あたりのHP（複利成長・上限で頭打ち）。
export function floorEnemyHp(floor = 1) {
  const f = Math.min(floor, ENEMY_HP_CAP_FLOOR);
  return Math.round(ROGUELITE_BASE_ENEMY_HP * Math.pow(1 + ENEMY_HP_GROWTH, f - 1));
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
    return { id: p.id, char: p.char, hpMax, hp: hpMax, hungover: false };
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
    visited: [], // 通過したフロアid（進路の被り回避・来歴）
    alive: true,
  };
}

export { applyCard };

// パーティ全員を最大比 frac で回復（休息/宴会）。トビ(hp0)も回復＝復帰できる。
export function healParty(run, frac) {
  for (const m of run.party) m.hp = Math.min(m.hpMax, m.hp + Math.round(m.hpMax * frac));
}

// 二日酔い抽選（宴会）。各メンバー独立に chance で hungover を立てる。決定論 rng。
export function rollHangover(run, chance, rng) {
  for (const m of run.party) if (rng() < chance) m.hungover = true;
}

// ---- ショップ（第2弾・光貨） ----

// ショップ在庫を決定論生成：バフ3種（取得済み除外）＋全回復＋HP最大+。価格はレア度/固定。
export function shopStock(run, rng) {
  const cards = drawCards(rng, { count: 3, exclude: excludedCardIds(run) });
  const items = cards.map((c) => ({ type: "card", card: c, price: SHOP_PRICE[c.rarity] || 20, name: c.name, desc: c.desc, rarity: c.rarity }));
  items.push({ type: "heal", price: SHOP_HEAL_PRICE, name: "気付け薬", desc: "パーティ全員のHPを50%回復する。", rarity: "common" });
  items.push({ type: "maxhp", price: SHOP_MAXHP_PRICE, name: "厚みの護符", desc: "HP最大値が20%増える（現在HPも底上げ）。", rarity: "rare" });
  return items;
}

// 購入：光貨が足りれば支払って効果適用。戻り値 true=購入成立。
export function buyShopItem(run, item) {
  if (!item || (run.coins || 0) < item.price) return false;
  run.coins -= item.price;
  if (item.type === "card") applyCard(run, item.card);
  else if (item.type === "heal") healParty(run, 0.5);
  else if (item.type === "maxhp") applyCard(run, { id: "_shop-maxhp", effect: { kind: "maxHpUp", mul: 1.2 } });
  return true;
}

// ---- 祠（第2弾・供物） ----

// 祠の供物2択（＋去る）。痛みと引き換えの強大な恩恵。outcome は applyEventOutcome 互換。
export function shrineOffers(run) {
  return [
    { label: "HPを捧げる（最大HPの30%）", reply: "祠が応える――力が body に満ちる。", outcome: { hurtFrac: 0.3, effect: { kind: "compound", parts: [{ kind: "dealMul", mul: 1.4 }, { kind: "takeReduce", rate: 0.2 }] } } },
    { label: "光貨を捧げる（40）", reply: "供物は受け取られた。確かな手応え。", outcome: { coins: -40, effect: { kind: "maxHpUp", mul: 1.25 } } },
    { label: "何も捧げず去る", reply: "祠は沈黙したまま。", outcome: {} },
  ];
}

// 着卓する味方2人＝生存メンバー（hp>0）のうちHP上位2人。最も傷ついた控えは休んで回復に回る
// （3人パーティ＝交代でHPを分散・回復できるサステイン）。人間(party[0])が生存し上位2人に入るなら
// 席0へ固定（操作キャラ）。生存1人なら影武者（同ステの2人目）で卓を成立させる。
export function seatedAllies(run) {
  // 出場順の指定（run.lineup＝メンバーid配列）があれば、その順で生存上位2人を着卓させる
  // ＝プレイヤーが「編成」モーダルで任意に入れ替えた並びを尊重する。未指定なら従来どおり
  // HP上位2人を自動ローテ（傷ついた控えは休んで回復）。
  let living;
  if (Array.isArray(run.lineup) && run.lineup.length) {
    const byId = new Map(run.party.map((m) => [m.id, m]));
    const ordered = run.lineup.map((id) => byId.get(id)).filter(Boolean);
    // lineup に載っていないメンバーは末尾へ（保険）。
    for (const m of run.party) if (!ordered.includes(m)) ordered.push(m);
    living = ordered.filter((m) => m.hp > 0);
  } else {
    living = run.party.filter((m) => m.hp > 0).sort((a, b) => b.hp - a.hp);
  }
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

// ゲームオーバー＝パーティ全員のトビ（着卓中の2人だけでなく控えも全滅）。
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
export function enemyUnitForFloor(run, floorType = null, salt = "") {
  const floor = run.floor;
  const kind = floorType?.enemy || (isBossFloor(floor) ? "boss" : "mob");
  const hpMul = kind === "boss" ? 1.3 : kind === "named" ? 1.2 : 1;
  const lvBump = kind === "boss" ? 2 : kind === "named" ? 1 : 0;
  const hp = Math.round(floorEnemyHp(floor) * hpMul);
  const lv = Math.min(10, floorEnemyLv(floor) + lvBump);
  const rng = makeRng(`${run.seed}:floor${floor}:enemy${salt}`);
  const members = [];

  if (kind === "boss") {
    const bossId = RIVAL_IDS[Math.floor(rng() * RIVAL_IDS.length)];
    const lead = buildRivalById(bossId, hp);
    if (lead) { lead.params = paramsFromLv(lv, `${run.seed}:boss${floor}${salt}`); members.push(lead); }
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
export function rogueliteDamageDeltas(run, { deltas, roles, winnerSeat }) {
  const m = run.mods;
  const winnerIsAlly = winnerSeat != null && roles[winnerSeat] === "ally";
  const dealMul = Math.min(RL_TUNE.dealCap, m.dealMul);   // 与ダメは上限でクランプ
  const takeMul = Math.max(RL_TUNE.takeFloor, m.takeMul); // 被ダメ軽減は下限でクランプ（最大60%）
  const fdm = floorDamageMul(run.floor || 1);   // 敵の攻撃で味方が受ける深度ペナルティ
  const deal = dealDepthMul(run.floor || 1);    // 味方の与ダメ深度ボーナス（敵HP成長に追従）
  let guard = m.friendlyGuard || 0;             // 味方ツモ被弾を無効化するお守り残数（消費する）
  const out = deltas.map((d, i) => {
    if (!(d < 0)) return 0; // 失点のみHPに効く
    let scaled = d * DAMAGE_SCALE;
    if (roles[i] === "enemy") {
      if (winnerIsAlly) scaled *= dealMul * deal; // 敵への与ダメ：倍率＋深度ボーナス
      return Math.round(scaled);
    }
    // 味方が払う失点。
    scaled *= takeMul;
    if (winnerIsAlly) {
      // 味方の和了で味方が払う＝同士討ち（主に自摸被弾）。お守りがあれば無効化（1個消費）。
      if (guard > 0) { guard -= 1; return 0; }
      scaled *= RL_TUNE.friendlyMul; // 同士討ちは大幅軽減
    } else {
      scaled *= fdm; // 敵の攻撃だけ深度ペナルティ
    }
    return Math.round(scaled);
  });
  if (guard !== (m.friendlyGuard || 0)) m.friendlyGuard = guard; // 消費を反映
  return out;
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
  const rarityBias = perf.bias != null ? perf.bias : rarityBiasFor({ ...perf, floor: run.floor });
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
