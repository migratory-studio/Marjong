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
    name: "鉄壁の守り",
    description: "発動後しばらくロン・ツモで失点しない鉄壁の守備。粘り勝ちの軸。",
    familyId: "defense",
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
    rarity: "rare",
    mentorCharacterIds: ["kakeha_ruina"],
    integrationTier: "hook_only",
    levelTableId: "lv-dora-pull",
    initialSkillLevel: 1,
    isEnabled: true,
  },
];

// 初期師匠候補（major_update_specification.md §9.3：攻撃 / 守備 / ギャンブルの3系統）。
// 既存キャラ(characterMaster)の id を指す。Phase 2A のマイキャラ作成で師匠選択に使う。
export const INITIAL_MENTOR_IDS = ["shiyue", "bibi", "kakeha_ruina"];

export function templatesForMentor(mentorCharacterId) {
  return SKILL_TEMPLATE_MASTER.filter(
    (t) => t.isEnabled && t.mentorCharacterIds.includes(mentorCharacterId)
  );
}

export function skillTemplateById(skillTemplateId) {
  return SKILL_TEMPLATE_MASTER.find((t) => t.skillTemplateId === skillTemplateId) || null;
}
