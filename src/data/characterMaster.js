// キャラクターマスタ — キャラの全情報を1箇所に集約（マスタドリブンの中核）。
//
// 1キャラ直したいときは基本ここだけ編集すれば済む：
//   - 能力値 / 見た目 / 音 を変える → このファイル
//   - 新キャラ追加               → ここに1エントリ追加
//   - 能力の挙動を変える         → src/abilities/builtins/ の能力ファイル
//   - 能力の名前/説明を変える     → src/data/abilityMaster.js
//
// 形状: 識別系は flat（id/name/reading/color/bio/profile）、それ以外はネスト（stats/assets/abilities）。
//   - reading … 名前の読み（ふりがな）。空文字なら表示しない（カタカナ名など）。
//   - profile … キャラのプロフィール文章（カードに表示）。
//
// アセットのパス規約（ファイルを置けば自動で反映、無ければ現状の見た目・音にフォールバック）：
//   - アイコン/立ち絵 … graphic/chars/<id>/icon.png, graphic/chars/<id>/portrait.png
//   - ボイス          … sound/voice/<id>/{pon,chi,kan,riichi,tsumo,ron}.mp3
const voicesFor = (id) => ({
  pon: `sound/voice/${id}/pon.mp3`,
  chi: `sound/voice/${id}/chi.mp3`,
  kan: `sound/voice/${id}/kan.mp3`,
  riichi: `sound/voice/${id}/riichi.mp3`,
  tsumo: `sound/voice/${id}/tsumo.mp3`,
  ron: `sound/voice/${id}/ron.mp3`,
});
const assetsFor = (id) => ({
  icon: `graphic/chars/${id}/icon.png`,
  portrait: `graphic/chars/${id}/portrait.png`,
  voices: voicesFor(id),
});

// ロール（種別）マスタ。選択画面のグルーピング順・ラベル・配色の単一の出どころ。
//   - 各キャラの role はここの id を指す。
//   - color … 選択画面のカード枠色と見出しの色に使う。
//   - 並び順はこの配列の順がそのまま見出しの並び順になる。
export const ROLE_MASTER = [
  { id: "attacker", label: "アタッカー", color: "#e85d75" },
  { id: "blocker",  label: "ブロッカー", color: "#4ea1d3" },
  { id: "gambler",  label: "ギャンブラー", color: "#f6b352" },
  { id: "extra",    label: "アビス", color: "#a78bfa" },
];

