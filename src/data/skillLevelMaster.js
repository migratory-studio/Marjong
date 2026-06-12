// スキル Lv マスタ — major_update_specification.md §10.5 / §16.2。
//
// levelTableId ごとに Lv1〜Lv10 を定義する。スキル Lv は 2 帯に分かれる（§10.5）:
//   - 基準帯 Lv1〜5 … 通常育成／フリー対戦の固定値。Lv5＝完成基準（上限）
//       - 育成開始のマイキャラ … Lv1（能力習得・能力変更直後の初期値）
//       - フリー対戦の既存キャラ／師匠 … Lv5（到達目標・対戦基準）
//       - Lv5 の runtimeParams を既存キャラの現行性能と一致させる想定
//   - 超越帯 Lv6〜10 … 育成反映でのみ到達。フリー対戦には出現させない。
//       基準帯を上回る強化（派生効果の追加・効果量上振れ）はこの帯に置く。
//
// soulCost はその Lv へ「到達する」ための費用（Lv1 は初期値なので 0）。超越帯は
// 基準帯より急勾配にしてプレミアム化する。
// ペース設計（test/leveldesign.mjs で回帰）: Lv5＝師匠相当は重み＝最初の宝（一蓮）より
// 先には届かず、師弟編フィナーレ（大三剣≈11ヶ月目）前後に到達する。Lv6（読みの目覚め）は
// 覇道編の中盤、Lv10（神算鬼謀）は最終戦前後＝系譜の完成として終盤に置く。
// runtimeParams は対局投入時パラメータ。Phase 2B では保存・表示・育成までを使い、
// 数値差分の対局反映は対応済みテンプレートだけ Phase 7 で行う（§10.5 初期方針）。
//                   Lv1   2    3     4     5  |    6     7     8     9    10
const COST_CURVE = [   0, 400, 800, 1400, 2200, 2800, 3600, 4600, 5800, 7200];

// 6 系統ぶんの Lv テーブルを共通カーブで生成する。unlockDescription だけ
// テンプレートごとに味付けし、育成画面で「この Lv で何が変わるか」を伝える。
// 各系統 10 段階（基準帯 Lv1〜5＋超越帯 Lv6〜10）の説明を渡す。
function buildTable(unlockDescriptions) {
  return unlockDescriptions.map((desc, i) => ({
    skillLevel: i + 1,
    soulCost: COST_CURVE[i] ?? 0,
    runtimeParams: {}, // Phase 7 で各能力の効果量を割り当てる
    maxChargesOverride: null,
    cooldownOverride: null,
    unlockDescription: desc,
  }));
}

