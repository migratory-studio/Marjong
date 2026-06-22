// ローグライト・バフカードマスタ — docs/shitei-calendar-and-roguelite.md「B. ローグライト」。
//
// カードの「種類・効果」をここに集約する単一情報源（完全マスタドリブン）。
// 効果の“当て込みロジック”は src/roguelite/cardEffects.js に集約し、本ファイルは“定義データ”だけ。
//   - 文言・レア度・数値を変えたい → このファイルだけ編集
//   - 効果の挙動を変えたい         → cardEffects.js だけ編集
//   - 新カードを足したい           → ここに1件足す（kind が既存なら配線不要）
//
// 効果は3系統（cardEffects.js が effect.kind で振り分ける）:
//   ■ 即時系（取得した瞬間にラン状態へ反映）
//       heal        … パーティHPを回復（amount=最大比 0..1）
//       maxHpUp     … パーティHP最大値＋（mul=倍率）。取得時に現在HPも同率で底上げ。
//       skillLevelUp… 着卓する味方の能力 skillLevel を一時＋（delta）。ラン内のみ。
//       paramBoost  … params6 を一時ブースト（param=キー / add=加算）。
//       addBench    … 控え枠＋1（パッシブ能力源を増やす）。
//   ■ 戦闘数値系（対局のダメージ適用層＝ローグライト独自層で反映。集約して持つ）
//       dealMul     … 与ダメ倍率（mul）。味方の和了が敵HPを削る量を増やす。
//       takeReduce  … 被ダメ軽減（rate=0..1）。味方の失点（HP減）を減らす。
//   ■ エンジン介入系（既存の能力フックへ相乗り＝着卓する味方へ runtimeAbilityId を付与）
//       grantAbility… abilityId（既存 abilityMaster の id）を1つ味方席へ付与。
//
// rarity: common < rare < epic < legendary（ドラフトの出現重みと色に使う）。
// stackable: 同カードの重ね取り可否（false は1ラン1枚）。maxStacks 省略は無制限。
//
// アイコン画像（任意）：各カードに `icon: "graphic/ui/roguelite/cards/<id>.png"` を足すと、
// ドラフト/ショップでその画像を表示する（未指定なら分類の絵文字マークでフォールバック）。
// 推奨サイズ 48×48 程度・正方形・透過。画像が見つからなければ自動で絵文字に戻る。

