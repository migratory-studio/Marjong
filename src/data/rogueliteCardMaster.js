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
    desc: "受けるダメージが10%減る。粘りの基礎＝【守備】流派の一歩。",
    rarity: "common",
    effect: { kind: "takeReduce", rate: 0.1 },
    cluster: "guard",
    stackable: true,
    maxStacks: 3,
  },
  {
    id: "maxhp-up-common",
    name: "厚みの点棒",
    desc: "パーティのHP最大値が一定値増える（深い階ほど大きい・現在HPも底上げ）。",
    rarity: "common",
    effect: { kind: "maxHpAdd", add: 150 },
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
    desc: "被ダメ-8%、さらにHP最大+50（深い階ほど大きい）。じわりと固める＝【守備】。",
    rarity: "common",
    effect: { kind: "compound", parts: [{ kind: "takeReduce", rate: 0.08 }, { kind: "maxHpAdd", add: 50 }] },
    cluster: "guard",
    stackable: true,
    maxStacks: 4,
  },

  // 各流派のスケーラ（単体は小さい・同流派を集めてしきい値で跳ねる）。
  {
    id: "flush-omote",
    name: "一色への傾倒",
    desc: "与ダメ+6%。【染め】を集めるための一歩（染め札3枚で開眼＝染め手の与ダメが跳ねる）。",
    rarity: "common",
    effect: { kind: "dealMul", mul: 1.06 },
    cluster: "flush",
    stackable: true,
    maxStacks: 3,
  },
  {
    id: "tempo-sen",
    name: "先手の気構え",
    desc: "与ダメ+6%。【速攻】を集めるための一歩（速攻札3枚で加速＝ツモ和了の与ダメが跳ねる）。",
    rarity: "common",
    effect: { kind: "dealMul", mul: 1.06 },
    cluster: "tempo",
    stackable: true,
    maxStacks: 3,
  },
  {
    id: "value-tame",
    name: "打点への布石",
    desc: "与ダメ+6%。【打点】を集めるための一歩（打点札3枚で会心＝満貫以上の与ダメが跳ねる）。",
    rarity: "common",
    effect: { kind: "dealMul", mul: 1.06 },
    cluster: "value",
    stackable: true,
    maxStacks: 3,
  },
  {
    id: "gamble-ittetsu",
    name: "乾坤一擲",
    desc: "与ダメ+7%。【博打】の一歩（博打札3枚で総取り＝どんな和了でも与ダメが乗る…が被害も大きくなる）。",
    rarity: "common",
    effect: { kind: "dealMul", mul: 1.07 },
    cluster: "gamble",
    stackable: true,
    maxStacks: 3,
  },

  // ---------------- rare ----------------
  {
    id: "flush-tetsu",
    name: "孤高の一色",
    desc: "HP最大+100（深い階ほど大きい）。一色は脆い手だが、染め札を重ねるほど開眼が近づく。",
    rarity: "rare",
    effect: { kind: "maxHpAdd", add: 100 },
    cluster: "flush",
    stackable: true,
    maxStacks: 2,
  },
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
    desc: "受けるダメージが20%減る＝【守備】流派の柱。",
    rarity: "rare",
    effect: { kind: "takeReduce", rate: 0.2 },
    cluster: "guard",
    stackable: true,
    maxStacks: 2,
  },
  // 条件付き（動的）バフ＝対局中の状況で効く（連勝/瀕死/反撃/リーチ）。
  {
    id: "ride-the-wave", name: "波に乗る",
    desc: "味方が和了するほど与ダメが上がる（連勝1につき+8%）。和了を逃すとリセット＝【速攻】。",
    rarity: "rare", effect: { kind: "streakDeal", per: 0.08 }, cluster: "tempo", stackable: true, maxStacks: 3,
  },
  {
    id: "last-stand", name: "火事場の底力",
    desc: "HPが低いほど与ダメが増え、被ダメが減る（瀕死で最大）＝【博打】の捲り札。",
    rarity: "epic", effect: { kind: "lowHpPower", power: 0.5 }, cluster: "gamble", stackable: true, maxStacks: 2,
  },
  {
    id: "vengeance", name: "倍返し",
    desc: "前局に味方が被弾していたら、次の和了の与ダメが35%増える＝【打点】。",
    rarity: "rare", effect: { kind: "revengeDeal", bonus: 0.35 }, cluster: "value", stackable: true, maxStacks: 2,
  },
  {
    id: "backwater-riichi", name: "背水のリーチ",
    desc: "リーチ中の和了は与ダメが45%増える（リーチのHP消費と相乗）＝【打点】の柱。",
    rarity: "epic", effect: { kind: "riichiDeal", bonus: 0.45 }, cluster: "value", stackable: true, maxStacks: 2,
  },
  {
    id: "gamble-odds", name: "丁か半か",
    desc: "与ダメ+18%。一か八かの押し＝【博打】の柱（重ねるほど総取りが近づく）。",
    rarity: "rare", effect: { kind: "dealMul", mul: 1.18 }, cluster: "gamble", stackable: true, maxStacks: 2,
  },
  {
    id: "ally-tsumo-ward",
    name: "庇いの守り",
    desc: "味方のツモで受けるダメージを1回だけ無効化する（受けたら消える）。重ねるほど回数が増える＝【守備】。",
    rarity: "rare",
    effect: { kind: "friendlyGuard", count: 1 },
    cluster: "guard",
    stackable: true,
    maxStacks: 5,
  },
  {
    id: "grant-lucky-draw",
    name: "幸運のツモ（札）",
    desc: "着卓する味方に「ツモ偏重」が宿る。手が早くなる＝【速攻】流派の核。",
    rarity: "legendary",
    effect: { kind: "grantAbility", abilityId: "lucky-draw" },
    cluster: "tempo",
    stackable: false,
  },
  {
    id: "grant-chunchan",
    name: "中張の風（札）",
    desc: "着卓する味方に「中張ツモ」が宿る。タンヤオ軸で押す＝【速攻】。",
    rarity: "epic",
    effect: { kind: "grantAbility", abilityId: "chunchan" },
    cluster: "tempo",
    stackable: false,
  },
  {
    id: "grant-rootou",
    name: "老頭の構え（札）",
    desc: "着卓する味方に「老頭ツモ」が宿る。么九・染め手・国士の軸＝【染め】流派の核。",
    rarity: "epic",
    effect: { kind: "grantAbility", abilityId: "rootou" },
    cluster: "flush", // 【染め】流派の核（しきい値シナジーの軸）
    stackable: false,
  },
  {
    id: "grant-danger-sense",
    name: "危険感知（札）",
    desc: "着卓する味方に「危険感知」が宿る。当たり牌を警告＝放銃を避けて粘る＝【守備】流派の核。",
    rarity: "epic",
    effect: { kind: "grantAbility", abilityId: "danger-sense" },
    cluster: "guard",
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
    desc: "与えるダメージが35%増える＝【打点】（満貫以上で会心ボーナスが上乗せ）。",
    rarity: "epic",
    effect: { kind: "dealMul", mul: 1.35 }, // warping de-warp：フラットを抑え、跳ねは打点シナジー(満貫)へ寄せる
    cluster: "value",
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
    desc: "着卓する味方に「牌寄せ」が宿る。ターツを埋める有効牌を呼ぶ＝【速攻】の速度軸。",
    rarity: "epic",
    effect: { kind: "grantAbility", abilityId: "summon-tile" },
    cluster: "tempo",
    stackable: false,
  },
  {
    id: "grant-dora-pull",
    name: "ドラ手繰り（札）",
    desc: "着卓する味方に「ドラ手繰り」が宿る。一発逆転の打点＝【打点】流派の核。",
    rarity: "legendary",
    effect: { kind: "grantAbility", abilityId: "dora-pull" },
    cluster: "value",
    stackable: false,
  },

  // ---------------- legendary ----------------
  {
    id: "deal-up-legend",
    name: "天衣無縫の太刀",
    desc: "与えるダメージが60%増える＝【打点】の到達点（満貫以上の会心と合わさり一撃が走る）。",
    rarity: "legendary",
    effect: { kind: "dealMul", mul: 1.6 }, // warping de-warp 1.8→1.6：単体万能の歪みを抑え、跳ねは打点シナジーへ
    cluster: "value",
    stackable: false,
  },
  {
    id: "fortress",
    name: "不動の城壁",
    desc: "受けるダメージが40%減り、HP最大値が25%増える＝【守備】の到達点。",
    rarity: "legendary",
    effect: { kind: "compound", parts: [
      { kind: "takeReduce", rate: 0.4 },
      { kind: "maxHpUp", mul: 1.25 },
    ] },
    cluster: "guard",
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

// ─────────────────────────────────────────────────────────────────────────────
// 流派（クラスター）＝提案A。docs/roguelite-fun-research-and-cluster-redesign.md §4.2-4.3。
// カードに `cluster` タグを付け、同流派を集めると「しきい値(breakpoint)で跳ねる」シナジーが効く。
// 緩い線形スケールは採らない（フラット加算の焼き直しになるため）＝"あと1枚で開眼"の緊張を作る。
//   - 定義（数値・しきい値）はここ（マスタ）。
//   - 集計（clusterCount）と解決ロジックは src/roguelite/cardEffects.js。
//   - 対局中の発火条件（染め手で和了したか 等）は main.js が battle ctx として渡す。
// 編成原理＝ハイブリッド：戦略名の流派に各キャラの異能を「核」として割り当てる。
// ※スライス1では `flush`（染め么九）のみ本実装。tempo/value/guard は後続スライスで追加。
// awaken＝しきい値到達時の呼称（攻めは「開眼」/守りは「鉄壁」）。tip＝シナジーの説明（UI title）。
export const CLUSTER_META = {
  flush: { label: "染め", color: "#8fd0ff", blurb: "一色・么九・国士の軸。脆いが、染めるほど一撃が跳ねる。", awaken: "開眼", tip: "染め手(混一/清一)で和了したとき、与ダメが跳ねる" },
  guard: { label: "守備", color: "#7ad6a0", blurb: "放銃を避け、事故の一撃を抑える。固めるほどトびにくい。", awaken: "鉄壁", tip: "守備札を集めると、1局に受ける被害の上限が下がる（事故りにくい＝分散管理）" },
  tempo: { label: "速攻", color: "#ffcf5a", blurb: "ツモを呼び、手数で押す。門前スピードで畳みかける。", awaken: "加速", tip: "ツモ和了したとき、与ダメが跳ねる（門前スピードの軸）" },
  value: { label: "打点", color: "#ff8a5c", blurb: "ドラ・リーチで大物手を狙う。一撃が重い。", awaken: "会心", tip: "満貫以上で和了したとき、与ダメが跳ねる（大物手コミットの軸）" },
  gamble: { label: "博打", color: "#d56bff", blurb: "諸刃の大振り。与ダメは常に乗るが、受ける被害も大きくなる＝高分散。", awaken: "総取り", tip: "どんな和了でも与ダメが跳ねる代わり、1局に受ける被害の上限も上がる（守備の真逆＝高分散）" },
};

// 流派シナジー定義。各流派は「.tiers を持つシナジー記述子」を1つ持つ（種類はキー名で分岐）：
//   deal    … 攻め：trigger（対局中に main.js が立てる発火フラグ）が立つ局に与ダメ +bonus。最高達成段を採用（累積しない）。
//   takeCap … 守り：1局に受ける被ダメの上限（最大HP比）を cap へ締める。最も低い達成段を採用（＝最も固い）。深度由来の既定上限と min を取る。
// 各 tier の name/desc＝レベルアップ演出（②モーダル）と流派パネル（①）が引く単一の出典。
// name＝その段の呼称（開眼→極み 等）、desc＝その段で効くこと（プレイヤー向けの一文）。
export const CLUSTER_SYNERGY = {
  flush: {
    deal: {
      trigger: "flushWin",
      tiers: [
        { at: 3, bonus: 0.5, name: "開眼", desc: "染め手（混一・清一）で和了したとき、与ダメージ +50%" },
        { at: 5, bonus: 1.1, name: "極み", desc: "染め手（混一・清一）で和了したとき、与ダメージ +110%" },
      ],
    },
  },
  guard: {
    // 守備札を集めるほど「1局の被ダメ上限(最大HP比)」が下がる＝事故スパイクを抑える分散低減（P3）。
    takeCap: {
      tiers: [
        { at: 3, cap: 0.30, name: "鉄壁", desc: "1局に受ける被害の上限が、最大HPの30%までに下がる" },
        { at: 5, cap: 0.20, name: "不抜", desc: "1局に受ける被害の上限が、最大HPの20%までに下がる（大物手でもトびにくい）" },
      ],
    },
  },
  tempo: {
    // ツモ和了（門前スピード）した局に跳ねる。ツモは頻度が高いぶん bonus は控えめ。
    deal: {
      trigger: "tsumoWin",
      tiers: [
        { at: 3, bonus: 0.4, name: "加速", desc: "ツモ和了したとき、与ダメージ +40%" },
        { at: 5, bonus: 0.9, name: "疾風", desc: "ツモ和了したとき、与ダメージ +90%" },
      ],
    },
  },
  value: {
    // 満貫以上で和了した局に跳ねる。大物手は出にくいぶん bonus は大きめ（リスク＝コミット）。
    deal: {
      trigger: "bigWin",
      tiers: [
        { at: 3, bonus: 0.5, name: "会心", desc: "満貫以上で和了したとき、与ダメージ +50%" },
        { at: 5, bonus: 1.1, name: "必殺", desc: "満貫以上で和了したとき、与ダメージ +110%" },
      ],
    },
  },
  gamble: {
    // 高分散：どんな和了でも与ダメが乗る（anyWin・無条件ゆえ bonus は控えめ）が、被ダメ上限も上がる（諸刃）。
    deal: {
      trigger: "anyWin",
      tiers: [
        { at: 3, bonus: 0.35, name: "総取り", desc: "どんな和了でも与ダメージ +35%（その代わり1局に受ける被害の上限も上がる＝諸刃）" },
        { at: 5, bonus: 0.8, name: "一擲", desc: "どんな和了でも与ダメージ +80%（その代わり1局に受ける被害の上限も上がる＝諸刃）" },
      ],
    },
    // 守備 takeCap の真逆：1局の被ダメ上限(最大HP比)を上げる＝大振り（事故も大きい＝高分散）。
    takeRaise: {
      tiers: [
        { at: 3, add: 0.20 },
        { at: 5, add: 0.45 },
      ],
    },
  },
};

// カードの流派タグ（無所属は null）。
export function clusterOf(card) {
  return card?.cluster || null;
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
  return "buff"; // dealMul/takeReduce/maxHpUp/maxHpAdd/skillLevelUp/paramBoost/addBench/compound
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