// 幸運のツモ（詩玥・tmpl-lucky-draw）は skill-smith で本設計済み（正本: skill-smith/output/tmpl-lucky-draw.json）。
// 基準帯 Lv1〜5 ＝「引き」の完成（Lv5＝現行 LuckyDrawAbility と完全一致：全8候補×1ゲーム2局）。
// 超越帯 Lv6〜10 ＝「読みが宿る」＝マモリの危険感知(danger-sense)が段階付与され、Lv10＝神算鬼謀の系譜
// （詩玥の覇道編アーク「読めるし、引ける」とプレイヤーの能力進化をシンクロさせる）。
// runtimeParams の契約:
//   lookaheadDepth … 使う候補数（候補窓は registry.resolveDraw の peekLive(8) 固定＝8が天井）
//   dangerTier     … 危険感知の副次付与 0〜3（1=赤のみ / 2=赤＋橙 / 3=フル3段階＝マモリ相当・常時）
//   doraPreference … 伸びが同点ならドラ/赤5を優先して引く
// テキストは2本立て: effectDescription＝「いま何ができるか」（そのLvの効果まとめ・育成画面の現在欄／
// 対局ツールチップ）、unlockDescription＝「上げると何が変わるか」（次Lvの伸び方説明・強化ボタン横）。
const LUCKY_DRAW_LEVELS = [
  { skillLevel: 1,  soulCost: 0,    runtimeParams: { lookaheadDepth: 2, dangerTier: 0, doraPreference: false }, maxChargesOverride: 1, cooldownOverride: null,
    effectDescription: "発動した局、ツモが有利牌へ寄る。先読み2候補・1ゲーム1局。",
    unlockDescription: "習得。1ゲーム1局、発動した局のツモが有利牌へ寄る（2候補先読み）。" },
  { skillLevel: 2,  soulCost: 400,  runtimeParams: { lookaheadDepth: 4, dangerTier: 0, doraPreference: false }, maxChargesOverride: 1, cooldownOverride: null,
    effectDescription: "発動した局、ツモが有利牌へ寄る。先読み4候補・1ゲーム1局。",
    unlockDescription: "先読みが4候補に。狙った形へ手が伸びやすくなる。" },
  { skillLevel: 3,  soulCost: 800,  runtimeParams: { lookaheadDepth: 4, dangerTier: 0, doraPreference: false }, maxChargesOverride: 2, cooldownOverride: null,
    effectDescription: "発動した局、ツモが有利牌へ寄る。先読み4候補・1ゲーム2局。",
    unlockDescription: "発動が1ゲーム2局に増える。" },
  { skillLevel: 4,  soulCost: 1400, runtimeParams: { lookaheadDepth: 6, dangerTier: 0, doraPreference: false }, maxChargesOverride: 2, cooldownOverride: null,
    effectDescription: "発動した局、ツモが有利牌へ寄る。先読み6候補・1ゲーム2局。",
    unlockDescription: "先読みが6候補に。引きの再現性が上がる。" },
  { skillLevel: 5,  soulCost: 2200, runtimeParams: { lookaheadDepth: 8, dangerTier: 0, doraPreference: false }, maxChargesOverride: 2, cooldownOverride: null,
    effectDescription: "発動した局、ツモが有利牌へ寄る。先読み8候補・1ゲーム2局（師匠・詩玥と同等）。",
    unlockDescription: "完成基準。8候補先読み×1ゲーム2局＝師匠・詩玥と同等の引き。" },
  { skillLevel: 6,  soulCost: 2800, runtimeParams: { lookaheadDepth: 8, dangerTier: 1, doraPreference: false }, maxChargesOverride: 2, cooldownOverride: null,
    effectDescription: "引き＝8候補×2局。さらに常時、超危険の牌が赤く視える（読み・弱）。",
    unlockDescription: "超越域へ。最も危険な牌が赤く\"視える\"ようになる——読みの目覚め。" },
  { skillLevel: 7,  soulCost: 3600, runtimeParams: { lookaheadDepth: 8, dangerTier: 1, doraPreference: false }, maxChargesOverride: 3, cooldownOverride: null,
    effectDescription: "引き＝8候補×3局。常時、超危険の牌が赤く視える（読み・弱）。",
    unlockDescription: "発動が1ゲーム3局に。引きが途切れない。" },
  { skillLevel: 8,  soulCost: 4600, runtimeParams: { lookaheadDepth: 8, dangerTier: 2, doraPreference: false }, maxChargesOverride: 3, cooldownOverride: null,
    effectDescription: "引き＝8候補×3局。常時、危険牌を赤・橙の二段階で見分ける（読み・中）。",
    unlockDescription: "読みが深まり、危険牌を二段階（赤・橙）で見分ける。" },
  { skillLevel: 9,  soulCost: 5800, runtimeParams: { lookaheadDepth: 8, dangerTier: 2, doraPreference: true },  maxChargesOverride: 3, cooldownOverride: null,
    effectDescription: "引き＝8候補×3局・同点ならドラ/赤5優先。読みは赤・橙の二段階。",
    unlockDescription: "同じ伸びならドラ・赤5を引き寄せる。打点が翼になる。" },
  { skillLevel: 10, soulCost: 7200, runtimeParams: { lookaheadDepth: 8, dangerTier: 3, doraPreference: true },  maxChargesOverride: 3, cooldownOverride: null,
    effectDescription: "引き＝8候補×3局・ドラ/赤5優先。読みは赤・橙・黄の完全域（マモリ相当・常時）——神算鬼謀。",
    unlockDescription: "神算鬼謀。読みは三段階の完全域——読めるし、引ける。系譜の完成形。" },
];

