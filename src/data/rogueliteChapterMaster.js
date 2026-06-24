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
//   { id, index, title, subtitle, blurb, aim, cast:[{id,name}], unlock(前章id|null), clearFloor, tone, comingSoon? }
//     unlock=null   … 常時解禁（最初の記憶）。それ以外は unlock の章を踏破済みなら解禁。
//     clearFloor    … この記憶を「踏破した」とみなす到達階（このボス階に届けば次章が解禁され得る）。
//     tone          … 'gold'（群像＝温かさと喪失）/ 'jade' / 'ember' / 'ash'（未綴＝沈黙）。
//     comingSoon    … true なら中身が未定＝常に封（踏破しても開かない。来たる記憶の予告枠）。

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
    clearFloor: 10,
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
    clearFloor: 10,
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
