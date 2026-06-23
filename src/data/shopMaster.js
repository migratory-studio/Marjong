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
  { id: "coins", name: "軍資金",     kind: "startCoins", perLevel: 25,   maxLevel: 4, icon: "🪙", desc: "楼光の館・開始時に持つ光貨が増える。" },
  { id: "hp",    name: "鉄壁の備え", kind: "startHp",   perLevel: 0.03, maxLevel: 5, icon: "❤", desc: "楼光の館・開始時の最大HPが上がる。" },
];

// レベル別コスト（宝珠）。配列 index = 現在レベル（0→1段目を買う費用…）。length=maxLevel。
const BUFF_COST_TABLE = {
  deal:  [8, 14, 22, 32, 44],
  take:  [8, 14, 22, 32, 44],
  coins: [6, 12, 20, 30],
  hp:    [10, 18, 28, 40, 54],
};
// 現在レベルから次の1段の費用（宝珠）。上限到達なら null。
export function buffCost(id, currentLevel) {
  const t = BUFF_COST_TABLE[id] || [];
  return t[currentLevel] ?? null;
}

// バフ効果量を人に見せる整形（+12% / +50 光貨 など）。level=現在の購入段数。
export function buffEffectText(buff, level) {
  if (!level) return "—";
  if (buff.kind === "startCoins") return `+${buff.perLevel * level} 光貨`;
  return `+${Math.round(buff.perLevel * level * 100)}%`;
}

// 解禁アイテム。type=bg|bgm|char。key=各レジストリのキー（背景=対戦ホームのbgキー／BGM=HOME_BGM_CHOICES／char=charId）。
// 1回購入で profile.unlocked<Backgrounds|Bgms|Characters> に key を積む（恒久解禁）。
export const SHOP_UNLOCKS = [
  // 背景（解禁=対戦ホームで選べるようになる）。価格は一律 BG_UNLOCK_COST。
  { id: "bg-washitsu", type: "bg", key: "washitsu", name: "背景・和室",       cost: 30, img: "graphic/bg/sc/bg-washitsu.jpg", desc: "対戦ホームの背景に「和室」を追加する。" },
  { id: "bg-cafe",     type: "bg", key: "cafe",     name: "背景・喫茶店",     cost: 30, img: "graphic/bg/sc/bg-cafe.jpg",     desc: "対戦ホームの背景に「喫茶店」を追加する。" },
  { id: "bg-ryokan",   type: "bg", key: "ryokan",   name: "背景・旅館の和室", cost: 30, img: "graphic/bg/sc/bg-ryokan.jpg",   desc: "対戦ホームの背景に「旅館の和室」を追加する。" },
  // BGM（解禁=対戦ホームで選べるようになる）。key は HOME_BGM_CHOICES のキー。価格は一律 BGM_UNLOCK_COST。
  { id: "bgm-kengeki", type: "bgm", key: "kengeki", name: "BGM・剣戟",   cost: 25, desc: "対戦ホームのBGMに「剣戟」を追加する。" },
  { id: "bgm-epic",    type: "bgm", key: "epic",    name: "BGM・勇壮",   cost: 25, desc: "対戦ホームのBGMに「勇壮」を追加する。" },
  { id: "bgm-otogi4",  type: "bgm", key: "otogi4",  name: "BGM・おとぎ4", cost: 25, desc: "対戦ホームのBGMに「おとぎ4」を追加する。" },
  // ── キャラ解禁の受け皿（プラグ）。実キャラを売り出すときは下記の形で1行足すだけ：
  //   { id:"char-xxx", type:"char", key:"<charId>", name:"○○", cost:80, desc:"…", img:"<icon/portrait>" },
];

// profile から解禁配列名（type→profileキー）。新規typeを足すときはここに対応を1行。
export const UNLOCK_FIELD = { bg: "unlockedBackgrounds", bgm: "unlockedBgms", char: "unlockedCharacters" };

// item が解禁済みか（profile を見る）。type は item.type を使う。
export function isShopUnlocked(item, profile) {
  const field = UNLOCK_FIELD[item?.type];
  if (!field) return false;
  return (profile?.[field] || []).includes(item.key);
}
