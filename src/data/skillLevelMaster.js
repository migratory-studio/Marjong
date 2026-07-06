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

// 大博打（賭羽ルイナ・lv-gamble-bet）— 賭けの本設計テーブル（基準帯 Lv1〜5＋超越帯 Lv6〜10）。
// 基準帯＝「大博打」: 1巡目に点棒を賭けて和了点1.5〜2倍（Lv5＝フリー対戦のルイナ＝KakehaBetAbility 既定値）。
// 超越帯 Lv6〜10 ＝「運命を手繰る」: ツモが有利牌へ寄る引き寄せ（＝詩玥のツモ偏重メカ lucky-draw を流用）が
// 段階的に宿る。ルイナの新像「いい目だと言えば、そうなる／運命を手なずける」がメカとして顕現する超越。
// 物語（覇道編 ep11「運命を手なずける」/ep16/ep19）とシンクロ。dangerTier（マモリの危険感知）は入れない
// ＝ルイナは守りでなく"運命を手繰る攻め"だから。
// runtimeParams の契約（KakehaBetAbility のコンストラクタと対応）:
//   drawBias       … 超越帯の常時ツモ偏重を有効化（Lv6+）。点棒の賭け（apply/MODIFY_SCORE）は常に機能。
//   lookaheadDepth … ツモ偏重の走査窓（候補窓 peekLive(8) が天井＝8で最大）
//   doraPreference … 伸びが同点ならドラ/赤5を引き寄せる（Lv9+）
const GAMBLE_BET_LEVELS = [
  { skillLevel: 1,  soulCost: 0,    runtimeParams: { drawBias: false, lookaheadDepth: 8, doraPreference: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "大博打：1巡目に点棒を賭け、和了点を1.5〜2倍へ。外せば賭け金は丸損。",
    unlockDescription: "習得。点棒を賭け金にして、和了点を膨らませる博打。" },
  { skillLevel: 2,  soulCost: 400,  runtimeParams: { drawBias: false, lookaheadDepth: 8, doraPreference: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "大博打：点棒を賭けて打点1.5〜2倍。賭けどころの勘所が掴めてくる。",
    unlockDescription: "賭けどころの見極めが、少しずつ冴えてくる。" },
  { skillLevel: 3,  soulCost: 800,  runtimeParams: { drawBias: false, lookaheadDepth: 8, doraPreference: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "大博打：点棒を賭けて打点1.5〜2倍。押し引きが安定する。",
    unlockDescription: "ここぞの押し引きが、ぶれなくなる。" },
  { skillLevel: 4,  soulCost: 1400, runtimeParams: { drawBias: false, lookaheadDepth: 8, doraPreference: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "大博打：点棒を賭けて打点1.5〜2倍。大勝負の度胸が据わる。",
    unlockDescription: "大きく賭ける度胸が、いよいよ据わる。" },
  { skillLevel: 5,  soulCost: 2200, runtimeParams: { drawBias: false, lookaheadDepth: 8, doraPreference: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "大博打・完成。点棒を賭けて打点1.5〜2倍（フリー対戦のルイナと同等）。",
    unlockDescription: "完成基準。賭ける様の極み——師匠・賭羽ルイナと同等の大博打。" },
  { skillLevel: 6,  soulCost: 2800, runtimeParams: { drawBias: true, lookaheadDepth: 2, doraPreference: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "大博打に加え、常時ツモが有利牌へ寄る（運命を手繰る・先読み2候補）。",
    unlockDescription: "超越域へ。運命を手繰りはじめ、ツモが有利牌へ寄る——『いい目だ』が形になる。" },
  { skillLevel: 7,  soulCost: 3600, runtimeParams: { drawBias: true, lookaheadDepth: 4, doraPreference: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "大博打＋常時ツモ偏重（運命を手繰る・先読み4候補）。",
    unlockDescription: "先読みが4候補に。運命の引き寄せが、より強くなる。" },
  { skillLevel: 8,  soulCost: 4600, runtimeParams: { drawBias: true, lookaheadDepth: 6, doraPreference: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "大博打＋常時ツモ偏重（運命を手繰る・先読み6候補）。",
    unlockDescription: "先読みが6候補に。引きの再現性が増す。" },
  { skillLevel: 9,  soulCost: 5800, runtimeParams: { drawBias: true, lookaheadDepth: 8, doraPreference: true },  maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "大博打＋常時ツモ偏重（先読み8候補・同点ならドラ/赤5を引き寄せる）。",
    unlockDescription: "同じ伸びなら、ドラ・赤5まで手繰る。打点ごと、運命を呼ぶ。" },
  { skillLevel: 10, soulCost: 7200, runtimeParams: { drawBias: true, lookaheadDepth: 8, doraPreference: true },  maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "大博打＋運命を完全に手なずける（先読み8候補・ドラ/赤5優先）——いい目だと言えば、そうなる。",
    unlockDescription: "極み。運命を手なずける伝説の域——『いい目だ』が、そのまま現実になる。" },
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

// 模範解答（篠宮 栞・lv-model-answer）— 牌効率トップ候補を手牌に灯す家庭教師型。
// 基準帯 Lv1〜5 ＝「指し示す精度の完成」: 灯す候補数 candidateCount が 1→3 へ、
// 効果が残る局面の閾値 shantenThreshold が 3→2 へ下がる（Lv5＝フリー対戦の栞＝
// ModelAnswerAbility 既定値と完全一致：候補3・2シャンテン以上で点灯／イーシャンテンで消える）。
// 超越帯 Lv6〜10 ＝「読みが言葉になる」: 効果がイーシャンテンまで残り（threshold=1）、
// Lv7 で“トップ捲り条件”を卓上に板書し（showComeback）、Lv9 で候補が5つに、
// Lv10 で“押すべき/オリるべき”の状況判断まで示す（showPushFold）——黒板の前で最善を
// いくらでも示せた教師が、勝負所の判断そのものを言葉にできるようになる到達。
// runtimeParams の契約は ModelAnswerAbility のコンストラクタと対応:
//   candidateCount    … 手牌に灯す打牌候補の数（①②③…・1〜5）
//   shantenThreshold  … 効果が残る最小シャンテン（実シャンテンが これ以上＝手が深いほど 点灯。
//                        3=サンシャンテン以上／2=リャンシャンテン以上／1=イーシャンテン以上＝聴牌の手前まで。
//                        既存能力 abilityMaster の正典表記「2シャンテン以上で点灯」と同じ向き）
//   showComeback      … トップ捲り条件を卓上HUDに板書（Lv7+）
//   showPushFold      … 「押すべき/オリるべき」の状況判断を表示（Lv10）
const MODEL_ANSWER_LEVELS = [
  { skillLevel: 1,  soulCost: 0,    runtimeParams: { candidateCount: 1, shantenThreshold: 3, showComeback: false, showPushFold: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "サンシャンテン以上のとき、最善の打牌1つを手牌に灯す（テンパイへ近づくと消える）。",
    unlockDescription: "習得。手が大きく崩れた局面で、最善の一打だけをそっと指し示す。" },
  { skillLevel: 2,  soulCost: 400,  runtimeParams: { candidateCount: 1, shantenThreshold: 2, showComeback: false, showPushFold: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "リャンシャンテン以上のとき、最善の打牌1つを灯す。",
    unlockDescription: "寄り添える局面が広がる。リャンシャンテンでも最善手が見えるように。" },
  { skillLevel: 3,  soulCost: 800,  runtimeParams: { candidateCount: 2, shantenThreshold: 3, showComeback: false, showPushFold: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "サンシャンテン以上のとき、有効な打牌の候補トップ2を灯す。",
    unlockDescription: "示せる候補が2つに。迷いどころの比較がしやすくなる。" },
  { skillLevel: 4,  soulCost: 1400, runtimeParams: { candidateCount: 2, shantenThreshold: 2, showComeback: false, showPushFold: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "リャンシャンテン以上のとき、候補トップ2を灯す。",
    unlockDescription: "リャンシャンテンでも候補2つを示せる。寄り添いの精度が上がる。" },
  { skillLevel: 5,  soulCost: 2200, runtimeParams: { candidateCount: 3, shantenThreshold: 2, showComeback: false, showPushFold: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "リャンシャンテン以上のとき、候補トップ3を灯す（フリー対戦の栞と同等）。",
    unlockDescription: "完成基準。候補トップ3を①②③で板書する、家庭教師の指し示しの完成。" },
  { skillLevel: 6,  soulCost: 2800, runtimeParams: { candidateCount: 3, shantenThreshold: 1, showComeback: false, showPushFold: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "イーシャンテンまで候補トップ3が残る（勝負所の手前まで寄り添う）。",
    unlockDescription: "超越域へ。イーシャンテンまで助言が消えない——最後の一歩まで隣にいる。" },
  { skillLevel: 7,  soulCost: 3600, runtimeParams: { candidateCount: 3, shantenThreshold: 1, showComeback: true, showPushFold: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "候補トップ3（イーシャンテンまで）。さらにトップ捲りの条件（満貫直撃・〇〇点ツモ等）を卓上に板書する。",
    unlockDescription: "勝ち筋を言葉に。首位を捲るための条件を、その都度たしかめて示してくれる。" },
  { skillLevel: 8,  soulCost: 4600, runtimeParams: { candidateCount: 4, shantenThreshold: 1, showComeback: true, showPushFold: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "候補トップ4（イーシャンテンまで）。トップ捲り条件を板書。",
    unlockDescription: "示せる候補が4つに。広い選択肢から最善を見比べられる。" },
  { skillLevel: 9,  soulCost: 5800, runtimeParams: { candidateCount: 5, shantenThreshold: 1, showComeback: true, showPushFold: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "候補トップ5（イーシャンテンまで）。トップ捲り条件を板書。",
    unlockDescription: "示せる候補が5つに。手なりの最善が、ほぼ余さず見える。" },
  { skillLevel: 10, soulCost: 7200, runtimeParams: { candidateCount: 5, shantenThreshold: 1, showComeback: true, showPushFold: true }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "候補トップ5・トップ捲り条件に加え、「押すべき／オリるべき」の状況判断まで示す——模範解答の極み。",
    unlockDescription: "最終解。最善手も勝ち筋も、そして“いま押すか退くか”までも言葉になる。教壇の達観が、勝負の場に降りてくる。" },
];

// 泥中の蓮（沼田 蓮・lv-muddy-lotus）— 卓全体を泥に沈めるフィールド型の本設計テーブル。
// 基準帯 Lv1〜5 ＝「泥と蓮の完成」: 泥（全員のアガリ点減少）が -10%→-25% へ深まり、
// 蓮（自分の3ハン以下の倍率・泥の対象外）が 1.2→1.5 へ咲く（Lv5＝フリー対戦の沼田＝
// MuddyLotusAbility 既定値と完全一致）。cheapHanMax=3 は全Lv固定＝「格好悪く安手で勝つ」
// 美学は育っても変わらない（自分の4ハン以上は他人と同様に泥へ沈む縛りが常に効く）。
// 超越帯 Lv6〜10 ＝「泥中に咲く」: 泥が沈めた点数が「沈殿」として溜まり（ゲーム単位）、
// 自分の蓮の和了時に absorbRate ぶんを吸い上げて加点する（非ゼロサム＝支払い側は増えない）。
// 沼田は師匠を持たない同級生枠（凌雲編の宿敵→好敵手）なので、超越帯は“相棒の能力”でなく
// 本人の美学『格好悪く泥臭く勝ち、同じような生き方の誰かに希望を見せる』の完成として設計する
// （凌雲式＝literal能力でなく哲学を宿す先例に連なる）。Lv10＝『いつも、なりたい自分をイメージして打つ』。
// runtimeParams の契約（MuddyLotusAbility のコンストラクタと対応）:
//   reduceRate      … 泥。全員のアガリ点の減少率（0.25＝-25%）
//   cheapHanMax     … 蓮の対象となる自分のアガリの最大ハン数（全Lv固定 3）
//   cheapMultiplier … 蓮。自分の3ハン以下のアガリの倍率（泥の対象外）
//   absorbRate      … 超越帯。沈殿を蓮の和了時に吸い上げる割合（吸ったら沈殿は流れる）
const MUDDY_LOTUS_LEVELS = [
  { skillLevel: 1,  soulCost: 0,    runtimeParams: { reduceRate: 0.10, cheapHanMax: 3, cheapMultiplier: 1.2, absorbRate: 0 }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "泥＝全員のアガリ点-10%。蓮＝自分の3ハン以下は泥の対象外・1.2倍で咲く。",
    unlockDescription: "習得。卓を浅い泥に沈め、自分の安手だけを咲かせる泥仕合の芽生え。" },
  { skillLevel: 2,  soulCost: 400,  runtimeParams: { reduceRate: 0.15, cheapHanMax: 3, cheapMultiplier: 1.3, absorbRate: 0 }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "泥＝全員のアガリ点-15%。蓮＝自分の3ハン以下は1.3倍。",
    unlockDescription: "泥が深まり（-15%）、蓮の咲きも大きく（1.3倍）。" },
  { skillLevel: 3,  soulCost: 800,  runtimeParams: { reduceRate: 0.20, cheapHanMax: 3, cheapMultiplier: 1.3, absorbRate: 0 }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "泥＝全員のアガリ点-20%。蓮＝自分の3ハン以下は1.3倍。",
    unlockDescription: "泥がさらに深く（-20%）。大物手ほど深く沈む。" },
  { skillLevel: 4,  soulCost: 1400, runtimeParams: { reduceRate: 0.20, cheapHanMax: 3, cheapMultiplier: 1.4, absorbRate: 0 }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "泥＝全員のアガリ点-20%。蓮＝自分の3ハン以下は1.4倍。",
    unlockDescription: "蓮が育つ。安手の花が1.4倍に。" },
  { skillLevel: 5,  soulCost: 2200, runtimeParams: { reduceRate: 0.25, cheapHanMax: 3, cheapMultiplier: 1.5, absorbRate: 0 }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "泥＝全員のアガリ点-25%（自分の4ハン以上も沈む）。蓮＝自分の3ハン以下は対象外・1.5倍（フリー対戦の沼田と同等）。",
    unlockDescription: "完成基準。泥-25%×蓮1.5倍——格好悪く、泥臭く勝つ。沼田の泥仕合の完成。" },
  { skillLevel: 6,  soulCost: 2800, runtimeParams: { reduceRate: 0.25, cheapHanMax: 3, cheapMultiplier: 1.5, absorbRate: 0.15 }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "泥-25%・蓮1.5倍。さらに泥が沈めた点が「沈殿」として溜まり、自分の3ハン以下の和了で15%を吸い上げる。",
    unlockDescription: "超越域へ。泥に沈んだ点を、蓮が養分として吸いはじめる——泥中に咲く。" },
  { skillLevel: 7,  soulCost: 3600, runtimeParams: { reduceRate: 0.25, cheapHanMax: 3, cheapMultiplier: 1.5, absorbRate: 0.25 }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "泥-25%・蓮1.5倍・吸い上げ25%。",
    unlockDescription: "根が深くなる。沈殿の25%を吸い上げる。" },
  { skillLevel: 8,  soulCost: 4600, runtimeParams: { reduceRate: 0.30, cheapHanMax: 3, cheapMultiplier: 1.5, absorbRate: 0.25 }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "泥-30%・蓮1.5倍・吸い上げ25%。",
    unlockDescription: "泥が最深部へ（-30%）。派手な打点は、もうこの卓では咲かない。" },
  { skillLevel: 9,  soulCost: 5800, runtimeParams: { reduceRate: 0.30, cheapHanMax: 3, cheapMultiplier: 1.6, absorbRate: 0.35 }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "泥-30%・蓮1.6倍・吸い上げ35%。",
    unlockDescription: "蓮が大輪に（1.6倍）。沈殿の35%を吸い上げる。" },
  { skillLevel: 10, soulCost: 7200, runtimeParams: { reduceRate: 0.30, cheapHanMax: 3, cheapMultiplier: 1.6, absorbRate: 0.50 }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "泥-30%・蓮1.6倍・吸い上げ50%——泥中の蓮、満開。",
    unlockDescription: "満開。『いつも、なりたい自分をイメージして打つ』——泥に沈んだ点の半分を吸い上げ、格好悪い勝ち方が誰かの希望になる。" },
];

// 天啓ドラ寄せ（ドラニエル・lv-dora-pull）— 一発逆転型の本設計テーブル（基準帯 Lv1〜5＋超越帯 Lv6〜10）。
// 基準帯＝「賭けの完成」: 発動できる局数 maxHands が 1→2、1局のめくり回数 maxCharges が 1→2 へ
// （Lv5＝フリー対戦のドラニエル＝DoraPullAbility 既定値と完全一致：1局2回×1ゲーム2局・
//   めくった回数分の確定ドラ後付け）。めくった新ドラは全員に効く諸刃＝この縛りは全Lv不変。
// 超越帯 Lv6〜10 ＝「能力自身が極まる」型（相棒 graft はしない）：
//   前半（Lv6〜7）＝賭けの深化。1局のめくりが3枚に（確定ドラ3の火柱と、四開槓の崖が同時に近づく諸刃）、
//   発動できる局が3局に。
//   後半（Lv8〜10）＝**「背水の天啓」**＝張った局の和了時、自分の持ち点が薄いほど確定ドラが増える
//   ——紙HP＝グラスキャノンの弱点そのものが火力に反転する。「脆さ込みで賭けを楽しむ」流儀の完成形で、
//   覇道編の紙HP反転アーク（二人なら飛ばぬ→三人なら飛ばぬ＝飛び際こそ見せ場）とシンクロ。
//   Lv8=開始点の25%以下で+1 → Lv9=50%以下に拡大 → Lv10=50%以下+1・25%以下+2（紙一重こそ、最高じゃ）。
// dangerTier（守り）は入れない＝紙の点棒は流儀ごと変わらない（守らず、燃やす）。
// runtimeParams の契約（DoraPullAbility のコンストラクタと対応）:
//   maxHands / lastStand（[{ratio, bonus}] 持ち点比の段階表・最深段を採用）
const DORA_PULL_LEVELS = [
  { skillLevel: 1,  soulCost: 0,    runtimeParams: { maxHands: 1, lastStand: [] }, maxChargesOverride: 1, cooldownOverride: null,
    effectDescription: "発動で新ドラ表示牌を1枚めくり、和了時に確定ドラ1を上乗せ。1ゲーム1局×1回。めくったドラは全員に効く諸刃。",
    unlockDescription: "習得。新ドラを1枚暴き、自分の和了にだけ確定ドラを乗せる賭けの芽生え。" },
  { skillLevel: 2,  soulCost: 400,  runtimeParams: { maxHands: 2, lastStand: [] }, maxChargesOverride: 1, cooldownOverride: null,
    effectDescription: "新ドラめくり（確定ドラ1）を1ゲーム2局で張れる。",
    unlockDescription: "別の局でも張れるようになる（1ゲーム2局）。" },
  { skillLevel: 3,  soulCost: 800,  runtimeParams: { maxHands: 2, lastStand: [] }, maxChargesOverride: 2, cooldownOverride: null,
    effectDescription: "同じ局に2枚目をめくれる（確定ドラ2）。1ゲーム2局。めくり過ぎ（場計4枚）は四開槓で流局する諸刃。",
    unlockDescription: "同じ局でもう1枚めくれる——確定ドラ2の火柱。ただし場が荒れ、四開槓の危険も近づく。" },
  { skillLevel: 4,  soulCost: 1400, runtimeParams: { maxHands: 2, lastStand: [] }, maxChargesOverride: 2, cooldownOverride: null,
    effectDescription: "1局2回×1ゲーム2局。めくりどころの押し引きが冴えてくる。",
    unlockDescription: "どの局に張るか、どこで止めるか——賭けどころの見極めが据わる。" },
  { skillLevel: 5,  soulCost: 2200, runtimeParams: { maxHands: 2, lastStand: [] }, maxChargesOverride: 2, cooldownOverride: null,
    effectDescription: "天啓ドラ寄せ・完成。1局2回×1ゲーム2局、めくった回数分の確定ドラ（フリー対戦のドラニエルと同等）。",
    unlockDescription: "完成基準。最強の一発と紙の点棒——師匠・ドラニエルと同等の大博打。" },
  { skillLevel: 6,  soulCost: 2800, runtimeParams: { maxHands: 2, lastStand: [] }, maxChargesOverride: 3, cooldownOverride: null,
    effectDescription: "同じ局に3枚目をめくれる（確定ドラ3の火柱）。1ゲーム2局。四開槓の崖は、さらに近い。",
    unlockDescription: "超越域へ。3枚目の天啓——火柱は高く、崖は近く。賭けが、深くなる。" },
  { skillLevel: 7,  soulCost: 3600, runtimeParams: { maxHands: 3, lastStand: [] }, maxChargesOverride: 3, cooldownOverride: null,
    effectDescription: "1局3回×1ゲーム3局——張れる博打が増える。",
    unlockDescription: "張れる局が3局に。下界の卓は、賭け場だらけじゃ。" },
  { skillLevel: 8,  soulCost: 4600, runtimeParams: { maxHands: 3, lastStand: [{ ratio: 0.25, bonus: 1 }] }, maxChargesOverride: 3, cooldownOverride: null,
    effectDescription: "背水の天啓・解禁——張った局の和了時、持ち点が開始点の25%以下なら確定ドラ+1。",
    unlockDescription: "飛び際に、天啓が濃くなる——紙の点棒が、初めて武器になる。" },
  { skillLevel: 9,  soulCost: 5800, runtimeParams: { maxHands: 3, lastStand: [{ ratio: 0.5, bonus: 1 }] }, maxChargesOverride: 3, cooldownOverride: null,
    effectDescription: "背水の天啓が広がる——持ち点が開始点の半分以下なら確定ドラ+1。",
    unlockDescription: "崖は、半分から始まる。追い詰められるほど、賭けは面白くなる。" },
  { skillLevel: 10, soulCost: 7200, runtimeParams: { maxHands: 3, lastStand: [{ ratio: 0.5, bonus: 1 }, { ratio: 0.25, bonus: 2 }] }, maxChargesOverride: 3, cooldownOverride: null,
    effectDescription: "背水の極み——半分以下で確定ドラ+1、25%以下なら+2。飛び際の一撃が、最強になる。",
    unlockDescription: "極み。紙一重こそ、最高じゃ——脆さがそのまま、伝説の火柱になる。" },
];

// ゼロ・リサーチ（ルクス・ゼロ・lv-zero-search）— 山読み確定型の本設計テーブル（基準帯 Lv1〜5＋超越帯 Lv6〜10）。
// 基準帯＝「確定の完成」: 発動できる局数 maxHands が 1→2、確保候補の提示数 candidateCount が 1→2 へ
// （Lv5＝フリー対戦のルクス・ゼロ＝ZeroSearchAbility 既定値と完全一致：1シャンテンから有効牌トップ2を
//   提示→次のツモで確保・1局1回×1ゲーム2局。山に有効牌が無ければグレーアウト＝読みの材料）。
// 超越帯 Lv6〜10 ＝「能力自身が極まる」型（skill-transcendence-policy＝沼田/栞と同系。相棒 graft はしない）：
//   前半（Lv6〜8）＝読みの網が広がる（候補3→4・局数3）。
//   後半（Lv9〜10）＝**「該当なし」の反転**＝聴牌を確定できる有効牌が山に無い局面でも発動できる
//   “誤差の一打”が解禁される。確定の保証を捨て、山に生きる中で最も手が進む一枚を掴む——
//   グレーアウト（該当なし）という能力UIの仕様そのものが超越で意味を変える。覇道編
//   『運の隣に立つ』（ep19＝Lv9解禁）→『誤差も、悪くない』（ep20＝Lv10完成）とシンクロ。
// runtimeParams の契約（ZeroSearchAbility のコンストラクタと対応）:
//   maxHands / candidateCount / fallbackDraw（Lv9+）/ fallbackCount / doraPreference（誤差の一打の同点タイブレーク）
const ZERO_SEARCH_LEVELS = [
  { skillLevel: 1,  soulCost: 0,    runtimeParams: { maxHands: 1, candidateCount: 1, fallbackDraw: false, fallbackCount: 1, doraPreference: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "1シャンテンで発動、山に生きる有効牌を1つ提示し、次のツモで確保＝聴牌を確定。1ゲーム1局。山に無ければ発動不可（＝出切っている、という読みの情報）。",
    unlockDescription: "習得。山を読み、聴牌への最後の一枚を確定させる——イーシャンテン地獄を断つ芽生え。" },
  { skillLevel: 2,  soulCost: 400,  runtimeParams: { maxHands: 2, candidateCount: 1, fallbackDraw: false, fallbackCount: 1, doraPreference: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "山読み確保（候補1）を1ゲーム2局で使える。",
    unlockDescription: "別の局でも読める（1ゲーム2局）。" },
  { skillLevel: 3,  soulCost: 800,  runtimeParams: { maxHands: 2, candidateCount: 2, fallbackDraw: false, fallbackCount: 1, doraPreference: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "確保候補が2つに——受けの広さを比べて選べる。1ゲーム2局。",
    unlockDescription: "候補が2つ提示される。どちらの聴牌を取るか、選べるようになる。" },
  { skillLevel: 4,  soulCost: 1400, runtimeParams: { maxHands: 2, candidateCount: 2, fallbackDraw: false, fallbackCount: 1, doraPreference: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "候補2×1ゲーム2局。読みの前提となる枚数勘定が体に馴染む。",
    unlockDescription: "河を数える手つきが安定する。読みの精度が据わる。" },
  { skillLevel: 5,  soulCost: 2200, runtimeParams: { maxHands: 2, candidateCount: 2, fallbackDraw: false, fallbackCount: 1, doraPreference: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "ゼロ・リサーチ・完成。候補トップ2×1ゲーム2局（フリー対戦のルクス・ゼロと同等）。",
    unlockDescription: "完成基準。誤差ゼロの山読み——師匠・ルクス・ゼロと同等の確定力。" },
  { skillLevel: 6,  soulCost: 2800, runtimeParams: { maxHands: 2, candidateCount: 3, fallbackDraw: false, fallbackCount: 1, doraPreference: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "確保候補が3つに——読みの網が広がる。1ゲーム2局。",
    unlockDescription: "超越域へ。読みの網が広がり、3本目の道が視える。" },
  { skillLevel: 7,  soulCost: 3600, runtimeParams: { maxHands: 3, candidateCount: 3, fallbackDraw: false, fallbackCount: 1, doraPreference: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "候補3×1ゲーム3局——読める局が増える。",
    unlockDescription: "発動が1ゲーム3局に。地獄を断てる回数が増える。" },
  { skillLevel: 8,  soulCost: 4600, runtimeParams: { maxHands: 3, candidateCount: 4, fallbackDraw: false, fallbackCount: 1, doraPreference: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "確保候補が4つに——山に生きる道を、ほぼ余さず提示する。1ゲーム3局。",
    unlockDescription: "読みの網が完成に近づく。確定できる道は、もう見逃さない。" },
  { skillLevel: 9,  soulCost: 5800, runtimeParams: { maxHands: 3, candidateCount: 4, fallbackDraw: true, fallbackCount: 1, doraPreference: false }, maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "『該当なし』でも発動できる——確定の保証を捨て、山で最も手が進む一枚を掴む“誤差の一打”（候補1）。",
    unlockDescription: "計算が尽きても、卓を降りない。該当なしの先へ踏み出す——誤差の一打、解禁。" },
  { skillLevel: 10, soulCost: 7200, runtimeParams: { maxHands: 3, candidateCount: 4, fallbackDraw: true, fallbackCount: 2, doraPreference: true },  maxChargesOverride: null, cooldownOverride: null,
    effectDescription: "誤差の一打が研ぎ澄まされる——候補2つ・同点ならドラ/赤5を掴む。確定と誤差、両方が武器になる。",
    unlockDescription: "極み。確定できない一枚さえ、選んで掴む——誤差も、悪くない。" },
];

export const SKILL_LEVEL_MASTER = {
  "lv-lucky-draw": LUCKY_DRAW_LEVELS,
  "lv-zero-search": ZERO_SEARCH_LEVELS,
  "lv-muddy-lotus": MUDDY_LOTUS_LEVELS,
  "lv-gamble-bet": GAMBLE_BET_LEVELS,
  "lv-amber-shield": AMBER_SHIELD_LEVELS,
  "lv-iron-guard": IRON_GUARD_LEVELS,
  "lv-model-answer": MODEL_ANSWER_LEVELS,
  "lv-dora-pull": DORA_PULL_LEVELS,
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