// 琥珀の盾（凌雲・lv-amber-shield）— 守備特化の本結線テーブル（基準帯 Lv1〜5＋超越帯 Lv6〜10）。
// 基準帯＝「受けの完成」: 受け切る閾値が 倍満→満貫 へ下がり、被ツモもカバーするようになる
// （Lv5＝フリー対戦の凌雲＝AmberShieldAbility 既定値と完全一致：盾1・満貫閾値・被ツモ可・軽減0・補充なし）。
// 超越帯＝「守りが攻めへ転じる」: 剥がれても半額に抑え（Lv7）、盾枚数が2へ（Lv8）、和了で盾を
// 編み直す regen が宿り（Lv6〜）、Lv10＝守りと攻めが継ぎ目無く一体化。
// 称号は 不動雲嵐（Lv5＝受けの完成）→ 天衣無縫（Lv10＝超越）。詩玥の「深謀遠慮→神算鬼謀」と対の構造。
// runtimeParams の契約は AmberShieldAbility のコンストラクタと対応:
//   maxShields / protectTier / coverTsumo / stripMitigation / regen
const AMBER_SHIELD_LEVELS = [
  { skillLevel: 1,  soulCost: 0,    runtimeParams: { maxShields: 1, protectTier: "baiman",  coverTsumo: false, stripMitigation: 0,   regen: [] }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "盾1枚。倍満以上の放銃だけを受け切る（被ツモは対象外・満貫未満では剥がれる）。",
    unlockDescription: "習得。盾1枚で倍満以上の放銃のみ受け切る守りの芽生え。" },
  { skillLevel: 2,  soulCost: 400,  runtimeParams: { maxShields: 1, protectTier: "baiman",  coverTsumo: true,  stripMitigation: 0,   regen: [] }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "盾1枚。倍満以上の放銃・被ツモを受け切る。",
    unlockDescription: "被ツモも受け止められるようになる。守りの範囲が広がる。" },
  { skillLevel: 3,  soulCost: 800,  runtimeParams: { maxShields: 1, protectTier: "haneman", coverTsumo: true,  stripMitigation: 0,   regen: [] }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "盾1枚。跳満以上の放銃・被ツモを受け切る。",
    unlockDescription: "受け切る閾値が跳満まで下がる。より多くの大物手を止める。" },
  { skillLevel: 4,  soulCost: 1400, runtimeParams: { maxShields: 1, protectTier: "mangan",  coverTsumo: false, stripMitigation: 0,   regen: [] }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "盾1枚。満貫以上の放銃を受け切る（被ツモは対象外）。",
    unlockDescription: "閾値が満貫まで下がる。致命の一撃をより広く受け止める。" },
  { skillLevel: 5,  soulCost: 2200, runtimeParams: { maxShields: 1, protectTier: "mangan",  coverTsumo: true,  stripMitigation: 0,   regen: [] }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "盾1枚。満貫以上の放銃・被ツモを受け切る（フリー対戦の凌雲と同等）。",
    unlockDescription: "完成基準・不動雲嵐（ブードン・ユンラン）。満貫以上の放銃・被ツモを盾1枚で受け切る、動かぬ守りの極み＝凌雲の到達名。" },
  { skillLevel: 6,  soulCost: 2800, runtimeParams: { maxShields: 1, protectTier: "mangan",  coverTsumo: true,  stripMitigation: 0,   regen: [{ minRank: "mangan", amount: 1 }] }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "盾1枚（満貫以上を受け切る）。さらに満貫以上の和了で剥がれた盾が1枚甦る。",
    unlockDescription: "超越域へ。満貫以上を自分が和了すると、盾が1枚編み直される——守りが循環し始める。" },
  { skillLevel: 7,  soulCost: 3600, runtimeParams: { maxShields: 1, protectTier: "mangan",  coverTsumo: true,  stripMitigation: 0.5, regen: [{ minRank: "mangan", amount: 1 }] }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "盾1枚（満貫以上を受け切る）。満貫未満で剥がれても失点を半額に抑える。満貫以上の和了で盾+1。",
    unlockDescription: "盾が砕けるときも痛みを半分に。剥がれ際の損失を抑えられる。" },
  { skillLevel: 8,  soulCost: 4600, runtimeParams: { maxShields: 2, protectTier: "mangan",  coverTsumo: true,  stripMitigation: 0.5, regen: [{ minRank: "mangan", amount: 1 }] }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "盾2枚。満貫以上を受け切り、満貫未満は半額。満貫以上の和了で盾+1。",
    unlockDescription: "盾が2枚に。連続する大物手にも耐え抜ける。" },
  { skillLevel: 9,  soulCost: 5800, runtimeParams: { maxShields: 2, protectTier: "mangan",  coverTsumo: true,  stripMitigation: 0.5, regen: [{ minRank: "mangan", amount: 1 }, { minRank: "baiman", amount: 2 }] }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "盾2枚。満貫以上を受け切り満貫未満は半額。満貫以上の和了で盾+1、倍満以上なら一気に+2。",
    unlockDescription: "倍満以上の和了で盾が一度に2枚甦る。攻めるほど守りが満ちる。" },
  { skillLevel: 10, soulCost: 7200, runtimeParams: { maxShields: 2, protectTier: "mangan",  coverTsumo: true,  stripMitigation: 0.5, regen: [{ minWinPoints: 5000, amount: 1 }, { minRank: "baiman", amount: 2 }] }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "盾2枚。満貫以上を受け切り満貫未満は半額。5000点以上の和了で盾+1、倍満以上なら+2。",
    unlockDescription: "天衣無縫（ティエンイー・ウーフォン）——5000点の和了でも盾が甦り、倍満なら二枚同時に。守りと攻めに継ぎ目が無い、隙無き極致。" },
];

