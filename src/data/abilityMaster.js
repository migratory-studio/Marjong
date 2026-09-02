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
    // 詩玥の口癖をそのまま技名に（口癖の反転＝ピラー6。技を撃つたび言葉が積もる）。
    name: "ツモれば勝ち",
    desc: "発動した局はツモが手牌に有利な牌へ偏る（毎ツモ・候補先読み）。1ゲーム2局まで。",
    blurb: "ツモれば勝ち — 1ゲーム2局 ツモが有利牌に偏る",
    activation: "manual",
    chargeScope: "game",
    maxCharges: 2,
    cooldown: 0,
    enemyNote: "{name}のツモが、この局だけ手に噛み合う",
  },
  "summon-tile": {
    name: "牌寄せ",
    desc: "発動した次のツモで、手牌のカンチャン・ペンチャンを埋める有効牌を引き寄せる（国士狙いなら手持ちにない么九牌）。テンパイ時は発動不可。山に無ければ失敗（通常ツモ）。1局1回。",
    blurb: "牌寄せ — 1局1回 ターツを埋める有効牌を呼ぶ",
    activation: "manual",
    chargeScope: "hand",
    maxCharges: 1,
    cooldown: 0,
    enemyNote: "{name}が次のツモで、欲しい牌を呼ぶ",
  },
  "zero-search": {
    name: "ゼロ・リサーチ",
    desc: "1シャンテンの自分の手番に発動。残る生牌（王牌除く）を走査し、聴牌に進む有効牌の候補（待ちの広い順トップ2）から1つ選ぶと、次のツモで確実に手繰り寄せて聴牌を確定させる。山に有効牌が無いときは発動できない（＝場に出切っている合図）。1局1回・1ゲーム2局まで。",
    blurb: "ゼロ・リサーチ — 1局1回・2局 1シャンテンから有効牌を確定ツモで聴牌",
    activation: "manual",
    chargeScope: "hand",
    maxCharges: 1,
    cooldown: 0,
    enemyNote: "{name}が次のツモで、聴牌を確定させる",
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
    enemyNote: "{name}が河の牌を1枚、手に戻した",
  },
  "danger-sense": {
    // 真守の口癖をそのまま技名に（詩玥「ツモれば勝ち」と同じネームド化の手法）。
    name: "放銃、いたしません",
    desc: "常時発動。あたり牌の可能性に応じて手牌を3段階で警告（超危険＝赤／危険＝橙／警戒＝黄）。",
    blurb: "放銃、いたしません — 常時発動 あたり牌を3段階で警告",
    activation: "passive",
    chargeScope: "hand",
    maxCharges: Infinity,
    cooldown: 0,
  },
  "model-answer": {
    name: "模範解答",
    desc: "常時発動。手牌が2シャンテン以上のとき、牌効率上もっとも有効な打牌の候補トップ3を手牌に①②③で指し示す。イーシャンテン／聴牌になると消え、手が崩れて2シャンテン以下に戻ると再び現れる。",
    blurb: "模範解答 — 常時 牌効率トップ3の打牌を指し示す（イーシャンテンで消える）",
    activation: "passive",
    chargeScope: "hand",
    maxCharges: Infinity,
    cooldown: 0,
  },
  "rootou": {
    name: "老頭の庭",
    desc: "発動した局はツモが高確率で么九牌（1・9・字牌）になる。1ゲーム2局まで。",
    blurb: "老頭の庭 — 1ゲーム2局 么九牌が高確率",
    activation: "manual",
    chargeScope: "game",
    maxCharges: 2,
    cooldown: 0,
    enemyNote: "{name}のツモが、この局は么九牌に偏る",
  },
  "chunchan": {
    name: "韋駄天の中張",
    desc: "発動した局はツモが高確率で中張牌（2〜8）になる。1ゲーム2局まで。",
    blurb: "韋駄天の中張 — 1ゲーム2局 中張牌が高確率",
    activation: "manual",
    chargeScope: "game",
    maxCharges: 2,
    cooldown: 0,
    enemyNote: "{name}のツモが、この局は2〜8に偏る",
  },
  "nebula-curse": {
    name: "暗黒星",
    desc: "常時発動。流局・放銃・ツモられで失う点が倍になり、アガりは半分（自分が得る点も、相手から奪う点もどちらも半額）。代償に持ち点（HP）は極めて高い。",
    blurb: "暗黒星 — 常時発動 失点は倍・アガりは半分（超高HP）",
    activation: "passive",
    chargeScope: "hand",
    maxCharges: Infinity,
    cooldown: 0,
    scoreFxLabel: { down: "暗黒星——掴む喜びは、半分" },
    // 呪い（失点が倍化する側）の表示。守り（guardLabel）の鏡像で、被ダメ演出が
    // 「本来の失点 → 呑まれて膨らむ → 実失点」を見せるのに使う（§14-2-1）。
    curseLabel: "暗黒星",
    curseStyle: "star",
    curseNote: "暗黒星に呑まれた——痛みは、人の倍",
  },
  "dora-pull": {
    name: "天啓ドラ寄せ",
    desc: "発動するたびに新ドラ表示牌を1枚めくり（裏ドラ表示牌も連動）、和了時その局の発動回数分の確定ドラが自分の手に乗る。ドラは全員に影響し、場のめくり過ぎ（計4枚）は四開槓で流局。リンシャンは引かない。1局2回・1ゲーム2局まで。",
    blurb: "天啓ドラ寄せ — 1局2回 新ドラを暴き確定ドラ化／場も荒れる諸刃",
    activation: "manual",
    chargeScope: "hand",
    maxCharges: 2,
    cooldown: 0,
    enemyNote: "新ドラがめくられた——打点は全員に乗る",
    scoreFxLabel: { up: "天啓——暴いたドラが、手に乗る" },
  },
  "homura": {
    name: "大物手の焔",
    desc: "1巡目のみ発動可・1ゲーム2局まで。発動した局にアガると、満貫以上なら点数1.5倍、満貫未満なら点数が固定になる（ロン1000／ツモ500・300、親ツモ500オール）。",
    blurb: "大物手の焔 — 1巡目限定・2局 満貫以上1.5倍／未満は固定",
    activation: "manual",
    chargeScope: "game",
    maxCharges: 2,
    cooldown: 0,
    enemyNote: "この局の{name}は、満貫以上なら1.5倍",
    scoreFxLabel: { up: "焔が舐めた——大物手が燃え上がる", down: "火が萎んだ——安手に焔は宿らない" },
  },
  "jane-doe": {
    name: "沈黙の処方箋",
    desc: "1局1回・1ゲーム2局まで。選んだ相手を3巡のあいだ強制ツモ切りにする（打牌選択・リーチ・カン不可、ツモ和了は可）。リーチ中の相手は対象にできない。",
    blurb: "沈黙の処方箋 — 1局1回・2局 相手を3巡ツモ切りに固定",
    activation: "manual",
    chargeScope: "game",
    maxCharges: 2,
    cooldown: 0,
    enemyNote: "{target}の打牌が、3巡のあいだ封じられた",
  },
  "kakeha-bet": {
    name: "大博打",
    desc: "1巡目のみ発動可・1ゲーム2局まで。発動時に賭け金を選ぶ（5000点＝和了点1.5倍／10000点＝和了点2倍）。賭け金は即座に前払いし、その局にアガると自分の獲得も相手の支払いも倍率ぶん増える。アガれなければ賭け金は戻らない。持ち点が賭け金を下回るときは選べない。",
    blurb: "大博打 — 1巡目限定・2局 5000点で1.5倍／10000点で2倍に賭ける",
    activation: "manual",
    chargeScope: "game",
    maxCharges: 2,
    cooldown: 0,
    enemyNote: "{name}が点棒を賭けた——この局のアガりが膨らむ",
    scoreFxLabel: { up: "配当——賭けた点棒が、返ってくる" },
  },
  "muddy-lotus": {
    name: "泥中の蓮",
    desc: "常時発動。卓が泥沼に沈み、全員のアガリ点が25%減る（自分の4ハン以上のアガリも沈む）。自分の3ハン以下のアガリだけは泥の対象外となり、点数1.5倍で咲く。",
    blurb: "泥中の蓮 — 常時 全員のアガリ点-25%／自分の3ハン以下は対象外・×1.5",
    activation: "passive",
    chargeScope: "hand",
    maxCharges: Infinity,
    cooldown: 0,
    // 場能力（MODIFY_SCORE_GLOBAL）なので、沈めたのが他家のときは {name} で誰の泥かを示す。
    scoreFxLabel: { down: "{name}の泥に沈んだ", up: "泥中に咲いた——安手だけが、泥をすり抜ける" },
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
    guardLabel: "身代わり人形",
    guardStyle: "doll",
    guardNote: "身代わりに阻まれた——点棒は誰のものにもならない",
    enemyNote: "6打牌のあいだ、{name}から点棒は奪えない",
    // 超越帯（Lv6+）＝相棒・焔の火が宿り、満貫以上の和了が伸びる。
    scoreFxLabel: { up: "焔の火が宿る——人形が、攻めに転じる" },
  },
  "amber-shield": {
    name: "琥珀の盾",
    desc: "常時、致命の一撃を受け止める琥珀の盾を張る。閾値（既定=満貫）以上の放銃・被ツモは失点を0に、閾値未満は盾が剥がれる（育成で半額化）。盾はゲームを通しての持続資源で、補充は超越帯の和了でのみ。",
    blurb: "琥珀の盾 — 満貫以上の放銃/被ツモを0／満貫未満で剥がれる持続シールド",
    activation: "passive",
    chargeScope: "game",
    maxCharges: 0,
    cooldown: 0,
    guardLabel: "琥珀の盾",
    guardStyle: "amber",
    guardNote: "琥珀に阻まれた——点棒は動かない",
  },
};