export const CHARACTER_MASTER = [
  {
    id: "shiyue",
    name: "詩玥",
    reading: "シ・ユエ",
    color: "#e85d75",
    role: "attacker",
    bio: "ツモ運に愛された攻撃型。持ち点は低めだが手が早い。",
    profile: "「ツモれば勝ち」が口癖の楽天家。理屈より勘、守りより速さを信じる。引きの強さは天性だが、点棒の管理だけはからっきし。",
    stats: { startingPoints: 14000 }, // glass cannon raised a touch (low win rate / high bust)
    assets: assetsFor("shiyue"),
    // 選択画面ゲージ用パラメータ（1〜5）: attack 攻め / defense 守り / quirk 癖 / difficulty 難易度
    params: { attack: 4, defense: 2, quirk: 3, difficulty: 2 },
    abilities: [{ abilityId: "lucky-draw", params: {} }],
  },
  {
    id: "yobinin",
    name: "呼忍",
    reading: "ヨビ・シノブ",
    color: "#4ea1d3",
    role: "attacker",
    bio: "狙った牌を1局1回呼び寄せる器用型。",
    profile: "必要な一枚を“呼ぶ”技を持つ寡黙な打ち手。狙った牌は逃さないが、力を使うのは勝負どころの一局だけという慎重さも併せ持つ。",
    stats: { startingPoints: 13000 }, // trimmed: top win rate
    assets: assetsFor("yobinin"),
    params: { attack: 4, defense: 3, quirk: 3, difficulty: 2 },
    // targetKind: null => 最も欲しい牌を自動で狙う。特定牌に固定したい場合は kind を指定。
    abilities: [{ abilityId: "summon-tile", params: { targetKind: null } }],
  },
  {
    id: "kuidoshi",
    name: "鳴通 優",
    reading: "ナキドオシ・ユウ",
    color: "#f6b352",
    role: "blocker",
    bio: "全方位チーで場を荒らすタンク型。持ち点が多い。",
    profile: "誰の捨て牌でも拾い上げる鳴きの達人。場を掻き回して相手のペースを崩すのが信条。打点よりもスピードと妨害を好む。",
    stats: { startingPoints: 17000 }, // tanky: high HP, aggressive calling
    assets: assetsFor("kuidoshi"),
    params: { attack: 3, defense: 4, quirk: 4, difficulty: 3 },
    abilities: [{ abilityId: "omni-chi", params: {} }],
  },
  {
    id: "mamori",
    name: "マモリ",
    reading: "",
    color: "#7bb274",
    role: "blocker",
    bio: "危険牌を見抜く守備型。持ち点は低いが放銃しにくい。",
    profile: "場の気配から危険牌を察知する守りの名手。攻めは苦手だが、放銃だけは決してしないと心に決めている。",
    stats: { startingPoints: 14000 }, // danger-sense keeps dealing-in low; nudged up
    assets: assetsFor("mamori"),
    params: { attack: 1, defense: 5, quirk: 2, difficulty: 2 },
    abilities: [{ abilityId: "danger-sense", params: {} }],
  },
  {
    id: "yao_chu",
    name: "ヤオ＝チュウ",
    reading: "",
    color: "#9b6dd6",
    role: "attacker",
    bio: "端と字牌を呼び込む癖者。1ゲーム2局だけツモが么九牌に偏る。",
    profile: "端と字牌を偏愛する変わり者。么九牌を引き寄せ、国士無双や混老頭といった大物手を狙い続ける夢追い人。",
    stats: { startingPoints: 16000 }, // weakest ability in short games — compensate with HP
    assets: assetsFor("yao_chu"),
    params: { attack: 2, defense: 2, quirk: 5, difficulty: 5 },
    abilities: [{ abilityId: "rootou", params: {} }],
  },
  {
    id: "chun_chan",
    name: "チュン=チャン",
    reading: "",
    color: "#46c2b5",
    role: "attacker",
    bio: "中張牌を引き寄せる速攻型。1ゲーム2局だけツモが2〜8に偏る。",
    profile: "2〜8の中張牌を呼び込む速攻型。タンヤオを軸に手数で押し切る。素早い手作りで相手に考える隙を与えない。",
    stats: { startingPoints: 12000 }, // trimmed: fast tanyao = high win rate
    assets: assetsFor("chun_chan"),
    params: { attack: 5, defense: 2, quirk: 3, difficulty: 2 },
    // 立ち絵が右傾ポーズで顔が右上にあるため、cover切り抜きの基準を右寄りにする
    // （未指定キャラは既定の "top center"）。値は CSS object-position。
    portraitPos: "72% 0%",
    abilities: [{ abilityId: "chunchan", params: {} }],
  },
  {
    id: "doranie",
    name: "ドラニエル",
    reading: "",
    color: "#d9a521",
    role: "gambler",
    bio: "ドラを手繰り寄せる一発逆転型。最強格だが持ち点は紙。親の満貫＋本場で即トび。",
    profile: "ドラを手元に集める一発逆転の申し子。最強の打点を生み出すが、その代償か持ち点は紙のように脆い。ハイリスク・ハイリターンの体現者。",
    stats: { startingPoints: 10000 }, // glass cannon: strongest ability, paper HP
    assets: assetsFor("doranie"),
    params: { attack: 5, defense: 1, quirk: 4, difficulty: 5 },
    abilities: [{ abilityId: "dora-pull", params: {} }],
  },
  {
    id: "agentRE",
    name: "エージェント・RE",
    reading: "エージェント・アールイー",
    color: "#7f8c99",
    role: "extra",
    bio: "捨て牌を回収する諜報型。1局1回、ツモ牌を安全に河へ捨てつつ過去の捨て牌を取り戻す。",
    profile: "あらゆる情報を「回収（リコール）」する寡黙なエージェント。一度手放した牌すら取引材料に変える老獪な打ち回しで、攻めにも守りにも化ける器用さを持つ。",
    stats: { startingPoints: 15000 }, // 1局1回の小回り能力。標準的なHP。
    assets: assetsFor("agentRE"),
    params: { attack: 3, defense: 3, quirk: 3, difficulty: 3 },
    abilities: [{ abilityId: "recall-deal", params: {} }],
  },
  {
    id: "nebula",
    name: "ネビュラ",
    reading: "",
    color: "#a78bfa",
    role: "extra",
    bio: "失点は倍・アガり点は半分という呪いを抱えた超高HPの異端児。",
    profile: "漆黒の星雲をまとう寡黙な打ち手。受ける痛みは人の倍、掴む喜びは半分——それでも尽きぬ膨大な持ち点で場に居座り続ける。極端な体質ゆえ立ち回りは一筋縄ではいかない、大いに癖の強い存在。",
    stats: { startingPoints: 25000 }, // huge HP to offset doubled losses / halved wins
    assets: assetsFor("nebula"),
    params: { attack: 1, defense: 4, quirk: 5, difficulty: 5 },
    abilities: [{ abilityId: "nebula-curse", params: {} }],
  },
  {
    id: "homura",
    name: "焔",
    reading: "ホムラ",
    color: "#e0552b",
    role: "gambler",
    bio: "1巡目に全てを賭ける博打型。満貫以上で1.5倍、未満は点数固定の諸刃。",
    profile: "立ち上がりの一瞬に勝負を懸ける焔の打ち手。大物手なら炎は燃え盛り（1.5倍）、小さくまとめれば火は萎む（固定点）。安手で妥協せず、常に満貫以上を狙い続ける生き様の体現者。",
    stats: { startingPoints: 13000 }, // gambler: conditional burst, modest HP
    assets: assetsFor("homura"),
    params: { attack: 5, defense: 2, quirk: 4, difficulty: 4 },
    abilities: [{ abilityId: "homura", params: {} }],
  },
  {
    id: "kakeha_ruina",
    name: "賭羽ルイナ",
    reading: "カケハ・ルイナ",
    color: "#8b5cf6",
    role: "gambler",
    bio: "1巡目に点棒を賭ける博打型。5000点で和了1.5倍／10000点で2倍。外せば賭け金は丸損。",
    profile: "勝負の天秤に己の点棒を積み上げる女博徒。立ち上がりの一瞬（1巡目）に賭け金を放り込み、アガりの果実を1.5倍・2倍へと膨らませる。負ければ賭け金は霧と消える——それでも彼女は笑って牌を握る、ハイリスクの体現者。",
    stats: { startingPoints: 18000 }, // 前払いの賭け金(最大1万)を払えるよう厚めのHP
    assets: assetsFor("kakeha_ruina"),
    params: { attack: 5, defense: 2, quirk: 5, difficulty: 5 },
    abilities: [{ abilityId: "kakeha-bet", params: {} }],
  },
  {
    id: "janedoe",
    name: "JaneDoe",
    reading: "ジェーンドゥ",
    color: "#5b6b78",
    role: "extra",
    bio: "相手の手を縛る妨害型。狙った相手を3巡のあいだ強制ツモ切りにする。",
    profile: "名もなき疫病医のいでたちで卓を徘徊する妨害者。狙いを定めた相手から打牌の自由を奪い（強制ツモ切り）、手作りを停滞させる。攻めは地味だが、場を支配する不気味な存在感を放つ。",
    stats: { startingPoints: 16000 }, // disruptor: utility over raw offense, sturdy HP
    assets: assetsFor("janedoe"),
    params: { attack: 2, defense: 3, quirk: 5, difficulty: 4 },
    abilities: [{ abilityId: "jane-doe", params: {} }],
  },
  {
    id: "bibi",
    name: "ビビ",
    reading: "",
    color: "#5aa9e6",
    role: "blocker",
    bio: "鉄壁の守りを誇る防御型。発動後6打牌のあいだロン・ツモで失点しない。",
    profile: "あどけない見た目に反して鉄壁の守りを誇る打ち手。一度身を固めれば（6打牌のあいだ）どんなアガりも己の点棒には届かない。攻めずとも沈まない、粘り勝ちの申し子。",
    stats: { startingPoints: 14000 }, // defensive immunity window; standard-ish HP
    assets: assetsFor("bibi"),
    params: { attack: 2, defense: 5, quirk: 2, difficulty: 1 },
    abilities: [{ abilityId: "bibi", params: {} }],
  },
  {
    id: "charybdis",
    name: "カリュブディス",
    reading: "",
    color: "#4a8fb5",
    role: "extra",
    bio: "和了を捨て流局に賭ける異形の打ち手。和了不可だが、流局の受取が3倍・流し満貫が役満になる。超高HP。",
    profile: "全てを呑み込む深淵の渦を宿した打ち手。アガりという果実を永遠に手放した代償に、場が流れるたび点棒を蒐集する（流局の受取3倍）。誰も和了れぬまま局が枯れることこそ彼女の狩り——終局へ引きずり込む流し満貫は、役満の威をもって相手を沈める。",
    stats: { startingPoints: 23000 }, // 和了で攻めれない分の高HP。ネビュラ(25000)のちょい下。
    assets: assetsFor("charybdis"),
    params: { attack: 1, defense: 3, quirk: 5, difficulty: 5 },
    abilities: [{ abilityId: "abyss-collection", params: {} }],
  },
];
