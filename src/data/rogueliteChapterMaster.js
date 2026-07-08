// 楼光の館・大章（記憶）マスタ — 提案B §3.1「二層構造」の①大シナリオ（選択・解禁ツリー）。
//
// 楼光＝記憶を映す塔。プレイヤーは「どの記憶を登るか」を最初に選ぶ。各大章は固有の縦軸・群像・
// ゴールを持ち、踏破で次の記憶が解禁される（解禁ツリー＝リプレイ性＋メタ通貨の用途にも接続）。
//
// ⚠️ 章立て（ディレクション確定 2026-06-24）:
//   大1章＝「師匠をめぐる群像」一本に集約。弟子(詩玥/凌雲/真守)＋御庭番(姚玖/春嬋)＋今は亡き師匠
//          （先代九蓮宝士＝詩玥の恩師）の物語すべてが、この一つの記憶に入る。
//   大2章＝いまのところ空。内容は未定（comingSoon プレースホルダ＝「未だ綴られぬ記憶」）。
//   ※ シナリオ本文は当面モック。文言は差し替え前提。中身を勝手に増やさない（大2章を埋めない）。
//
// データ形：
//   { id, index, title, subtitle, blurb, aim, cast:[{id,name}], unlock(前章id|null), clearFloor, bossFloors?, tone, tuning?, comingSoon? }
//     unlock=null   … 常時解禁（最初の記憶）。それ以外は unlock の章を踏破済みなら解禁。
//     clearFloor    … この記憶を「踏破した」とみなす到達階（このボス階に届けば次章が解禁され得る）。※大章ごと。
//     bossFloors    … フロア別ボス配役 { floor:[castId|"$mob"] }（無いフロアは cast から決定論ランダム）。
//     tone          … 'gold'（群像＝温かさと喪失）/ 'jade' / 'ember' / 'ash'（未綴＝沈黙）。
//     comingSoon    … true なら中身が未定＝常に封（踏破しても開かない。来たる記憶の予告枠）。
//     tuning?       … 大章ごとの難度オーバーライド（任意）。**書いたノブだけ**グローバル既定(run.js RL_TUNE/定数)を上書き。
//                     未指定の章は全てグローバル既定＝挙動不変。対応キー（run.js tv 参照）：
//                       敵HP: baseEnemyHp / enemyHpSlope / enemyHpCapFloor ／ 敵Lv: enemyLvSlope
//                       被ダメ深度: floorDmgStart / floorDmgSlope / floorDmgKnee / floorDmgAccel
//                       一撃死上限: lethalCapBase / lethalCapFadeStart / lethalCapFadeSlope
//                       与ダメ深度: dealDepthStart / dealDepthSlope ／ 踏破回復: regenFrac
//                     例（殺意高めの記憶）: tuning: { baseEnemyHp: 900, floorDmgSlope: 0.4, lethalCapFadeStart: 30 }
//                     例（やさしい入門の記憶）: tuning: { regenFrac: 0.4, floorDmgStart: 14 }
//                     ※ 章ごとに難度を変えたら、その章のクリア率を CLEARFLOOR=○ node test/roguelite-balance.mjs --clearrate で要確認。
//   tuning.hanTier? … 翻数(点数帯)→被ダメ係数テーブル [[gross,係数],...] も章別に上書き可（未指定=RL_TUNE.hanTier）。
//
// ── 章別オーバーライド（提案：tools/roguelite-designer.html がGUIで生成）。すべて任意・スパース：
//    書いたキーだけ上書き＝未指定は全てグローバル既定（マスタ）にフォールバック＝後方互換。本体は newRun→run.over 経由で参照。
//   floors?       … フロア別上書き { [floorId]: { weight?, baseHands?, pursueMax?, healFrac?, hangoverChance? } }
//                   weight=0 でその章ではそのマスを出さない。drawFloorChoices/handsForType/休息宴会回復が参照。
//   routeCount?   … 進路の選択肢数（未指定=序盤F1-2は2択/以降3択）。
//   bossHpMul?    … ボス階の敵HP倍率（1=既定）。
//   biome?        … 層の出現上書き { weights:{[id]:w}, minBands:{[id]:band}, neutralBase?, neutralFade? }。効果(mods)自体は全章共通。
//   itemPool?     … 配置道具の allowlist（idの配列）。未指定=全種。
//   cardPool?     … 配置カード（ドラフト）の allowlist（idの配列）。未指定=全種＝流派縛りに使える。
//   rarityWeights?… ドラフトのレア度基本重み { common,rare,epic,legendary }（未指定=RARITY_WEIGHTS）。
//   economy?      … 光貨/コスト { coinBase,coinFloorMul,bossMul,namedMul,koAdd,pursueMul, forgeBase,forgeQuad, recruitCost, shopCommon/Rare/Epic/Legendary/Heal/Maxhp }。
//   colorSet?     … 演出カラー { tc?,gold?,ink?,edge?,ember? }。ハブ/章紹介/踏破演出にインライン適用（tone より優先）。
//   tableSizeDist?… 戦闘マスの卓サイズ分布 { battle:{4,3,2}, boss:{4,3} }（相対重み・未指定=既定6:3:1/6:3）。
//                   4=ペア(相棒と2v2)/3=三麻ソロ/2=二麻ソロ。ソロは点負け被ダメ2倍。drawFloorChoices時に rollTableSize が参照。

