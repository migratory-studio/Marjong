// オンライン段位ロジックのテスト。Run: node test/onlinerank.mjs
//
// 検証: 段位テーブルの整合 / ΔRP / 昇段 / 降格しない(下限0) / シーズン跨ぎで段位不可侵・seasonScore リセット /
// 増分適用と再計算(fold)の一致 / シーズンID(クオーター)境界。
import {
  DAN_TABLE, MAX_DAN, deltaRp, defaultRankState, applyMatchToRank,
  computeRankFromResults, seasonIdFromDate, describeRank,
} from "../src/progression/onlineRank.js";

let failures = 0;
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); failures++; } };
const eq = (a, b, m) => assert(a === b, `${m} (got ${a}, want ${b})`);

// --- 段位テーブルの整合 ---
eq(DAN_TABLE.length, 9, "9段位");
eq(MAX_DAN, 9, "MAX_DAN=9");
DAN_TABLE.forEach((r, i) => eq(r.dan, i + 1, `dan連番 #${i}`));
eq(DAN_TABLE[8].next, null, "最高位(宝士)は next=null");
assert(DAN_TABLE.slice(0, 8).every((r) => r.next > 0), "中間段位は next>0");
assert(DAN_TABLE.every((r) => !/[一二三四五六七八九十0-9]/.test(r.title)), "称号に数字を混ぜない");
// 閾値は単調増加（上ほど長い登り）
for (let i = 1; i < 8; i++) assert(DAN_TABLE[i].next > DAN_TABLE[i - 1].next, `閾値単調増加 #${i}`);

// --- ΔRP ---
eq(deltaRp(1, 4), 60, "4人1位");
eq(deltaRp(2, 4), 20, "4人2位");
eq(deltaRp(3, 4), 0, "4人3位");
eq(deltaRp(4, 4), -30, "4人4位");
eq(deltaRp(1, 3), 50, "3人1位");
eq(deltaRp(3, 3), -30, "3人3位");

const ymd = (s) => s; // ISO そのまま

// --- 昇段（1位を重ねるとバー満タンで段位2へ・tierRpは0から再スタート） ---
{
  let st = defaultRankState();
  let promoted = null;
  for (let i = 0; i < 4; i++) { // 60×4=240 ≥ 200
    const r = applyMatchToRank(st, { placement: 1, numPlayers: 4, finishedAt: "2026-05-01T00:00:00Z" });
    st = r.state; if (r.promotedTo) promoted = r.promotedTo;
  }
  eq(st.dan, 2, "4連続1位で段位2へ昇段");
  eq(promoted, 2, "promotedTo=2 を通知");
  eq(st.tierRp, 0, "昇段時 tierRp は0から再スタート（持ち越さない）");
}

// --- 降格しない（下限0）：段位1・RP0 で4位を引いても段位/ RP は据え置き ---
{
  let st = defaultRankState();
  const r = applyMatchToRank(st, { placement: 4, numPlayers: 4, finishedAt: "2026-05-01T00:00:00Z" });
  eq(r.state.dan, 1, "4位でも段位は下がらない");
  eq(r.state.tierRp, 0, "tierRp は0で止まる（マイナスにしない）");
  eq(r.delta, -30, "delta は素の-30を返す（記録用）");
}

// --- 段位は永続：高段位で連敗しても絶対に下がらない ---
{
  let st = { dan: 5, tierRp: 10, seasonId: "2026-Q2", seasonScore: 0 };
  for (let i = 0; i < 20; i++) st = applyMatchToRank(st, { placement: 4, numPlayers: 4, finishedAt: "2026-05-02T00:00:00Z" }).state;
  eq(st.dan, 5, "連敗20回でも段位5を維持（降格なし）");
  eq(st.tierRp, 0, "tierRp は0床");
}

