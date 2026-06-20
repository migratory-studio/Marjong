// 暦（カレンダー）マスタ — docs/shitei-calendar-and-roguelite.md「A. 師弟＝サクセス暦化」。
//
// 既存の dayCount（1ターン＝ゲーム内「ひと月」）に「4月始まりの年度」を被せるレイヤー。
// 進行の背骨はキャンペーン順（mentorCampaignMaster）のまま不可侵で、ここは
// 「どの宝が暦のいつ開催されるか」を計算で与えるだけ（キャラ別の手書き月割りは持たない）。
//
//   dayCount 1 = 1年目4月 / 13 = 2年目4月 / 25 = 3年目4月
//   八宝は **半年周期（年2回）** で開催（tournamentMaster.openBaseMonth と +6ヶ月）。月によって複数が同時開催。
//   九蓮宝燈だけ 3年目4月(dayCount 25)以降の4月・八宝制覇後にアンカー。
//   ※ 大会は「選べる」＝当月開催から自由選択（既得宝も再挑戦可）。実力不足は既存 tournamentGate が門前払い。
import { campaignFor, nextTreasureStep, nextTreasureInfo } from "./mentorCampaignMaster.js";
import { TREASURE_TOURNAMENTS, tournamentById } from "./tournamentMaster.js";

export const MONTHS_PER_YEAR = 12;
export const START_GAME_MONTH = 4; // 4月始まりの年度

// 九蓮宝燈（最終・9個目）は 3年目4月に固定アンカー（八宝制覇後）。
export const KYUUREN_OPEN_DAYCOUNT = 25;

// 季節。節目＝本大会（7/10/1）、最終＝4（九蓮の月）。
const SEASONS = [
  { id: "spring", label: "春", months: [4, 5, 6] },
  { id: "summer", label: "夏", months: [7, 8, 9] },
  { id: "autumn", label: "秋", months: [10, 11, 12] },
  { id: "winter", label: "冬", months: [1, 2, 3] },
];
// 本大会（節目）の月。4は九蓮の月、7/10/1はティア節目の山場。
export const MILESTONE_MONTHS = [4, 7, 10, 1];

// dayCount → 暦情報（年目・月・季節・節目か）。dayCount 1 = 1年目4月。
export function monthInfo(dayCount = 1) {
  const d = Math.max(1, Math.floor(dayCount));
  const idx = (d - 1) % MONTHS_PER_YEAR;                   // 0..11（0=4月）
  const year = Math.floor((d - 1) / MONTHS_PER_YEAR) + 1;  // 1年目..
  const gameMonth = ((idx + (START_GAME_MONTH - 1)) % MONTHS_PER_YEAR) + 1; // 4..12,1..3
  const season = SEASONS.find((s) => s.months.includes(gameMonth)) || SEASONS[0];
  return {
    dayCount: d, year, monthOfYear: idx, gameMonth,
    season: season.id, seasonLabel: season.label,
    isMilestone: MILESTONE_MONTHS.includes(gameMonth),
  };
}

// 表示用ラベル「○年目 ○月（季）」。
export function calendarLabel(dayCount = 1) {
  const m = monthInfo(dayCount);
  return `${m.year}年目 ${m.gameMonth}月（${m.seasonLabel}）`;
}

// 基準月 → 開催する2つの暦月（半年周期＝年2回）。例: 4 → [4, 10]。
export function openMonthsForBase(baseMonth) {
  if (!baseMonth) return [];
  const other = ((baseMonth - 1 + 6) % MONTHS_PER_YEAR) + 1;
  return [baseMonth, other];
}

// 八宝が現在の月に開催中か（gameMonth 一致）。九蓮は別ルート（下記 isKyuurenOpen）。
export function isTreasureOpenAt(t, dayCount) {
  if (!t || t.isFinal) return false;
  return openMonthsForBase(t.openBaseMonth).includes(monthInfo(dayCount).gameMonth);
}

// 九蓮が挑めるか（3年目4月以降の4月・八宝8つ制覇）。
export function isKyuurenOpen(dayCount, wonTreasures = []) {
  const m = monthInfo(dayCount);
  return m.dayCount >= KYUUREN_OPEN_DAYCOUNT && m.gameMonth === 4 && (wonTreasures?.length ?? 0) >= 8;
}

// fromDayCount 以降で、基準月の宝が次に開催される最小 dayCount（半年以内に必ず来る）。
export function nextOpenDayCountForBase(baseMonth, fromDayCount = 1) {
  const from = Math.max(1, Math.floor(fromDayCount));
  const months = openMonthsForBase(baseMonth);
  for (let d = from; d < from + MONTHS_PER_YEAR; d++) {
    if (months.includes(monthInfo(d).gameMonth)) return d;
  }
  return from; // 理論上到達しない
}

// 九蓮が次に挑める dayCount（3年目4月以降の最初の4月。fromDayCount 起点）。
export function nextKyuurenDayCount(fromDayCount = 1) {
  const from = Math.max(Math.floor(fromDayCount), KYUUREN_OPEN_DAYCOUNT);
  for (let d = from; d < from + MONTHS_PER_YEAR + 1; d++) {
    if (monthInfo(d).gameMonth === 4) return d;
  }
  return KYUUREN_OPEN_DAYCOUNT;
}

// 当月に開催中の大会一覧（既得・未得問わず＝選べる）。九蓮は条件を満たすときだけ含む。
// 返り値は TREASURE_TOURNAMENTS の要素配列（呼び出し側で wonTreasures 等から表示を組む）。
export function tournamentsOpenAt(dayCount = 1, wonTreasures = []) {
  const list = TREASURE_TOURNAMENTS.filter((t) => isTreasureOpenAt(t, dayCount));
  const kyuuren = TREASURE_TOURNAMENTS.find((t) => t.isFinal);
  if (kyuuren && isKyuurenOpen(dayCount, wonTreasures)) list.push(kyuuren);
  return list;
}

// 次に挑む宝（目標）の暦スケジュール。nextTreasureStep / nextTreasureInfo（進行の背骨）を
// 暦に接続し、当月開催か・次の開催 dayCount・残り月数を返す。全制覇なら null。
// ※ requireScenario 等のゲートは既存 unlockEvaluator が別途担う（ここは暦の判定のみ）。
export function nextTournamentSchedule(mentorId, wonTreasures = [], dayCount = 1) {
  const step = nextTreasureStep(mentorId, wonTreasures);
  if (!step) return null; // 九蓮まで全制覇
  const t = tournamentById(step.id);
  const day = Math.max(1, Math.floor(dayCount));
  const campaign = campaignFor(mentorId);
  const found = campaign.findIndex((s) => s.id === step.id);
  const index = found < 0 ? (wonTreasures?.length ?? 0) : found;

  let openNow, openDayCount;
  if (t.isFinal) {
    openNow = isKyuurenOpen(day, wonTreasures);
    openDayCount = nextKyuurenDayCount(day);
  } else {
    openNow = isTreasureOpenAt(t, day);
    openDayCount = openNow ? day : nextOpenDayCountForBase(t.openBaseMonth, day);
  }
  return {
    step,
    info: nextTreasureInfo(mentorId, wonTreasures),
    index,
    openNow,
    openDayCount,
    openMonth: monthInfo(openDayCount),
    monthsLeft: Math.max(0, openDayCount - day),
  };
}
