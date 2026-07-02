// 宝珠ショップ・カタログ — アカウント通貨「宝珠」で恒久強化や解禁を買う単一情報源（モック土台）。
//
// 2系統:
//   恒久バフ(SHOP_BUFFS) … 次回以降の「楼光の館」ランに乗る補正値。レベル制（購入で+1）。
//                           run生成時に main.js の applyShopBuffsToRun で run へ反映する。
//   解禁(SHOP_UNLOCKS)   … 背景 / BGM / キャラ等の1回購入の解禁。profile.unlocked* に key を積む。
//
// 拡張は配列に1行足すだけ。効果の適用は呼び出し側（main.js / battleHomeScreen）が kind/type/key を見て行う。
// ※現状はモック。経済（コスト/効果量）は仮値で、バランス調整は別途。

// 恒久バフ。kind=run生成時の適用先（main.js が解釈）。perLevel=1段あたりの効果量。maxLevel=購入上限。
export const SHOP_BUFFS = [
  { id: "deal",  name: "攻めの極意", kind: "dealMul",   perLevel: 0.04, maxLevel: 5, icon: "⚔", desc: "楼光の館・開始時から与ダメージが上がる。" },
  { id: "take",  name: "守りの極意", kind: "takeMul",   perLevel: 0.03, maxLevel: 5, icon: "🛡", desc: "楼光の館・開始時から被ダメージが下がる。" },
  { id: "coins", name: "軍資金",     kind: "startCoins", perLevel: 25,   maxLevel: 5, icon: "🪙", desc: "楼光の館・開始時に持つ光貨が増える。" },
  { id: "hp",    name: "鉄壁の備え", kind: "startHp",   perLevel: 0.03, maxLevel: 5, icon: "❤", desc: "楼光の館・開始時の最大HPが上がる。" },
  // 流派の段階解放（1回購入＝恒久）。既定は各流派1段目（開眼/鉄壁等）まで。これを買うと2段目（極み等）が解放され、
  // 同流派5枚でさらに跳ねるようになる。kind=clusterTier は applyShopBuffsToRun が run.clusterTierCap を底上げ。
  { id: "clusterTier", name: "流派の極意", kind: "clusterTier", perLevel: 1, maxLevel: 1, icon: "🌀", desc: "楼光の館・流派の二段目（極み・疾風・不抜など）が解放される。同じ流派を5枚集めると、しきい値でさらに大きく跳ねる。" },
];

// レベル別コスト（宝珠）。配列 index = 現在レベル（0→1段目を買う費用…）。length=maxLevel。
const BUFF_COST_TABLE = {
  deal:  [50, 120, 180, 250, 350],
  take:  [30, 40, 70, 120, 180],
  coins: [50, 120, 180, 250, 350],
  hp:    [55, 150, 220, 300, 400],
  clusterTier: [120], // 1回購入＝流派2段目の恒久解放（節目の大きな買い物）
};
// 現在レベルから次の1段の費用（宝珠）。上限到達なら null。
export function buffCost(id, currentLevel) {
  const t = BUFF_COST_TABLE[id] || [];
  return t[currentLevel] ?? null;
}

// バフ効果量を人に見せる整形（+12% / +50 光貨 など）。level=現在の購入段数。
export function buffEffectText(buff, level) {
  if (buff.kind === "clusterTier") return level > 0 ? "二段目 解放済" : "一段目まで"; // 1回購入の解放（割合表示しない）
  if (!level) return "—";
  if (buff.kind === "startCoins") return `+${buff.perLevel * level} 光貨`;
  return `+${Math.round(buff.perLevel * level * 100)}%`;
}