export const ROGUELITE_CHAPTER_MASTER = [
  {
    id: "mentor",
    index: 1,
    title: "還らぬ師の記憶",
    subtitle: "第一の記憶",
    blurb: "兄弟弟子の詩玥・凌雲・真守、御庭番の姚玖と春嬋。みなを繋いでいたのは、今は亡きひとりの師だった。塔は、その面影のほうから君を試す。",
    aim: "群像の記憶をたどり、塔の奥に眠る師の真実へ。",
    cast: [
      { id: "shiyue", name: "詩玥" }, { id: "kuidoshi", name: "凌雲" }, { id: "mamori", name: "真守" },
      { id: "yao_chu", name: "姚玖" }, { id: "chun_chan", name: "春嬋" },
    ],
    unlock: null,
    // 踏破階＝F30（ディレクション確定 2026-06-26）。周回案：1周＝数滴のドリップで、F10/F20/F30 の
    // 3ボスに群像を段階配置し、F30 の主を退けて「第一の記憶を読み切った」＝踏破とする。10だと1ボスで薄い。
    // ※ 踏破は到達ゲートでなく演出＝難易度で物語を塞がない(P8)。到達できなくても周回で記憶は積もる。
    clearFloor: 30,
    // フロア別ボス配役（2026-06-26 確定）。塔を登るほど核心へ近づく群像の段階：
    //   F10＝真守＋ネームドモブ（門番）／F20＝詩玥・凌雲（兄弟弟子）／F30＝姚玖・春嬋（御庭番＝締め）。
    //   "$mob" は1枠をネームドモブで埋めるサイン. 配役キャラが編成中なら自動でモブに退避（run.js）。
    //   ここに無い深層のボス階（F40+）は cast から決定論ランダム（bossPool フォールバック）。
    bossFloors: {
      10: ["mamori", "$mob"],
      20: ["shiyue", "kuidoshi"],
      30: ["yao_chu", "chun_chan"],
    },
    // 卓サイズ分布（戦闘マス）。この記憶は二麻ソロをやや多めに（4麻6:3麻3:2麻4）＝師との一騎打ち感を増やす。
    tableSizeDist: {
      battle: { 2: 4, 3: 3, 4: 6 },
    },
    tone: "gold",
  },
  {
    id: "memory_two",
    index: 2,
    title: "？？？",
    subtitle: "第二の記憶",
    blurb: "まだ、ここには何も刻まれていない。やがて新たな記憶が、この塔に綴られる。",
    aim: "",
    cast: [],
    unlock: "mentor",
    // ── 難易度はディレクション確定（2026-07-08初版→2026-07-09 新シム[追撃モーダル追随 8c60084]で再校正）。
    //    中身（cast/bossFloors/物語）は引き続き未定＝埋めない。
    //    設計意図・実測データ・再検証手順は docs/roguelite-ch2-difficulty-design.md が正典。
    //    形：被ダメ深度はF1〜25ほぼ大1章並み、F28から二次加速＋F27から一撃死上限フェード。
    //    ただし新シム校正の主役は深度倍率でなく「安手の削り」(hanTier底上げ)＋踏破回復の絞り(regen 0.20)。
    //    追撃仕様下では“痛くする→続行を控える→総被弾減”の相殺で深度倍率単独は壁にならない
    //    （docs/roguelite-balance-recalibration-2026-07.md §3-4 実証）。
    //    実測（中堅greedy・N=800）：大1章F30=96.4%に対し 無宝珠78.5%／宝珠若干+4.3pt／フル+9.1pt。
    //    再検証: CHAPTER=memory_two CLEARFLOOR=40 CLUSTERCAP=1 node test/roguelite-balance.mjs --clearrate
    clearFloor: 40,
    tuning: {
      enemyHpCapFloor: 40,      // 敵HPの頭打ちをF30→F40へ（最後の帯まで育ち続ける）
      enemyLvSlope: 0.65,       // 敵Lvの立ち上がりを僅かに前倒し（Lv10到達 F16→F15）
      floorDmgSlope: 0.28,      // 線形被ダメ 0.25→0.28（F30時点では既定比+19%に収まる＝序中盤は据え置き感）
      floorDmgKnee: 28,         // 二次加速をF40→F28から＝踏破階の手前に壁を立てる
      floorDmgAccel: 0.14,      // F40で被ダメ約×30（安手でも受け切れない終盤。cap未満の削りを実効化する係数）
      lethalCapFadeStart: 27,   // 一撃死上限フェードをF40→F27から（守流派の上限も同レバーで開く）
      lethalCapFadeSlope: 0.04, // F30で上限0.67・F38で1.0＝終盤は跳満直撃が本当に怖い
      regenFrac: 0.20,          // 踏破回復 0.32→0.20＝削りが蓄積する（新シム校正の主レバー1）
      // 点数帯→被ダメ係数の章上書き（主レバー2）：安手〜満貫を重く（0.45→0.70帯）＝一撃死上限に
      // 張り付かない「チップダメージ」が深度倍率と掛かって終盤にだけ効く。跳満以上も僅かに増。
      hanTier: [[2000, 0.70], [3900, 0.80], [5200, 0.85], [7700, 0.95], [8000, 1.05], [12000, 1.45], [16000, 1.75], [24000, 2.1], [32000, 2.4]],
    },
    bossHpMul: 1.5, // ボスの持久力＝節目の手応え（F10/20/30/40）
    tone: "ash",
    comingSoon: true, // 中身が空＝常に封（予告枠。踏破では開かない）
  },
];

