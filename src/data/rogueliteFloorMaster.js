// 楼光の館・フロア種別マスタ — docs/shitei-calendar-and-roguelite.md「B. ローグライト」。
//
// 進路選択（毎ステップ2〜3択）の選択肢になるフロアの“素性”を集約する単一情報源。
// 種別・局数・抽選重みはここで足せる（完全マスタドリブン）。挙動（回復量・敵生成・UI）は
// run.js / main.js / rogueliteScreen.js 側に置き、本ファイルは定義データだけ。
//
// kind:
//   battle   … 対局フロア（enemy で敵の質を指定）
//   rest     … 休息（全員HP回復）
//   banquet  … 宴会（全員HP全回復＋確率で二日酔い）
//   treasure … 宝箱（戦闘なし・無料バフドラフト）
//   event    … 遭遇（会話＋2択／rogueliteEventMaster）
//   shop / gamble / shrine … 第2弾（プレースホルダ。weight=0＝当面プールに出さない）
//
// enemy（battle のみ）: 'mob'（通常）/ 'named'（強敵＝名前＋能力のモブ）/ 'boss'（ボス＝キャラ）
// baseHands … 1戦の基本局数（maxHands）。pursueMax … 追撃で足せる最大局数。
// weight … 進路抽選の重み（0＝プールから除外。boss は強制配置なので0）。

export const ROGUELITE_FLOOR_MASTER = [
  {
    id: "normal", name: "通常戦闘", kind: "battle", enemy: "mob",
    baseHands: 1, pursueMax: 1, weight: 50,
    blurb: "名もなき打ち手。1局で決着、追撃も可。",
  },
  {
    id: "elite", name: "強敵戦闘", kind: "battle", enemy: "named",
    baseHands: 2, pursueMax: 2, weight: 22,
    blurb: "名のある手練れ。2局戦・手強いが実入りも大きい。",
  },
  {
    id: "boss", name: "ボス", kind: "battle", enemy: "boss",
    baseHands: 2, pursueMax: 2, weight: 0, // 10階ごとに強制配置（抽選プール外）
    blurb: "館の主。2局戦・避けられぬ大一番。",
  },
  {
    id: "rest", name: "休息", kind: "rest",
    healFrac: 0.3, weight: 14,
    blurb: "ひと息つく。パーティ全員のHPを30%回復。",
  },
  {
    id: "banquet", name: "宴会", kind: "banquet",
    healFrac: 1.0, hangoverChance: 0.35, weight: 7,
    blurb: "大盤振る舞い。全回復するが、酔って次の1戦は能力が使えないことも。",
  },
  {
    id: "treasure", name: "宝箱", kind: "treasure",
    weight: 9,
    blurb: "戦わずして力を得る。バフを1つ無料で授かる。",
  },
  {
    id: "event", name: "遭遇", kind: "event",
    weight: 11,
    blurb: "誰かと出会う。短い対話と、ひとつの選択。",
  },
  // ---- 第2弾（通貨・供物） ----
  { id: "shop", name: "ショップ", kind: "shop", weight: 8, blurb: "光貨で強化を買い求める。回復やバフを品定め。" },
  { id: "gamble", name: "賭場", kind: "gamble", enemy: "named", baseHands: 1, weight: 6, blurb: "一局の大勝負。勝てば高レアと光貨が倍。負ければ手痛い。" },
  { id: "shrine", name: "祠", kind: "shrine", weight: 5, blurb: "供物を捧げ、力を請う。痛みと引き換えの強大な恩恵。" },
  { id: "forge", name: "鍛冶屋", kind: "forge", weight: 7, blurb: "光貨を払い、パーティのスキルレベルを鍛える。能力そのものが強くなる。" },
  { id: "recruit", name: "流派の門", kind: "recruit", weight: 5, blurb: "光貨を多く払い、新たな打ち手を仲間に。候補3人から1人を迎え、1人と入れ替える。" },
];

export const RECRUIT_COST = 50; // 流派の門：交代に要する光貨（大量消費）

// 鍛冶屋：スキルレベル+1の費用（光貨）。レベルが上がるほど高くなる。上限Lv10。
// 序盤から手が届くよう低め（旧 20+lv*12 は高すぎてスキル経済が死んでいた）。
export const SKILL_LEVEL_CAP = 10;
export function forgeCost(skillLevel = 1) {
  return 10 + skillLevel * 6;
}

// ラン内通貨「光貨」の経済（第2弾）。
// 1戦踏破で得る光貨（深いほど・強敵/ボス/撃破/追撃で増す）。
export function coinsForClear({ floor = 1, kind = "mob", ko = false, pursue = false } = {}) {
  let c = 10 + Math.floor(floor * 0.7); // 収入を底上げ（鍛冶/ショップを実用域に）
  if (kind === "boss") c *= 3; else if (kind === "named") c = Math.round(c * 1.6);
  if (ko) c += 4;
  if (pursue) c = Math.round(c * 1.3);
  return c;
}

// ショップの値付け（レア度→光貨）。回復/最大HPは固定枠。
export const SHOP_PRICE = { common: 12, rare: 24, epic: 44, legendary: 78 };
export const SHOP_HEAL_PRICE = 28;   // 全回復
export const SHOP_MAXHP_PRICE = 40;  // HP最大+20%

export function floorTypeById(id) {
  return ROGUELITE_FLOOR_MASTER.find((f) => f.id === id) || null;
}

export const BOSS_FLOOR = floorTypeById("boss");

// 進路の抽選プール（weight>0 かつボス以外）。
function routePool() {
  return ROGUELITE_FLOOR_MASTER.filter((f) => (f.weight || 0) > 0);
}

// 重み抽選で count 種を選ぶ（重複なし）。exclude（直近フロアidなど）は避ける。
//   rng … makeRng() の戻り（0..1）
//   force … 必ず候補に含めたいフロアid配列（例：序盤の遭遇イベント確定枠）。
// 戦闘が主・特殊は稀。最低1つは戦闘系を含める（手詰まり回避）。
export function drawFloorChoices(rng, { count = 3, exclude = [], force = [] } = {}) {
  const ex = new Set(exclude);
  const pool = routePool().filter((f) => !ex.has(f.id));
  const out = [];
  const used = new Set();
  const pickFrom = (cands) => {
    const list = cands.filter((f) => !used.has(f.id));
    if (!list.length) return null;
    const total = list.reduce((a, f) => a + f.weight, 0);
    let r = rng() * total;
    for (const f of list) if ((r -= f.weight) < 0) { used.add(f.id); return f; }
    used.add(list[0].id); return list[0];
  };
  // 1枠目は必ず戦闘系（normal/elite）から＝進めなくなる事故を防ぐ。
  const battle = pickFrom(pool.filter((f) => f.kind === "battle"));
  if (battle) out.push(battle);
  // 強制枠（遭遇イベント確定など）を戦闘の次に差し込む。
  for (const id of force) {
    if (out.length >= count) break;
    const f = ROGUELITE_FLOOR_MASTER.find((x) => x.id === id);
    if (f && !used.has(f.id)) { used.add(f.id); out.push(f); }
  }
  while (out.length < count) {
    const f = pickFrom(pool);
    if (!f) break;
    out.push(f);
  }
  return out;
}
