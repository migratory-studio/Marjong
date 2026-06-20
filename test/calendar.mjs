// 暦マスタの回帰テスト — src/data/calendarMaster.js。
//   node test/calendar.mjs
import assert from "node:assert";
import {
  monthInfo, calendarLabel, openMonthsForBase, nextOpenDayCountForBase,
  tournamentsOpenAt, nextTournamentSchedule, isKyuurenOpen, KYUUREN_OPEN_DAYCOUNT,
} from "../src/data/calendarMaster.js";
import { campaignFor } from "../src/data/mentorCampaignMaster.js";

let n = 0;
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };
const ids = (list) => list.map((t) => t.id).sort();

// --- monthInfo（4月始まり）---
eq(monthInfo(1).gameMonth, 4, "d1=4月");
eq(monthInfo(1).year, 1, "d1=1年目");
eq(monthInfo(13).gameMonth, 4, "d13=2年目4月");
eq(monthInfo(25).year, 3, "d25=3年目");
eq(monthInfo(25).gameMonth, 4, "d25=3年目4月");
eq(monthInfo(10).gameMonth, 1, "d10=1月");
ok(monthInfo(1).isMilestone, "4月は節目");
ok(!monthInfo(2).isMilestone, "5月は非節目");

// --- ラベル ---
eq(calendarLabel(1), "1年目 4月（春）", "ラベルd1");
eq(calendarLabel(25), "3年目 4月（春）", "ラベルd25");

// --- 半年周期（年2回）---
eq(openMonthsForBase(4), [4, 10], "base4=4月10月");
eq(openMonthsForBase(11), [11, 5], "base11=11月5月");
eq(nextOpenDayCountForBase(9, 1), 6, "base9(9/3月)の次はd6=9月");

// --- 当月開催の大会一覧 ---
// 1年目4月(d1)＝門前開鍵(4,10)・天暗刻(10,4) が開催中。
eq(ids(tournamentsOpenAt(1, [])), ["menzen-kaiken", "tenankou"], "d1の開催");
// 1年目6月(d3)＝至盃口(6,12)のみ。
eq(ids(tournamentsOpenAt(3, [])), ["ji-peeko"], "d3の開催");
// 九蓮は未制覇では出ない。
ok(!tournamentsOpenAt(25, []).some((t) => t.isFinal), "未制覇なら九蓮は非開催");

// --- 九蓮の開催条件（3年目4月以降の4月・八宝制覇）---
const eightIds = campaignFor("shiyue").map((s) => s.id).filter((id) => id !== "kyuuren-houtou");
ok(isKyuurenOpen(25, eightIds), "d25・八宝制覇で九蓮開催");
ok(!isKyuurenOpen(13, eightIds), "2年目4月では九蓮まだ");
ok(tournamentsOpenAt(25, eightIds).some((t) => t.isFinal), "制覇後d25に九蓮が出る");

// --- 次の目標スケジュール（詩玥）---
const s0 = nextTournamentSchedule("shiyue", [], 1);
eq(s0.index, 0, "初手=第0宝");
ok(s0.openNow, "門前開鍵(4月)はd1で今月挑める");
const s1 = nextTournamentSchedule("shiyue", ["menzen-kaiken"], 1);
eq(s1.index, 1, "2個目=index1（大三剣）");
ok(!s1.openNow, "大三剣(9/3月)はd1では未開催");
eq(s1.openDayCount, 6, "次の開催はd6=9月");
eq(s1.monthsLeft, 5, "d1から5ヶ月後");

// --- 全制覇なら null ---
const allIds = campaignFor("shiyue").map((s) => s.id);
eq(nextTournamentSchedule("shiyue", allIds, 30), null, "全制覇でnull");

console.log(`calendar.mjs OK — ${n} checks passed`);