// 身代わり人形（ビビ・lv-iron-guard）— 守備特化の本結線テーブル（基準帯 Lv1〜5＋超越帯 Lv6〜10）。
// 基準帯＝「守りの完成」: 守りの窓 discardWindow が 3→6 に伸び、発動回数 maxCharges が 1→2 へ
// （Lv5＝フリー対戦のビビ＝BibiAbility 既定値と完全一致：窓6・1ゲーム2局・帳消し）。
// 超越帯＝「身代わりが攻めへ転じる」: 相棒・焔の火が宿り、ビビ自身の満貫以上の和了が
// winMultiplier 倍に（Lv6=1.1 … Lv10=1.5＝焔の満貫1.5倍に並ぶ）。守りに閉じた人形が、
// 信じて攻めを託す覇道編アークの体現＝殻破り。詩玥「読みが宿る」・凌雲「守りが循環」と対の構造。
// runtimeParams の契約は BibiAbility のコンストラクタと対応: discardWindow / winMultiplier（＋ maxChargesOverride）
const IRON_GUARD_LEVELS = [
  { skillLevel: 1,  soulCost: 0,    runtimeParams: { discardWindow: 3, winMultiplier: 1 },   maxChargesOverride: 1, cooldownOverride: null,
    effectDescription: "発動した局、3打牌のあいだロン・ツモを帳消し（失点0・勝者も得点0）。1ゲーム1局。",
    unlockDescription: "習得。3打牌ぶん、ロン・ツモを帳消しにする守りの芽生え。" },
  { skillLevel: 2,  soulCost: 400,  runtimeParams: { discardWindow: 4, winMultiplier: 1 },   maxChargesOverride: 1, cooldownOverride: null,
    effectDescription: "発動した局、4打牌のあいだロン・ツモを帳消し。1ゲーム1局。",
    unlockDescription: "守りの窓が4打牌に伸びる。受けきれる時間が長くなる。" },
  { skillLevel: 3,  soulCost: 800,  runtimeParams: { discardWindow: 5, winMultiplier: 1 },   maxChargesOverride: 1, cooldownOverride: null,
    effectDescription: "発動した局、5打牌のあいだロン・ツモを帳消し。1ゲーム1局。",
    unlockDescription: "守りの窓が5打牌に。誰にも奪わせない時間がさらに伸びる。" },
  { skillLevel: 4,  soulCost: 1400, runtimeParams: { discardWindow: 6, winMultiplier: 1 },   maxChargesOverride: 1, cooldownOverride: null,
    effectDescription: "発動した局、6打牌のあいだロン・ツモを帳消し。1ゲーム1局。",
    unlockDescription: "守りの窓が6打牌に到達。長い被弾もまるごと引き受ける。" },
  { skillLevel: 5,  soulCost: 2200, runtimeParams: { discardWindow: 6, winMultiplier: 1 },   maxChargesOverride: 2, cooldownOverride: null,
    effectDescription: "発動した局、6打牌のあいだロン・ツモを帳消し。1ゲーム2局（フリー対戦のビビと同等）。",
    unlockDescription: "完成基準。窓6打牌×1ゲーム2局＝誰にも奪わせない、身代わり人形の守りの完成。" },
  { skillLevel: 6,  soulCost: 2800, runtimeParams: { discardWindow: 6, winMultiplier: 1.1 }, maxChargesOverride: 2, cooldownOverride: null,
    effectDescription: "守り＝窓6×2局。さらに自分の満貫以上の和了が1.1倍に（相棒・焔の火が宿りはじめる）。",
    unlockDescription: "超越域へ。守りだけだったビビに、焔の火が灯る——満貫以上の和了が1.1倍。" },
  { skillLevel: 7,  soulCost: 3600, runtimeParams: { discardWindow: 7, winMultiplier: 1.1 }, maxChargesOverride: 2, cooldownOverride: null,
    effectDescription: "守り＝窓7×2局。自分の満貫以上の和了が1.1倍。",
    unlockDescription: "守りの窓が7打牌に。受けながら、攻めの火も絶やさない。" },
  { skillLevel: 8,  soulCost: 4600, runtimeParams: { discardWindow: 7, winMultiplier: 1.2 }, maxChargesOverride: 2, cooldownOverride: null,
    effectDescription: "守り＝窓7×2局。自分の満貫以上の和了が1.2倍。",
    unlockDescription: "宿った火が強まる——満貫以上の和了が1.2倍に。" },
  { skillLevel: 9,  soulCost: 5800, runtimeParams: { discardWindow: 8, winMultiplier: 1.3 }, maxChargesOverride: 2, cooldownOverride: null,
    effectDescription: "守り＝窓8×2局。自分の満貫以上の和了が1.3倍。",
    unlockDescription: "守りの窓が8打牌に伸び、攻めの火は1.3倍へ。守りと攻めが拮抗する。" },
  { skillLevel: 10, soulCost: 7200, runtimeParams: { discardWindow: 8, winMultiplier: 1.5 }, maxChargesOverride: 2, cooldownOverride: null,
    effectDescription: "守り＝窓8×2局。自分の満貫以上の和了が1.5倍（焔の満貫1.5倍に並ぶ）。",
    unlockDescription: "身代わりの火——守りが、攻めに変わる。焔から託された火が、ビビ自身の手に灯る殻破りの極み。満貫以上の和了が1.5倍。" },
];

