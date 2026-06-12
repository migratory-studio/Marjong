// 能力マスタ — 能力の「表示・定義」を1箇所に集約。
//
// ここにあるのは “定義データ” だけ（名前・説明・発動種別・回数など）。
// 能力の **挙動（ロジック）** は src/abilities/builtins/ の各能力ファイルにある。
//   - 名前 / 説明 / 発動種別 / 回数を変えたい → このファイルだけ編集
//   - 挙動を変えたい                        → 該当の能力ファイルだけ編集
//   - 新しい能力を足したい                  → 能力ファイル新規 + ここに定義 + builtins/index.js に import
//
// 発動の仕組み（発動種別 × 回数 の組み合わせでマスタ化）:
//   - activation: "passive" 常時発動（ボタン無し） / "manual" 任意発動（ボタンで発動）
//   - chargeScope: "game" 1ゲーム中に maxCharges 回 / "hand" 1局ごとに maxCharges 回 補充
//   - maxCharges:  そのスコープ内での発動可能回数
// 例) ツモラ=manual/game/1（東風で1回）, ヨビニン=manual/hand/1（1局1回）,
//     クイオトシ=manual/hand/1, マモリ=passive（常時）, ロートウ/チュンチャン=manual/game/2。
//
// `blurb` はキャラ選択画面用の1行サマリ。
export const ABILITY_MASTER = {
  "lucky-draw": {
    name: "ツモ偏重",
    desc: "発動した局はツモが手牌に有利な牌へ偏る（毎ツモ・候補先読み）。1ゲーム2局まで。",
    blurb: "ツモ偏重 — 1ゲーム2局 ツモが有利牌に偏る",
    activation: "manual",
    chargeScope: "game",
    maxCharges: 2,
    cooldown: 0,
  },
  "summon-tile": {
    name: "牌寄せ",
    desc: "発動した次のツモで、手牌のカンチャン・ペンチャンを埋める有効牌を引き寄せる（国士狙いなら手持ちにない么九牌）。テンパイ時は発動不可。山に無ければ失敗（通常ツモ）。1局1回。",
    blurb: "牌寄せ — 1局1回 ターツを埋める有効牌を呼ぶ",
    activation: "manual",
    chargeScope: "hand",
    maxCharges: 1,
    cooldown: 0,
  },
  "zero-search": {
    name: "ゼロ・リサーチ",
    desc: "1シャンテンの自分の手番に発動。残る生牌（王牌除く）を走査し、聴牌に進む有効牌の候補（待ちの広い順トップ2）から1つ選ぶと、次のツモで確実に手繰り寄せて聴牌を確定させる。山に有効牌が無いときは発動できない（＝場に出切っている合図）。1局1回・1ゲーム2局まで。",
    blurb: "ゼロ・リサーチ — 1局1回・2局 1シャンテンから有効牌を確定ツモで聴牌",
    activation: "manual",
    chargeScope: "hand",
    maxCharges: 1,
    cooldown: 0,
  },
  "omni-chi": {
    name: "全方位チー",
    desc: "発動中は上家以外の捨て牌でもチーできる。発動するとその局のあいだ持続。1ゲーム3局まで。",
    blurb: "全方位チー — 1ゲーム3局 誰の捨て牌でもチー可能",
    activation: "manual",
    chargeScope: "game",
    maxCharges: 3,
    cooldown: 0,
  },
  "recall-deal": {
    name: "リコール・ディール",
    desc: "1局1回。今ツモった牌を自分の河へ置き（その牌は他家にロンされない）、代わりに自分が以前に捨てた河の牌を1枚手牌へ戻す。交換後はそのまま通常打牌。テンパイ時は発動不可（交換でテンパイになるのはOK）。",
    blurb: "リコール・ディール — 1局1回 ツモ牌を河へ捨て(ロン不可)、捨てた牌を1枚回収",
    activation: "manual",
    chargeScope: "hand",
    maxCharges: 1,
    cooldown: 0,
  },
  "danger-sense": {
    name: "危険感知",
    desc: "常時発動。あたり牌の可能性に応じて手牌を3段階で警告（超危険＝赤／危険＝橙／警戒＝黄）。",
    blurb: "危険感知 — 常時発動 あたり牌を3段階で警告",
    activation: "passive",
    chargeScope: "hand",
    maxCharges: Infinity,
    cooldown: 0,
  },
  "rootou": {
    name: "老頭ツモ",
    desc: "発動した局はツモが高確率で么九牌（1・9・字牌）になる。1ゲーム2局まで。",
    blurb: "老頭ツモ — 1ゲーム2局 么九牌が高確率",
    activation: "manual",
    chargeScope: "game",
    maxCharges: 2,
    cooldown: 0,
  },
  "chunchan": {
    name: "中張ツモ",
    desc: "発動した局はツモが高確率で中張牌（2〜8）になる。1ゲーム2局まで。",
    blurb: "中張ツモ — 1ゲーム2局 中張牌が高確率",
    activation: "manual",
    chargeScope: "game",
    maxCharges: 2,
    cooldown: 0,
  },
  "nebula-curse": {
    name: "暗黒星",
    desc: "常時発動。流局・放銃・ツモられで失う点が倍になり、アガりは半分（自分が得る点も、相手から奪う点もどちらも半額）。代償に持ち点（HP）は極めて高い。",
    blurb: "暗黒星 — 常時発動 失点は倍・アガりは半分（超高HP）",
    activation: "passive",
    chargeScope: "hand",
    maxCharges: Infinity,
    cooldown: 0,
  },
  "dora-pull": {
    name: "ドラ寄せ",
    desc: "発動するたびに新ドラ表示牌を1枚めくり（裏ドラ表示牌も連動）、和了時その局の発動回数分の確定ドラが自分の手に乗る。ドラは全員に影響し、場のめくり過ぎ（計4枚）は四開槓で流局。リンシャンは引かない。1局2回・1ゲーム2局まで。",
    blurb: "ドラ寄せ — 1局2回 新ドラを暴き確定ドラ化／場も荒れる諸刃",
    activation: "manual",
    chargeScope: "hand",
    maxCharges: 2,
    cooldown: 0,
  },
  "homura": {
    name: "焔",
    desc: "1巡目のみ発動可・1ゲーム2局まで。発動した局にアガると、満貫以上なら点数1.5倍、満貫未満なら点数が固定になる（ロン1000／ツモ500・300、親ツモ500オール）。",
    blurb: "焔 — 1巡目限定・2局 満貫以上1.5倍／未満は固定",
    activation: "manual",
    chargeScope: "game",
    maxCharges: 2,
    cooldown: 0,
  },
  "jane-doe": {
    name: "強制ツモ切り",
    desc: "1局1回・1ゲーム2局まで。選んだ相手を3巡のあいだ強制ツモ切りにする（打牌選択・リーチ・カン不可、ツモ和了は可）。リーチ中の相手は対象にできない。",
    blurb: "強制ツモ切り — 1局1回・2局 相手を3巡ツモ切りに固定",
    activation: "manual",
    chargeScope: "game",
    maxCharges: 2,
    cooldown: 0,
  },
  "kakeha-bet": {
    name: "大博打",
    desc: "1巡目のみ発動可・1ゲーム2局まで。発動時に賭け金を選ぶ（5000点＝和了点1.5倍／10000点＝和了点2倍）。賭け金は即座に前払いし、その局にアガると自分の獲得も相手の支払いも倍率ぶん増える。アガれなければ賭け金は戻らない。持ち点が賭け金を下回るときは選べない。",
    blurb: "大博打 — 1巡目限定・2局 5000点で1.5倍／10000点で2倍に賭ける",
    activation: "manual",
    chargeScope: "game",
    maxCharges: 2,
    cooldown: 0,
  },
  "abyss-collection": {
    name: "淵の蒐集",
    desc: "常時発動。このキャラは和了できない（ロン・ツモ不可）。その代わり、流局時にこのキャラへ渡る得点（テンパイ料の受け取り）が3倍になり、流し満貫が役満扱いになる。",
    blurb: "淵の蒐集 — 常時 和了不可／流局の受取3倍・流し満貫が役満",
    activation: "passive",
    chargeScope: "hand",
    maxCharges: Infinity,
    cooldown: 0,
  },
  "bibi": {
    name: "身代わり人形",
    desc: "1局1回・1ゲーム2局まで。発動後、自分が6回打牌するまで、ロン・ツモをされても点棒を取られない——しかもそのアガりは帳消しになり、勝者も点棒を得られない（流局の罰符などは対象外）。",
    blurb: "身代わり人形 — 1局1回・2局 6打牌の間ロン/ツモを帳消し（失点0・勝者も得点0）",
    activation: "manual",
    chargeScope: "game",
    maxCharges: 2,
    cooldown: 0,
  },
  "amber-shield": {
    name: "琥珀の盾",
    desc: "常時、致命の一撃を受け止める琥珀の盾を張る。閾値（既定=満貫）以上の放銃・被ツモは失点を0に、閾値未満は盾が剥がれる（育成で半額化）。盾はゲームを通しての持続資源で、補充は超越帯の和了でのみ。",
    blurb: "琥珀の盾 — 満貫以上の放銃/被ツモを0／満貫未満で剥がれる持続シールド",
    activation: "passive",
    chargeScope: "game",
    maxCharges: 0,
    cooldown: 0,
  },
};

// 能力定義を取り出す（既定値をマージして返す）。未知IDは安全なフォールバック。
export function abilityDef(id) {
  const def = ABILITY_MASTER[id];
  if (!def) {
    return {
      id, name: id, desc: "", blurb: id,
      activation: "passive", chargeScope: "hand", maxCharges: Infinity, cooldown: 0,
    };
  }
  return {
    id,
    name: def.name ?? id,
    desc: def.desc ?? "",
    blurb: def.blurb ?? def.name ?? id,
    activation: def.activation === "manual" ? "manual" : "passive",
    chargeScope: def.chargeScope === "game" ? "game" : "hand",
    maxCharges: def.maxCharges ?? Infinity,
    cooldown: def.cooldown ?? 0,
  };
}