// 解禁アイテム。type=bg|bgm|char。key=各レジストリのキー（背景=対戦ホームのbgキー／BGM=HOME_BGM_CHOICES／char=charId）。
// 1回購入で profile.unlocked<Backgrounds|Bgms|Characters> に key を積む（恒久解禁）。
export const SHOP_UNLOCKS = [
  // 背景（解禁=対戦ホームで選べるようになる）。価格は一律 BG_UNLOCK_COST。
  { id: "bg-washitsu", type: "bg", key: "washitsu", name: "背景・和室",       cost: 30, img: "graphic/bg/sc/bg-washitsu.jpg", desc: "対戦ホームの背景に「和室」を追加する。", weight: 3 },
  { id: "bg-cafe",     type: "bg", key: "cafe",     name: "背景・喫茶店",     cost: 30, img: "graphic/bg/sc/bg-cafe.jpg",     desc: "対戦ホームの背景に「喫茶店」を追加する。" },
  { id: "bg-ryokan",   type: "bg", key: "ryokan",   name: "背景・旅館の和室", cost: 30, img: "graphic/bg/sc/bg-ryokan.jpg",   desc: "対戦ホームの背景に「旅館の和室」を追加する。" },
  // ↓ ここから大量追加。key は HOME_BG_CHOICES のキーと一致させること。価格は一律 30。
  { id: "bg-kyudo",       type: "bg", key: "kyudo",       name: "背景・弓道場",       cost: 30, img: "graphic/bg/sc/bg-kyudo.jpg",           desc: "対戦ホームの背景に「弓道場」を追加する。" },
  { id: "bg-festival",    type: "bg", key: "festival",    name: "背景・縁日",         cost: 30, img: "graphic/bg/sc/bg-festival.jpg",        desc: "対戦ホームの背景に「縁日」を追加する。" },
  { id: "bg-bar",         type: "bg", key: "bar",         name: "背景・バー",         cost: 30, img: "graphic/bg/sc/bg-bar.jpg",             desc: "対戦ホームの背景に「バー」を追加する。" },
  { id: "bg-restaurant",  type: "bg", key: "restaurant",  name: "背景・レストラン",   cost: 30, img: "graphic/bg/sc/bg-restaurant.jpg",      desc: "対戦ホームの背景に「レストラン」を追加する。" },
  { id: "bg-park",        type: "bg", key: "park",        name: "背景・公園",         cost: 30, img: "graphic/bg/sc/bg-park.jpg",            desc: "対戦ホームの背景に「公園」を追加する。" },
  { id: "bg-city",        type: "bg", key: "city",        name: "背景・夜景",         cost: 30, img: "graphic/bg/sc/bg-city.jpg",            desc: "対戦ホームの背景に「夜景」を追加する。" },
  { id: "bg-station",     type: "bg", key: "station",     name: "背景・駅",           cost: 30, img: "graphic/bg/sc/bg-station.jpg",         desc: "対戦ホームの背景に「駅」を追加する。" },
  { id: "bg-train",       type: "bg", key: "train",       name: "背景・電車",         cost: 30, img: "graphic/bg/sc/bg-train.jpg",           desc: "対戦ホームの背景に「電車」を追加する。" },
  { id: "bg-convenience", type: "bg", key: "convenience", name: "背景・コンビニ",     cost: 30, img: "graphic/bg/sc/bg-convenience.jpg",     desc: "対戦ホームの背景に「コンビニ」を追加する。" },
  { id: "bg-arcade",      type: "bg", key: "arcade",      name: "背景・ゲームセンター", cost: 30, img: "graphic/bg/sc/bg-arcade.jpg",         desc: "対戦ホームの背景に「ゲームセンター」を追加する。" },
  { id: "bg-classroom",   type: "bg", key: "classroom",   name: "背景・教室",         cost: 30, img: "graphic/bg/sc/bg-classroom.jpg",       desc: "対戦ホームの背景に「教室」を追加する。" },
  { id: "bg-clubroom",    type: "bg", key: "clubroom",    name: "背景・部室",         cost: 30, img: "graphic/bg/sc/bg-clubroom.jpg",        desc: "対戦ホームの背景に「部室」を追加する。" },
  { id: "bg-corridor",    type: "bg", key: "corridor",    name: "背景・学校の廊下",   cost: 30, img: "graphic/bg/sc/bg-school-corridor.jpg", desc: "対戦ホームの背景に「学校の廊下」を追加する。" },
  { id: "bg-gate",        type: "bg", key: "gate",        name: "背景・校門",         cost: 30, img: "graphic/bg/sc/bg-school-gate.jpg",     desc: "対戦ホームの背景に「校門」を追加する。" },
  { id: "bg-rooftop",     type: "bg", key: "rooftop",     name: "背景・屋上",         cost: 30, img: "graphic/bg/sc/bg-school-rooftop.jpg",  desc: "対戦ホームの背景に「屋上」を追加する。" },
  { id: "bg-campus",      type: "bg", key: "campus",      name: "背景・学び舎",       cost: 30, img: "graphic/bg/sc/bg-campus.jpg",          desc: "対戦ホームの背景に「学び舎」を追加する。" },
  { id: "bg-blackboard",  type: "bg", key: "blackboard",  name: "背景・黒板",         cost: 30, img: "graphic/bg/sc/bg-blackboard.jpg",      desc: "対戦ホームの背景に「黒板」を追加する。" },
  { id: "bg-ruins",       type: "bg", key: "ruins",       name: "背景・遺跡",         cost: 30, img: "graphic/bg/sc/bg-ruins.jpg",           desc: "対戦ホームの背景に「遺跡」を追加する。" },
  { id: "bg-dungeon",     type: "bg", key: "dungeon",     name: "背景・ダンジョン",   cost: 30, img: "graphic/bg/sc/bg-dungeon.jpg",         desc: "対戦ホームの背景に「ダンジョン」を追加する。" },
  { id: "bg-hideout",     type: "bg", key: "hideout",     name: "背景・アジト",       cost: 30, img: "graphic/bg/sc/bg-hideout.jpg",         desc: "対戦ホームの背景に「アジト」を追加する。" },
  { id: "bg-basement",    type: "bg", key: "basement",    name: "背景・地下室",       cost: 30, img: "graphic/bg/sc/bg-basement.jpg",        desc: "対戦ホームの背景に「地下室」を追加する。" },
  // げーむまてりあるず・白い雀荘シリーズ（高級ライン＝cost は通常背景の倍）。
  { id: "bg-parlor",         type: "bg", key: "parlor",         name: "背景・雀荘",           cost: 60, img: "graphic/bg/sc/bg-parlor.jpg",         desc: "対戦ホームの背景に「雀荘」を追加する。白基調の明るい打ち場。" },
  { id: "bg-parlornatural",  type: "bg", key: "parlornatural",  name: "背景・雀荘（木漏れ）", cost: 60, img: "graphic/bg/sc/bg-parlor-natural.jpg", desc: "対戦ホームの背景に「雀荘（木漏れ）」を追加する。木のぬくもりが灯る打ち場。" },
  { id: "bg-parlorhall",     type: "bg", key: "parlorhall",     name: "背景・雀荘（大広間）", cost: 60, img: "graphic/bg/sc/bg-hall.jpg",           desc: "対戦ホームの背景に「雀荘（大広間）」を追加する。卓が並ぶ大会仕込みの広間。" },
  { id: "bg-parlornoir",     type: "bg", key: "parlornoir",     name: "背景・雀荘（黒革）",   cost: 60, img: "graphic/bg/sc/bg-parlor-noir.jpg",    desc: "対戦ホームの背景に「雀荘（黒革）」を追加する。黒革の椅子が締める勝負の間。" },
  // BGM（解禁=対戦ホームで選べるようになる）。key は HOME_BGM_CHOICES のキー。価格は一律 25。
  { id: "bgm-kengeki", type: "bgm", key: "kengeki", name: "BGM・剣戟",   cost: 25, desc: "対戦ホームのBGMに「剣戟」を追加する。" },
  { id: "bgm-epic",    type: "bgm", key: "epic",    name: "BGM・勇壮",   cost: 25, desc: "対戦ホームのBGMに「勇壮」を追加する。" },
  { id: "bgm-otogi4",  type: "bgm", key: "otogi4",  name: "BGM・おとぎ4", cost: 25, desc: "対戦ホームのBGMに「おとぎ4」を追加する。" },
  { id: "bgm-ohayashi2a", type: "bgm", key: "ohayashi2a", name: "BGM・お囃子",   cost: 25, desc: "対戦ホームのBGMに「お囃子」を追加する。" },
  { id: "bgm-shizima3",   type: "bgm", key: "shizima3",   name: "BGM・しじま",   cost: 25, desc: "対戦ホームのBGMに「しじま」を追加する。" },
  { id: "bgm-entangle",   type: "bgm", key: "entangle",   name: "BGM・読み合い", cost: 25, desc: "対戦ホームのBGMに「読み合い」を追加する。" },
  { id: "bgm-tatari",     type: "bgm", key: "tatari",     name: "BGM・祟り",     cost: 25, desc: "対戦ホームのBGMに「祟り」を追加する。" },
  { id: "bgm-carnival",   type: "bgm", key: "carnival",   name: "BGM・宵の祭舞", cost: 25, desc: "対戦ホームのBGMに「宵の祭舞」を追加する。" },
  { id: "bgm-forest",     type: "bgm", key: "forest",     name: "BGM・惑いの森", cost: 25, desc: "対戦ホームのBGMに「惑いの森」を追加する。" },
  { id: "bgm-citybreath", type: "bgm", key: "citybreath", name: "BGM・夜の街",   cost: 25, desc: "対戦ホームのBGMに「夜の街」を追加する。" },
  // キャラ解禁。key は charId。買うと profile.unlockedCharacters に積まれ、characterMaster で locked:true の
  // キャラが選択導線（フリー対戦など）で選べるようになる。実キャラを売り出すときは下記の形で1行足すだけ。
  { id: "char-teacher", type: "char", key: "teacher", name: "篠宮 栞", cost: 150, img: "graphic/chars/teacher/portrait.png", desc: "学校教師「篠宮 栞」を仲間に。能力『模範解答』で麻雀のサポートをしてくれる。" },
  { id: "char-agentRE", type: "char", key: "agentRE", name: "エージェント・RE", cost: 150, img: "graphic/chars/agentRE/portrait.png", desc: "寡黙な諜報の打ち手「エージェント・RE」を仲間に。能力『リコール』で一度手放した牌すら取引材料に変える。" },
];