// --- シーズン跨ぎ：段位/tierRp は不可侵、seasonScore はリセットして当局ぶんから ---
{
  let st = { dan: 4, tierRp: 120, seasonId: "2026-Q1", seasonScore: 999 };
  const r = applyMatchToRank(st, { placement: 1, numPlayers: 4, finishedAt: "2026-04-01T00:00:00Z" }); // Q2
  eq(r.state.seasonId, "2026-Q2", "シーズンが Q2 へ更新");
  eq(r.state.seasonScore, 60, "seasonScore は新季で0からスタート→+60");
  eq(r.state.dan, 4, "シーズン跨ぎでも段位は不可侵");
  eq(r.state.tierRp, 180, "tierRp も季リセットの影響を受けない(120+60)");
}

// --- seasonScore は活動量（負の局は0扱いで足す＝回数が効く） ---
{
  let st = { dan: 3, tierRp: 100, seasonId: "2026-Q2", seasonScore: 0 };
  st = applyMatchToRank(st, { placement: 4, numPlayers: 4, finishedAt: "2026-05-01T00:00:00Z" }).state; // -30 → score +0
  eq(st.seasonScore, 0, "負け局は seasonScore に max(0,Δ)=0");
  st = applyMatchToRank(st, { placement: 2, numPlayers: 4, finishedAt: "2026-05-01T00:00:00Z" }).state; // +20
  eq(st.seasonScore, 20, "勝ち局で seasonScore +20");
}

// --- 増分適用 == 対局列からの再計算（fold） ---
{
  const results = [
    { placement: 1, numPlayers: 4, finishedAt: "2026-04-10T00:00:00Z" },
    { placement: 3, numPlayers: 4, finishedAt: "2026-04-11T00:00:00Z" },
    { placement: 1, numPlayers: 4, finishedAt: "2026-04-12T00:00:00Z" },
    { placement: 4, numPlayers: 4, finishedAt: "2026-04-13T00:00:00Z" },
    { placement: 2, numPlayers: 4, finishedAt: "2026-04-14T00:00:00Z" },
    { placement: 1, numPlayers: 4, finishedAt: "2026-07-01T00:00:00Z" }, // Q3
  ];
  // 増分
  let inc = defaultRankState();
  for (const r of results) inc = applyMatchToRank(inc, r).state;
  // 再計算
  const folded = computeRankFromResults(results);
  eq(JSON.stringify(folded), JSON.stringify(inc), "increment == fold");
  // 並びが乱れていても finishedAt 昇順で同じ結果
  const shuffled = [results[3], results[0], results[5], results[2], results[1], results[4]];
  eq(JSON.stringify(computeRankFromResults(shuffled)), JSON.stringify(folded), "fold は順不同入力でも安定");
}

// --- シーズンID（クオーター境界・UTC） ---
eq(seasonIdFromDate("2026-01-15T00:00:00Z"), "2026-Q1", "1月=Q1");
eq(seasonIdFromDate("2026-03-31T23:59:59Z"), "2026-Q1", "3月末=Q1");
eq(seasonIdFromDate("2026-04-01T00:00:00Z"), "2026-Q2", "4月=Q2");
eq(seasonIdFromDate("2026-06-30T00:00:00Z"), "2026-Q2", "6月=Q2");
eq(seasonIdFromDate("2026-07-01T00:00:00Z"), "2026-Q3", "7月=Q3");
eq(seasonIdFromDate("2026-12-01T00:00:00Z"), "2026-Q4", "12月=Q4");

// --- describeRank ---
{
  const d = describeRank({ dan: 1, tierRp: 100, seasonId: "2026-Q2", seasonScore: 40 });
  eq(d.title, "萌芽", "段位1の称号");
  eq(d.next, 200, "段位1の next");
  eq(d.progressPct, 50, "進捗 100/200=50%");
  eq(d.atMax, false, "段位1は最高位でない");
  const top = describeRank({ dan: 9, tierRp: 5000, seasonId: "2026-Q2", seasonScore: 0 });
  eq(top.title, "宝士", "段位9の称号");
  eq(top.atMax, true, "段位9は最高位");
  eq(top.progressPct, 100, "最高位は進捗100%");
}

if (failures === 0) console.log("\n✅ onlinerank (段位/RP/シーズン/降格なし/fold一致) checks passed");
else { console.error(`\n❌ ${failures} failure(s)`); process.exit(1); }