export const ROGUELITE_CARD_MASTER = [
  // ---------------- common ----------------
  {
    id: "heal-small",
    name: "一服の茶",
    desc: "パーティのHPを最大値の25%回復する。",
    rarity: "common",
    effect: { kind: "heal", amount: 0.25 },
    stackable: true,
  },
  {
    id: "deal-up-common",
    name: "鋭い打点",
    desc: "与えるダメージが10%増える。攻めの基礎。",
    rarity: "common",
    effect: { kind: "dealMul", mul: 1.1 },
    stackable: true,
    maxStacks: 4,
  },
  {
    id: "take-down-common",
    name: "薄い守り",
    desc: "受けるダメージが10%減る。粘りの基礎。",
    rarity: "common",
    effect: { kind: "takeReduce", rate: 0.1 },
    stackable: true,
    maxStacks: 3,
  },
  {
    id: "maxhp-up-common",
    name: "厚みの点棒",
    desc: "パーティのHP最大値が15%増える（現在HPも底上げ）。",
    rarity: "common",
    effect: { kind: "maxHpUp", mul: 1.15 },
    stackable: true,
    maxStacks: 4,
  },
  {
    id: "spirit-strike-common",
    name: "気合の一打",
    desc: "与ダメ+8%、さらにHPを10%回復。攻めながら息を整える。",
    rarity: "common",
    effect: { kind: "compound", parts: [{ kind: "dealMul", mul: 1.08 }, { kind: "heal", amount: 0.1 }] },
    stackable: true,
    maxStacks: 4,
  },
  {
    id: "brace-common",
    name: "踏ん張り",
    desc: "被ダメ-8%、さらにHP最大+5%。じわりと固める。",
    rarity: "common",
    effect: { kind: "compound", parts: [{ kind: "takeReduce", rate: 0.08 }, { kind: "maxHpUp", mul: 1.05 }] },
    stackable: true,
    maxStacks: 4,
  },

  // ---------------- rare ----------------
  {
    id: "heal-big",
    name: "気つけの一局",
    desc: "パーティのHPを最大値の60%回復する。",
    rarity: "rare",
    effect: { kind: "heal", amount: 0.6 },
    stackable: true,
  },
  {
    id: "deal-up-rare",
    name: "痛烈な一撃",
    desc: "与えるダメージが25%増える。",
    rarity: "rare",
    effect: { kind: "dealMul", mul: 1.25 },
    stackable: true,
    maxStacks: 4,
  },
  {
    id: "take-down-rare",
    name: "堅い構え",
    desc: "受けるダメージが20%減る。",
    rarity: "rare",
    effect: { kind: "takeReduce", rate: 0.2 },
    stackable: true,
    maxStacks: 2,
  },
  // 条件付き（動的）バフ＝対局中の状況で効く（連勝/瀕死/反撃/リーチ）。
  {
    id: "ride-the-wave", name: "波に乗る",
    desc: "味方が和了するほど与ダメが上がる（連勝1につき+8%）。和了を逃すとリセット。",
    rarity: "rare", effect: { kind: "streakDeal", per: 0.08 }, stackable: true, maxStacks: 3,
  },
  {
    id: "last-stand", name: "火事場の底力",
    desc: "HPが低いほど与ダメが増え、被ダメが減る（瀕死で最大）。",
    rarity: "epic", effect: { kind: "lowHpPower", power: 0.5 }, stackable: true, maxStacks: 2,
  },
  {
    id: "vengeance", name: "倍返し",
    desc: "前局に味方が被弾していたら、次の和了の与ダメが35%増える。",
    rarity: "rare", effect: { kind: "revengeDeal", bonus: 0.35 }, stackable: true, maxStacks: 2,
  },
  {
    id: "backwater-riichi", name: "背水のリーチ",
    desc: "リーチ中の和了は与ダメが45%増える（リーチのHP消費と相乗）。",
    rarity: "epic", effect: { kind: "riichiDeal", bonus: 0.45 }, stackable: true, maxStacks: 2,
  },
  {
    id: "ally-tsumo-ward",
    name: "庇いの守り",
    desc: "味方のツモで受けるダメージを1回だけ無効化する（受けたら消える）。重ねるほど回数が増える。",
    rarity: "rare",
    effect: { kind: "friendlyGuard", count: 1 },
    stackable: true,
    maxStacks: 5,
  },
  {
    id: "grant-lucky-draw",
    name: "幸運のツモ（札）",
    desc: "着卓する味方に「ツモ偏重」が宿る。手が早くなる。",
    rarity: "legendary",
    effect: { kind: "grantAbility", abilityId: "lucky-draw" },
    stackable: false,
  },
  {
    id: "grant-chunchan",
    name: "中張の風（札）",
    desc: "着卓する味方に「中張ツモ」が宿る。タンヤオ軸で押す。",
    rarity: "epic",
    effect: { kind: "grantAbility", abilityId: "chunchan" },
    stackable: false,
  },
  {
    id: "grant-rootou",
    name: "老頭の構え（札）",
    desc: "着卓する味方に「老頭ツモ」が宿る。么九・染め手・国士の軸。",
    rarity: "epic",
    effect: { kind: "grantAbility", abilityId: "rootou" },
    stackable: false,
  },
  {
    id: "grant-danger-sense",
    name: "危険感知（札）",
    desc: "着卓する味方に「危険感知」が宿る。当たり牌を警告＝放銃を避けて粘る守備の軸。",
    rarity: "epic",
    effect: { kind: "grantAbility", abilityId: "danger-sense" },
    stackable: false,
  },

  // ---------------- epic ----------------
  {
    id: "onslaught",
    name: "猛攻の極み",
    desc: "与ダメージ+30%、さらにHPを30%回復する。攻めながら立て直す。",
    rarity: "epic",
    effect: { kind: "compound", parts: [
      { kind: "dealMul", mul: 1.3 },
      { kind: "heal", amount: 0.3 },
    ] },
    stackable: true,
    maxStacks: 2,
  },
  {
    id: "deal-up-epic",
    name: "必殺の構え",
    desc: "与えるダメージが45%増える。",
    rarity: "epic",
    effect: { kind: "dealMul", mul: 1.45 },
    stackable: true,
    maxStacks: 3,
  },
  {
    id: "maxhp-up-epic",
    name: "不屈の点棒",
    desc: "パーティのHP最大値が40%増える（現在HPも底上げ）。",
    rarity: "epic",
    effect: { kind: "maxHpUp", mul: 1.4 },
    stackable: true,
    maxStacks: 2,
  },
  {
    id: "skill-up",
    name: "秘伝の伝授",
    desc: "パーティのスキルレベルが1上がる（全員の能力が強化される）。",
    rarity: "epic",
    effect: { kind: "skillLevelUp", delta: 1 },
    stackable: true,
    maxStacks: 9,
  },
  {
    id: "grant-summon-tile",
    name: "牌寄せ（札）",
    desc: "着卓する味方に「牌寄せ」が宿る。ターツを埋める有効牌を呼ぶ＝手が早い速度の軸。",
    rarity: "epic",
    effect: { kind: "grantAbility", abilityId: "summon-tile" },
    stackable: false,
  },
  {
    id: "grant-dora-pull",
    name: "ドラ手繰り（札）",
    desc: "着卓する味方に「ドラ手繰り」が宿る。一発逆転の打点。",
    rarity: "legendary",
    effect: { kind: "grantAbility", abilityId: "dora-pull" },
    stackable: false,
  },

  // ---------------- legendary ----------------
  {
    id: "deal-up-legend",
    name: "天衣無縫の太刀",
    desc: "与えるダメージが80%増える。ランを終わらせる一撃。",
    rarity: "legendary",
    effect: { kind: "dealMul", mul: 1.8 },
    stackable: false,
  },
  {
    id: "fortress",
    name: "不動の城壁",
    desc: "受けるダメージが40%減り、HP最大値が25%増える。",
    rarity: "legendary",
    effect: { kind: "compound", parts: [
      { kind: "takeReduce", rate: 0.4 },
      { kind: "maxHpUp", mul: 1.25 },
    ] },
    stackable: false,
  },
];