// 能力定義を取り出す（既定値をマージして返す）。未知IDは安全なフォールバック。
export function abilityDef(id) {
  const def = ABILITY_MASTER[id];
  if (!def) {
    // 表示系フィールドも既定値で揃える（呼び出し側が未知IDで undefined を踏まないように）。
    return {
      id, name: id, desc: "", blurb: id,
      activation: "passive", chargeScope: "hand", maxCharges: Infinity, cooldown: 0,
      enemyNote: "", guardLabel: "", guardNote: "", guardStyle: "amber", scoreFxLabel: null,
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
    // 相手から見た一文（能力カットインの副題）。{name}=発動者 / {target}=対象者。
    // 「何をされたのか分からないまま局が進む」を無くすための表示専用フィールド。
    enemyNote: def.enemyNote ?? "",
    // 守りで失点を受け止める能力の表示（被ダメ演出の「守り切った席」で使う）。
    //   guardLabel … その守りの名前（琥珀の盾／身代わり人形）
    //   guardNote  … 勝った側へ渡す一文。守られた分は勝者の取り分からも引かれるので、
    //                これが無いと「満貫をロンしたのに点が入らない」＝バグに見える。
    guardLabel: def.guardLabel ?? "",
    guardNote: def.guardNote ?? "",
    //   guardStyle … 守りの見た目（"amber"=琥珀が固まる / "doll"=人形が砕ける）。
    //                新しい守りキャラを足すときはここで見た目を選ぶ（UI側の id 決め打ちを避ける）。
    guardStyle: def.guardStyle ?? "amber",
    // 失点が増える側（呪い）の表示。guard* の鏡像で、被ダメ演出の「呪われた席」で使う。
    //   curseLabel … その呪いの名前（暗黒星）
    //   curseNote  … 局の結果に添える一文（本来いくらだったのかを示す）
    //   curseStyle … 見た目（"star"=星が砕ける）
    curseLabel: def.curseLabel ?? "",
    curseNote: def.curseNote ?? "",
    curseStyle: def.curseStyle ?? "star",
    // 和了点を増減させる能力の表示（和了画面の「素点 → 改変後」演出で出す一行）。
    //   { up: 増えたときの一行, down: 減ったときの一行 }。{name}=能力の持ち主。
    // 無い能力は汎用の「増加！／減少！」にフォールバックする。倍率の数字は出さない
    // （§11-1 の禁じ手＝賭けの体感にならない）。
    scoreFxLabel: def.scoreFxLabel ?? null,
  };
}
