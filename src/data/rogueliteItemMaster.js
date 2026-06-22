// 楼光の館・アイテムマスタ（B案：バフ/必殺技とは別軸の「道具」）。
//
// 道具は最大3スロット。入手時に枠が埋まっていれば入れ替える（ポケモン式）。使用はフロア選択時。
// 種別:
//   active  … フロア選択で「使う」消費アイテム。即時効果 or「次戦だけ」効果(run.nextBattle)を仕込む。
//   passive … スロットに入れている間ずっと効く（取り出すと効果も消える）。run.items から都度集計。
//   trigger … 条件で自動発動して消える（例：宴会で酔い止めが効いて消費）。
//
// 効果の当て込みは src/roguelite/itemEffects.js（唯一の場所）。本ファイルは定義データだけ。
// マスタドリブン：新アイテムはここに1件足す（effect.kind が既知なら配線不要）。
//
// アイコン画像（任意）：各エントリに `icon: "graphic/ui/roguelite/items/<id>.png"` を足すと、
// UIが絵文字マークの代わりにその画像を表示する（未指定なら kind の絵文字でフォールバック）。
// 推奨サイズ 48×48 程度・正方形・透過PNG/SVG。画像が見つからなければ自動で絵文字に戻る。

export const ITEM_KIND_META = {
  active:  { label: "消費", color: "#ff8f6b", mark: "⚑" },
  passive: { label: "常設", color: "#6fb6ff", mark: "∞" },
  trigger: { label: "自動", color: "#6fe08a", mark: "✦" },
};

export const ROGUELITE_ITEM_MASTER = [
  // ---- 消費（フロア選択で使う） ----
  {
    id: "heal-potion", name: "治癒の霊薬", kind: "active", cost: 22,
    desc: "生存している味方のHPを40%回復する。",
    effect: { kind: "heal", amount: 0.4 },
  },
  {
    id: "endure-charm", name: "不屈のお守り", kind: "active", cost: 30,
    desc: "使うと次の1戦、致命の一撃を受けてもダウンせずHP1で踏みとどまる（各メンバー1回）。",
    effect: { kind: "nextBattle", set: { endure: true } },
  },
  {
    id: "map-copy", name: "地図の写し", kind: "active", cost: 18,
    desc: "今いる進路の選択肢を引き直す。気に入らない分かれ道をやり直せる。",
    effect: { kind: "reroll" },
  },
  {
    id: "weaken-talisman", name: "弱体の札", kind: "active", cost: 28,
    desc: "次の1戦、敵の初期HPを25%下げる。壁やボスを崩す一手。",
    effect: { kind: "nextBattle", set: { enemyHpMul: 0.75 } },
  },
  {
    id: "war-drum", name: "鼓舞の陣太鼓", kind: "active", cost: 26,
    desc: "次の1戦だけ、与えるダメージが30%増える。",
    effect: { kind: "nextBattle", set: { dealMul: 1.3 } },
  },
  {
    id: "iron-wall", name: "鉄壁の陣", kind: "active", cost: 26,
    desc: "次の1戦だけ、受けるダメージが30%減る。",
    effect: { kind: "nextBattle", set: { takeMul: 0.7 } },
  },
  {
    id: "free-riichi", name: "不抜のリーチ", kind: "active", cost: 20,
    desc: "次の1戦、リーチ宣言のHP消費がなくなる。",
    effect: { kind: "nextBattle", set: { freeRiichi: true } },
  },
  {
    id: "forge-tea", name: "鍛えの一服", kind: "active", cost: 34,
    desc: "その場でパーティのスキルレベルを1上げる（鍛冶屋いらず）。",
    effect: { kind: "skillUp", delta: 1 },
  },
  {
    // 層に踏み入る前に「巡りの賽」で層を引き直す。フロア選択では使わない（useAt:"biome"）。
    id: "biome-dice", name: "巡りの賽", kind: "active", cost: 32, useAt: "biome", glyph: "🎲",
    desc: "層に踏み入る前に、その層を一度だけ引き直せる（引き直すと消える）。",
    effect: { kind: "biomeReroll" },
  },
  // ---- 自動発動（条件で勝手に効いて消える） ----
  {
    id: "sober-charm", name: "酔い止め", kind: "trigger", cost: 16,
    desc: "宴会で酔いそうになると、身代わりに割れて二日酔いを防ぐ（発動すると消える）。",
    effect: { kind: "trigger", on: "banquet" },
  },
  // ---- 常設（スロットに入れている間ずっと） ----
  {
    id: "merchant-scale", name: "商人の天秤", kind: "passive", cost: 40,
    desc: "持っている間、戦闘踏破で得る光貨が30%増える。",
    effect: { kind: "passive", coinMul: 1.3 },
  },
  {
    id: "lucky-charm", name: "強運の根付", kind: "passive", cost: 44,
    desc: "持っている間、バフドラフトのレア度が上がりやすくなる。",
    effect: { kind: "passive", draftRarityBonus: 0.2 },
  },
  {
    id: "light-body", name: "軽身の符", kind: "passive", cost: 44,
    desc: "持っている間、深層で増す被ダメージ（深度倍率）を20%和らげる。",
    effect: { kind: "passive", fdmReduceFrac: 0.2 },
  },
  {
    id: "healing-censer", name: "癒しの香炉", kind: "passive", cost: 38,
    desc: "持っている間、休息・宴会の回復量が50%増える。",
    effect: { kind: "passive", healMul: 1.5 },
  },
];

export const ITEM_SLOTS = 3; // 道具スロット数

export function itemById(id) {
  return ROGUELITE_ITEM_MASTER.find((it) => it.id === id) || null;
}

// このランで未所持の道具からランダム抽選（報酬用）。exclude（所持中id）は避ける。
export function drawItems(rng, { count = 1, exclude = [] } = {}) {
  const ex = new Set(exclude);
  const pool = ROGUELITE_ITEM_MASTER.filter((it) => !ex.has(it.id));
  const out = [];
  const used = new Set();
  while (out.length < count && used.size < pool.length) {
    const list = pool.filter((it) => !used.has(it.id));
    if (!list.length) break;
    const it = list[Math.floor(rng() * list.length) % list.length];
    used.add(it.id); out.push(it);
  }
  return out;
}