// レア度の出現重み（ドラフト抽選の基本確率）。rarityBias で動的に上振れさせる。
export const RARITY_WEIGHTS = { common: 60, rare: 28, epic: 10, legendary: 2 };

// レア度の表示色（UI／演出用）。styles.css 側のクラスと対応させる。
export const RARITY_META = {
  common:    { label: "コモン",       color: "#9aa3b2" },
  rare:      { label: "レア",         color: "#56a8ff" },
  epic:      { label: "エピック",     color: "#c06bff" },
  legendary: { label: "レジェンダリ", color: "#ffb54d" },
};

export function cardById(id) {
  return ROGUELITE_CARD_MASTER.find((c) => c.id === id) || null;
}

// このカードがその系統に属するか（cardEffects.js と共有の分類）。
export function isGrantCard(card) {
  return card?.effect?.kind === "grantAbility";
}

// カードの「概念分類」（A案）。恒常バフ／必殺技／道具 の3軸でプレイヤーのビルドを legible に。
//   buff  … 恒常強化（攻/防/HP/スキルLv等。%が積み上がり常時ON）
//   skill … 必殺技（付与能力。技スロット最大2・ポケモン式忘却）
//   item  … 道具（即時回復・お守り等。個数/チャージで持つ・使い切り）
// effect.kind から導出。card.category があればそれを優先（将来の例外用 override）。
export const CARD_CATEGORY = {
  buff:  { label: "バフ",   color: "#6fe08a", mark: "▲" },
  skill: { label: "必殺技", color: "#ff8f6b", mark: "★" },
  item:  { label: "道具",   color: "#e8c45d", mark: "◆" },
};
export function cardCategory(card) {
  if (card?.category && CARD_CATEGORY[card.category]) return card.category;
  const k = card?.effect?.kind;
  if (k === "grantAbility") return "skill";
  if (k === "heal" || k === "friendlyGuard") return "item";
  return "buff"; // dealMul/takeReduce/maxHpUp/skillLevelUp/paramBoost/addBench/compound
}