export const SKILL_LEVEL_MASTER = {
  "lv-lucky-draw": LUCKY_DRAW_LEVELS,
  "lv-amber-shield": AMBER_SHIELD_LEVELS,
  "lv-iron-guard": IRON_GUARD_LEVELS,
  "lv-chunchan": buildTable([
    "中張牌の速攻が発動する基礎。",
    "タンヤオ移行が安定する。",
    "手数の押し付けが速くなる。",
    "鳴き判断の精度が上がる。",
    "師匠相当。速攻が完成する。",
    "超越域へ。中張の呼び込みが鋭くなる。",
    "タンヤオ移行がほぼ途切れない。",
    "鳴き判断が最適化される。",
    "終盤まで手数の優位を保つ。",
    "育成の極致。速攻が止まらない。",
  ]),
  "lv-danger-sense": buildTable([
    "危険牌察知の基礎。",
    "見抜ける危険牌が増える。",
    "読みの精度が上がる。",
    "終盤の放銃回避が安定する。",
    "師匠相当。危険察知が完成する。",
    "超越域へ。見抜ける危険牌が一段増える。",
    "読みが終盤までぶれない。",
    "複数リーチでも精度を保つ。",
    "放銃をほぼ回避する。",
    "育成の極致。場のすべてが見える。",
  ]),
  "lv-gamble-bet": buildTable([
    "点棒の賭けが発動する基礎。",
    "賭け倍率が安定する。",
    "賭け金の選択肢が広がる。",
    "失敗時の損失が緩和される。",
    "師匠相当。博打が完成する。",
    "超越域へ。賭け倍率の上限が上がる。",
    "賭け金の選択肢がさらに広がる。",
    "失敗時の損失が大きく緩和される。",
    "高倍率でも安定して通る。",
    "育成の極致。博打が必殺になる。",
  ]),
  "lv-dora-pull": buildTable([
    "ドラ手繰りの基礎。",
    "集めるドラ枚数が増える。",
    "打点の伸びが安定する。",
    "終盤までドラを抱えやすい。",
    "師匠相当。ドラ手繰りが完成する。",
    "超越域へ。集まるドラ枚数が増える。",
    "打点の伸びが一段上がる。",
    "終盤までドラを抱え切る。",
    "守りの脆さを補い始める。",
    "育成の極致。一撃が決定的になる。",
  ]),
};