// profile から解禁配列名（type→profileキー）。新規typeを足すときはここに対応を1行。
export const UNLOCK_FIELD = { bg: "unlockedBackgrounds", bgm: "unlockedBgms", char: "unlockedCharacters" };

// item が解禁済みか（profile を見る）。type は item.type を使う。
export function isShopUnlocked(item, profile) {
  const field = UNLOCK_FIELD[item?.type];
  if (!field) return false;
  return (profile?.[field] || []).includes(item.key);
}

// ===== 日替わり陳列（背景/BGM）==============================================
// 背景・BGM は在庫が多いので毎日 weight 重み付きで N 点だけ並べる（24時=ローカル日付の境界でリセット）。
// 「同じ日＝同じ品揃え」を保証するため、選定は **日付のみ** をシードにした決定論抽選にする
//  （所持状況に依存しない＝その日のうちに1点買っても残りがシャッフルされない。購入画面の出入り・再描画でも不変）。
// 所持済みアイテムも除外しない（並びは固定。買ったものは呼び出し側で「解禁済」表示になる）。

// ローカル日付 → 連番シード（YYYYMMDD）。24時=日付が変わる瞬間に値が変わる＝そこでリセット。
export function shopDaySeed(date = new Date()) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

// 品揃えの有料更新（リロール）。1日 MAX_SHOP_REROLLS 回まで。N回目（0始まり）の費用は SHOP_REROLL_COSTS[N]。
// 24時＝日付が変われば回数はリセット（呼び出し側が day を見て count を 0 に戻す）。
export const SHOP_REROLL_COSTS = [10, 50, 100];
export const MAX_SHOP_REROLLS = SHOP_REROLL_COSTS.length;
// 次の1回の費用（宝珠）。used=本日すでに使った回数。上限到達なら null。
export function shopRerollCost(used) {
  return SHOP_REROLL_COSTS[used | 0] ?? null;
}