// rarityBias（0..1）でレア以上に重みを寄せたコピーを返す。飛ばし/点差/階層で上振れさせる燃料。
function biasedWeights(bias = 0) {
  const b = Math.max(0, Math.min(1, bias));
  return {
    common:    RARITY_WEIGHTS.common * (1 - b * 0.7),
    rare:      RARITY_WEIGHTS.rare * (1 + b * 0.5),
    epic:      RARITY_WEIGHTS.epic * (1 + b * 2.0),
    legendary: RARITY_WEIGHTS.legendary * (1 + b * 5.0),
  };
}

// 1枚ぶんのレア度を重み抽選。
function pickRarity(rng, weights) {
  const total = Object.values(weights).reduce((a, w) => a + w, 0);
  let r = rng() * total;
  for (const [rar, w] of Object.entries(weights)) {
    if ((r -= w) < 0) return rar;
  }
  return "common";
}

// ドラフト用に count 枚のカードを抽選して返す（重複なし）。
//   rng       … makeRng() の戻り（0..1 を返す関数）
//   opts.rarityBias … 0..1（飛ばし/点差/深層でレア率を上振れ）
//   opts.exclude    … 除外したいカードid（取り切った非stackable等）の集合/配列
//   opts.count      … 引く枚数（既定3）
// レア度を抽選 → そのレア度のプールから1枚 → 足りなければ全プールから補完。
// レア度の高い順（forceRarity のフォールバック順）。
const RARITY_DESC = ["legendary", "epic", "rare", "common"];

export function drawCards(rng, opts = {}) {
  const count = opts.count ?? 3;
  const exclude = new Set(opts.exclude || []);
  // ご祝儀など：指定レア度だけから引く（足りなければ1つ下のレア度へフォールバック）。
  if (opts.forceRarity) {
    const start = Math.max(0, RARITY_DESC.indexOf(opts.forceRarity));
    const out = []; const used = new Set();
    for (let oi = start; oi < RARITY_DESC.length && out.length < count; oi++) {
      const pool = ROGUELITE_CARD_MASTER.filter((c) => c.rarity === RARITY_DESC[oi] && !used.has(c.id) && !exclude.has(c.id));
      while (pool.length && out.length < count) { const c = pool.splice(Math.floor(rng() * pool.length), 1)[0]; used.add(c.id); out.push(c); }
    }
    return out;
  }
  const weights = biasedWeights(opts.rarityBias || 0);
  const out = [];
  const used = new Set();
  let guard = 0;
  while (out.length < count && guard++ < 200) {
    const rar = pickRarity(rng, weights);
    const pool = ROGUELITE_CARD_MASTER.filter(
      (c) => c.rarity === rar && !used.has(c.id) && !exclude.has(c.id)
    );
    let card = pool.length ? pool[Math.floor(rng() * pool.length)] : null;
    if (!card) {
      // そのレア度が払底＝全プールから未使用を補完（プールが尽きたら打ち切り）。
      const rest = ROGUELITE_CARD_MASTER.filter((c) => !used.has(c.id) && !exclude.has(c.id));
      if (!rest.length) break;
      card = rest[Math.floor(rng() * rest.length)];
    }
    used.add(card.id);
    out.push(card);
  }
  return out;
}