export function skillLevelEntry(tableId, level) {
  return (SKILL_LEVEL_MASTER[tableId] || []).find((e) => e.skillLevel === level) || null;
}

// Lv エントリ → 対局能力へ渡す params（Phase 7 結線・§10.5）。
// runtimeParams に maxCharges / cooldown の上書きを畳み込んで1個のオブジェクトにする。
// effectDescription があれば desc（対局中ツールチップの説明文）も Lv 表記つきで差し替える。
// abilityDef との合成は能力側コンストラクタ（super({...def, ...params})）が行う。
// 未対応テンプレ（runtimeParams が空）はそのまま空 params ＝従来挙動になる。
export function skillRuntimeAbilityParams(tableId, level) {
  const e = skillLevelEntry(tableId, level);
  if (!e) return {};
  const params = { ...e.runtimeParams };
  if (e.maxChargesOverride != null) params.maxCharges = e.maxChargesOverride;
  if (e.cooldownOverride != null) params.cooldown = e.cooldownOverride;
  if (e.effectDescription) params.desc = `Lv${e.skillLevel}：${e.effectDescription}`;
  return params;
}

// 次の Lv のエントリ（最大なら null）。育成画面の費用表示・強化可否に使う。
export function nextSkillLevel(tableId, level) {
  return (SKILL_LEVEL_MASTER[tableId] || []).find((e) => e.skillLevel === level + 1) || null;
}

export function maxSkillLevel(tableId) {
  const t = SKILL_LEVEL_MASTER[tableId] || [];
  return t.length ? t[t.length - 1].skillLevel : 0;
}
