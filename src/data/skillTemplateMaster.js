// スキルテンプレートマスタ（育成用能力）— major_update_specification.md §10.4 / §16.2。
//
// マイキャラが選ぶ「能力種類」はここから選ぶ（既存能力 abilityMaster を直接複製しない）。
// runtimeAbilityId が対局に投入される実体の能力ID（abilityMaster と一致）。
// mentorCharacterIds でその師匠に弟子入りしたときに選べる候補を絞る。
//
// Phase 2A では「選択して保存する」までを使う。Lv 差分（SkillLevelMaster）と
// ランタイム生成（Phase 7）は後続フェーズで参照する。
//
// integrationTier:
//   hook_only       … 既存フックと通常ボタンで動く
//   target_select   … 対象選択 UI が必要
//   engine_assisted … エンジン補助メソッドが必要
//
// 初期師匠3人（詩玥 / ビビ / 賭羽ルイナ）ぶんを定義。各師匠に2候補（初期能力＋能力変更先）。
export const SKILL_TEMPLATE_MASTER = [
  // ---- 詩玥（攻撃系）----
  {
    skillTemplateId: "tmpl-lucky-draw",
    runtimeAbilityId: "lucky-draw",
    name: "幸運のツモ",
    description: "ツモ運を引き寄せる攻撃型の基礎。手が早く、押しの展開に強い。",
    familyId: "draw",
    paramAffinity: ["gamble", "speed"], // 運でツモる＝勝負勘(主)・速度(副)に寄せる（初期ステ配分）
    rarity: "normal",
    mentorCharacterIds: ["shiyue"],
    integrationTier: "hook_only",
    levelTableId: "lv-lucky-draw",
    initialSkillLevel: 1,
    isEnabled: true,
  },
  {
    skillTemplateId: "tmpl-chunchan-rush",
    runtimeAbilityId: "chunchan",
    name: "中張の速攻",
    description: "2〜8の中張牌を呼び込み、タンヤオ軸で手数を押し付ける速攻型。",
    familyId: "draw",
    paramAffinity: ["speed", "fire"], // 速攻＝速度(主)・火力(副)
    rarity: "normal",
    mentorCharacterIds: ["shiyue"],
    integrationTier: "hook_only",
    levelTableId: "lv-chunchan",
    initialSkillLevel: 1,
    isEnabled: true,
  },
  // ---- ビビ（守備系）----
  {
    skillTemplateId: "tmpl-iron-guard",
    runtimeAbilityId: "bibi",
    name: "身代わり人形",
    description: "発動後しばらく、ロン・ツモを帳消しにする——自分は失点せず、勝者も得点を得られない。誰にも奪わせない無効化の軸。",
    familyId: "defense",
    paramAffinity: ["guard", "mental"], // 守りの要＝守備(主)・メンタル(副)
    rarity: "rare",
    mentorCharacterIds: ["bibi"],
    integrationTier: "engine_assisted",
    levelTableId: "lv-iron-guard",
    initialSkillLevel: 1,
    isEnabled: true,
  },
  {
    skillTemplateId: "tmpl-danger-sense",
    runtimeAbilityId: "danger-sense",
    name: "危険察知",
    description: "場の気配から危険牌を見抜き、放銃を避ける守備型の基礎。",
    familyId: "defense",
    paramAffinity: ["read", "guard"], // 察知＝読み(主)・守備(副)
    rarity: "normal",
    mentorCharacterIds: ["bibi"],
    integrationTier: "hook_only",
    levelTableId: "lv-danger-sense",
    initialSkillLevel: 1,
    isEnabled: true,
  },
  // ---- 賭羽ルイナ（ギャンブル系）----
  {
    skillTemplateId: "tmpl-gamble-bet",
    runtimeAbilityId: "kakeha-bet",
    name: "点棒の賭け",
    description: "1巡目に点棒を賭け、和了点を1.5〜2倍へ膨らませる博打型。外せば賭け金は丸損。",
    familyId: "gamble",
    paramAffinity: ["gamble", "fire"], // 博打＝勝負勘(主)・火力(副)
    rarity: "rare",
    mentorCharacterIds: ["kakeha_ruina"],
    integrationTier: "target_select",
    levelTableId: "lv-gamble-bet",
    initialSkillLevel: 1,
    isEnabled: true,
  },
  {
    skillTemplateId: "tmpl-dora-pull",
    runtimeAbilityId: "dora-pull",
    name: "ドラ手繰り",
    description: "ドラを手元へ集める一発逆転型。最強格の打点だが守りは脆い。",
    familyId: "gamble",
    paramAffinity: ["fire", "gamble"], // 一発逆転＝火力(主)・勝負勘(副)
    rarity: "rare",
    mentorCharacterIds: ["kakeha_ruina"],
    integrationTier: "hook_only",
    levelTableId: "lv-dora-pull",
    initialSkillLevel: 1,
    isEnabled: true,
  },
  // ---- 凌雲（守備系・将来の師匠枠）----
  // 育成テンプレ。フリー対戦の凌雲は characterMaster の params:{}＝コンストラクタ既定値(=Lv5)で
  // 動くため現挙動には影響しない。これは育成（凌雲師匠化／マイキャラがこの能力を選ぶ）で
  // lv-amber-shield の Lv 差分（超越帯 Lv6〜10＝天衣無縫）へ到達させるための結線。
  // ---- 篠宮 栞（補助・支援系／宝珠ショップ解禁の家庭教師）----
  // 育成テンプレ。フリー対戦の栞は characterMaster の params:{}＝コンストラクタ既定値(=Lv5)で
  // 動くため現挙動には影響しない。これは育成（栞のスキルLvを上げる導線が将来できたとき）で
  // lv-model-answer の Lv 差分（超越帯 Lv6〜10＝トップ捲り条件・押し引き判断）へ到達させるための
  // 結線。栞は INITIAL_MENTOR_IDS に居ないため、現状どの師匠ピッカーにも出ない（足場のみ）。
  {
    skillTemplateId: "tmpl-model-answer",
    runtimeAbilityId: "model-answer",
    name: "模範解答",
    description: "牌効率の最善手を手牌に①②③で指し示す家庭教師型。シャンテンが深い局面ほど寄り添い、勝負所は自分で打たせる。",
    familyId: "support",
    paramAffinity: ["read", "speed"], // 最善手を読む＝読み(主)・速度(副)
    rarity: "rare",
    mentorCharacterIds: ["teacher"],
    integrationTier: "hook_only",
    levelTableId: "lv-model-answer",
    initialSkillLevel: 1,
    isEnabled: true,
  },
  // ---- 沼田 蓮（ギャンブル系・同級生枠＝師匠にはならない）----
  // 育成テンプレ。フリー対戦の沼田は characterMaster の params:{}＝コンストラクタ既定値(=Lv5)で
  // 動くため現挙動には影響しない。lv-muddy-lotus の Lv 差分（超越帯 Lv6〜10＝泥中に咲く）への結線。
  // ★沼田は弟子の「同級生」（凌雲編の宿敵→好敵手）なので師匠化はしない＝INITIAL_MENTOR_IDS に
  //   将来も入れないこと。栞と同じ「足場のみ」＝現状どの師匠ピッカーにも出ない。
  {
    skillTemplateId: "tmpl-muddy-lotus",
    runtimeAbilityId: "muddy-lotus",
    name: "泥中の蓮",
    description: "卓全体のアガリ点を泥に沈め、自分の3ハン以下だけを1.5倍で咲かせる泥仕合型。派手さを捨て、消耗戦を制する。",
    familyId: "gamble",
    paramAffinity: ["mental", "gamble"], // 泥仕合の我慢＝メンタル(主)・“いけそう”の勘＝勝負勘(副)
    rarity: "rare",
    mentorCharacterIds: ["ren"],
    integrationTier: "hook_only",
    levelTableId: "lv-muddy-lotus",
    initialSkillLevel: 1,
    isEnabled: true,
  },
  {
    skillTemplateId: "tmpl-amber-shield",
    runtimeAbilityId: "amber-shield",
    name: "琥珀の盾",
    description: "致命の一撃だけを受け止める持続シールド。満貫以上の放銃・被ツモを0にし、満貫未満では剥がれる守備特化型。攻めて勝つほど盾が甦る。",
    familyId: "defense",
    paramAffinity: ["guard", "mental"], // 守りの要＝守備(主)・メンタル(副)
    rarity: "rare",
    mentorCharacterIds: ["kuidoshi"],
    integrationTier: "engine_assisted",
    levelTableId: "lv-amber-shield",
    initialSkillLevel: 1,
    isEnabled: true,
  },
];

// 初期師匠候補（major_update_specification.md §9.3：攻撃 / 守備 / ギャンブルの3系統）。
// 既存キャラ(characterMaster)の id を指す。Phase 2A のマイキャラ作成で師匠選択に使う。
export const INITIAL_MENTOR_IDS = ["shiyue", "bibi", "kakeha_ruina", "kuidoshi"];

export function templatesForMentor(mentorCharacterId) {
  return SKILL_TEMPLATE_MASTER.filter(
    (t) => t.isEnabled && t.mentorCharacterIds.includes(mentorCharacterId)
  );
}

export function skillTemplateById(skillTemplateId) {
  return SKILL_TEMPLATE_MASTER.find((t) => t.skillTemplateId === skillTemplateId) || null;
}

// 対局能力ID → テンプレの逆引き。師匠キャラの能力（characterMaster.abilities[0]）に
// スキル Lv テーブル（levelTableId）を効かせるときに使う。該当なしは null＝従来挙動。
export function templateForAbility(runtimeAbilityId) {
  return SKILL_TEMPLATE_MASTER.find((t) => t.isEnabled && t.runtimeAbilityId === runtimeAbilityId) || null;
}