export function chapterById(id) {
  return ROGUELITE_CHAPTER_MASTER.find((c) => c.id === id) || null;
}

// 常時解禁の最初の章（unlock===null かつ comingSoon でない先頭）。
export function firstChapterId() {
  return (ROGUELITE_CHAPTER_MASTER.find((c) => c.unlock == null && !c.comingSoon) || ROGUELITE_CHAPTER_MASTER[0])?.id || null;
}

// この章が解禁済みか。comingSoon（未綴）は常に false。それ以外は
//   ・前提章を踏破している（unlock=null は常時）
//   ・または宝珠で先行解禁済み（orbUnlockedIds に含む＝提案D・別ルート）
// のいずれかで true。
export function isChapterUnlocked(chapter, clearedIds, orbUnlockedIds) {
  if (!chapter || chapter.comingSoon) return false;
  if (chapter.unlock == null) return true;
  if (Array.isArray(orbUnlockedIds) && orbUnlockedIds.includes(chapter.id)) return true; // 宝珠で解いた
  return Array.isArray(clearedIds) && clearedIds.includes(chapter.unlock);
}

// 宝珠で「いま」解禁できるか（提案D・別ルート）。まだ封じていて・予告枠でなく・値が付いていて・所持宝珠が足りる。
export function canOrbUnlock(chapter, clearedIds, orbUnlockedIds, orbs = 0) {
  if (!chapter || chapter.comingSoon) return false;            // 空（未綴）の章は宝珠でも開けない
  if (!(chapter.orbUnlockCost > 0)) return false;              // 値付けのない章は対象外
  if (isChapterUnlocked(chapter, clearedIds, orbUnlockedIds)) return false; // 既に開いている
  return (Number(orbs) || 0) >= chapter.orbUnlockCost;
}

// この章を踏破したとき「新たに開く」中身のある次章（unlock===chapId かつ comingSoon でない）。
// 無ければ null＝踏破演出では「やがて綴られる」予告に留める（空の予告枠を解禁済みと偽らない）。
export function nextChapterAfter(chapId) {
  if (!chapId) return null;
  return ROGUELITE_CHAPTER_MASTER.find((c) => c.unlock === chapId && !c.comingSoon) || null;
}

// 解禁状態つきの章一覧（UI 用）。各章に { ...chapter, unlocked, cleared, orbUnlocked } を付与。
export function chaptersWithState(clearedIds, orbUnlockedIds) {
  const cleared = Array.isArray(clearedIds) ? clearedIds : [];
  const orbUnlocked = Array.isArray(orbUnlockedIds) ? orbUnlockedIds : [];
  return ROGUELITE_CHAPTER_MASTER.map((c) => ({
    ...c,
    unlocked: isChapterUnlocked(c, cleared, orbUnlocked),
    cleared: cleared.includes(c.id),
    orbUnlocked: orbUnlocked.includes(c.id),
  }));
}