// 文字列 → 32bit ハッシュ（決定論シード用）。
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// 決定論PRNG（mulberry32）。同じシードなら毎回同じ列を返す。
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// weight 重み付き・非復元サンプリング（rng=0..1）。weight 未指定/0以下は最低 0 として扱い、全0なら一様。
function weightedSample(pool, n, rng) {
  const bag = pool.map((it) => ({ it, w: Math.max(0, Number(it.weight ?? 1)) }));
  const out = [];
  while (out.length < n && bag.length) {
    const total = bag.reduce((s, p) => s + p.w, 0);
    let idx;
    if (total <= 0) {
      idx = Math.floor(rng() * bag.length);
    } else {
      let r = rng() * total;
      for (idx = 0; idx < bag.length - 1; idx++) { r -= bag[idx].w; if (r <= 0) break; }
    }
    out.push(bag.splice(idx, 1)[0].it);
  }
  return out;
}

// その日に陳列する type(bg|bgm) の解禁アイテム配列（既定3点）。プールが count 以下なら全部返す。
// reroll=有料更新の回数（0=無料ベース）。シードに織り込むので回数が増えるたびに別の3点になり、
// かつ (daySeed, type, reroll) の純関数＝同条件なら何度呼んでも同じ＝再描画・出入りでブレない。
// 並びはカタログ順を保つ（抽選順のランダム並びにしない＝見た目が安定）。
export function dailyShopUnlocks(type, count = 3, daySeed = shopDaySeed(), reroll = 0) {
  const pool = SHOP_UNLOCKS.filter((it) => it.type === type);
  if (pool.length <= count) return pool;
  const rng = mulberry32(hashStr(`${daySeed}:${type}:${reroll}`));
  const picked = weightedSample(pool, count, rng);
  const order = new Map(pool.map((it, i) => [it.id, i]));
  return picked.sort((a, b) => order.get(a.id) - order.get(b.id));
}
