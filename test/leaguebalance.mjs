// 大会オートのバランス回帰（DOM不要・決定論）。
// 狙い（ディレクション）: 育成評価ランクに応じて「要求ランクで安定勝利・超えたら8割超え・未満は苦戦」。
//   T1=C / T2=B / T3=A〜S で“大体安定して勝てる感覚”。ティアが上がるほど傾斜が急（育成が決定的）。
// 本テストは実モジュール（simulateLeagueSection / simAbsentLeaguePt / LEAGUE_SIM / TOURNAMENT_TIER.oppCap /
// paramsFromLv）で大会1本を最後まで回し、評価ランク別の優勝率レンジを固定する。
// ※ main.unitStrengthFor の中核（oppCap 頭打ち・師匠 carry）は薄いので本テスト内に同式を再現する
//   （式を変えるならこのテストも更新する＝仕様の意図を明文化）。
import { simulateLeagueSection, simAbsentLeaguePt } from "../src/autobattle/leagueAutoSim.js";
import { paramsFromLv, PARAM_KEYS, makeRng } from "../src/autobattle/autoBattle.js";
import { TOURNAMENT_TIER } from "../src/data/tournamentMaster.js";
import { RANK_BANDS } from "../src/autobattle/statSystem.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };
const rankMin = (r) => RANK_BANDS.find((b) => b.rank === r).min; // C=51 / B=64 / A=77 / S=90 …

const avg = (p) => PARAM_KEYS.reduce((a, k) => a + (p[k] || 0), 0) / PARAM_KEYS.length;
// 相手強度＝oppLv 由来をティア上限で頭打ち（main.unitStrengthFor と同式）。
const leagueOpp = (lv, tier, rival, seed) =>
  Math.min(avg(paramsFromLv(lv, "league:" + seed)), TOURNAMENT_TIER[tier].oppCap) + (rival ? 3 : 0);

// 大会1本を最後まで回し、弟子の最終順位(0=優勝)を返す（main.js の節ループを忠実移植）。
function runTournament({ deshiStr, oppLv, tier, format, unitsAtTable, matches, rounds, uma, nRivals, rng }) {
  const seats = format === "pair" ? 4 : unitsAtTable;
  const hands = seats * (rounds || 1);
  const units = [{ id: "deshi", strength: deshiStr }];
  for (let j = 0; j < 7; j++) units.push({ id: "o" + j, isRival: j < nRivals, strength: leagueOpp(oppLv, tier, j < nRivals, "o" + j) });
  const fieldAvg = units.reduce((a, u) => a + u.strength, 0) / units.length;
  const totals = {}; units.forEach((u) => (totals[u.id] = 0));
  const others = units.filter((u) => u.id !== "deshi");
  const need = unitsAtTable - 1;
  for (let m = 0; m < matches; m++) {
    let pick;
    if (others.length <= need) pick = others.slice(0, need);
    else { pick = []; for (let k = 0; k < need; k++) pick.push(others[(m * need + k) % others.length]); }
    const seated = [units[0], ...pick];
    const seatedSet = new Set(seated.map((u) => u.id));
    const r = simulateLeagueSection({ units: seated.map((u) => ({ id: u.id, start: 25000, strength: u.strength })), seats, hands, rng });
    const arr = r.standings.map((s) => ({ id: s.id, net: Math.round((s.points - 25000) / 1000) })).sort((a, b) => b.net - a.net);
    arr.forEach((s, i) => (totals[s.id] += s.net + (uma[i] ?? 0)));
    for (const u of units) { if (seatedSet.has(u.id)) continue; totals[u.id] += simAbsentLeaguePt(uma, u.strength, fieldAvg, rng); }
  }
  return Object.keys(totals).sort((a, b) => totals[b] - totals[a]).indexOf("deshi");
}
function winRate(o, N = 4000) {
  let w = 0;
  for (let i = 0; i < N; i++) if (runTournament({ ...o, rng: makeRng("B" + i) }) === 0) w++;
  return Math.round((100 * w) / N);
}
// 弟子の総合強度＝評価ランク値(全パラ同値)＋師匠 carry（ペア/団体のみ・main と同式の概算）。
const deshi = (rankVal, carry = 0) => rankVal + carry;

// 各ティアの代表大会（形式・oppLv・carry は詩玥キャンペーンの実値に概ね沿わせた代表点）。
const CASES = [
  { name: "T1 個人4", tier: 1, oppLv: 4, format: "solo4", unitsAtTable: 4, matches: 3, rounds: 1, uma: [50, 10, -10, -30], nRivals: 1, carry: 0, reqRank: "C" },
  { name: "T2 個人3", tier: 2, oppLv: 9, format: "solo3", unitsAtTable: 3, matches: 4, rounds: 1, uma: [30, 0, -30], nRivals: 2, carry: 0, reqRank: "B" },
  { name: "T3 ペア",  tier: 3, oppLv: 11, format: "pair", unitsAtTable: 2, matches: 5, rounds: 2, uma: [15, -15], nRivals: 3, carry: 7, reqRank: "A" },
];

for (const c of CASES) {
  const reqVal = rankMin(c.reqRank);
  const wReq = winRate({ deshiStr: deshi(reqVal, c.carry), ...c });
  const wS = winRate({ deshiStr: deshi(rankMin("S"), Math.round(c.carry * 1.4)), ...c });
  const wUnder = winRate({ deshiStr: deshi(reqVal - 13, Math.max(0, c.carry - 3)), ...c }); // 1段下
  console.log(`-- ${c.name}（要求${c.reqRank}） 要求=${wReq}% / S=${wS}% / 1段下=${wUnder}%`);
  ok(`${c.name}: 要求ランク${c.reqRank}で安定勝利（約7割・62〜82%）`, wReq >= 62 && wReq <= 82);
  ok(`${c.name}: 要求を大きく超えたS級は8割級（≥78%）`, wS >= 78);
  ok(`${c.name}: 要求ランクは1段下より明確に強い（傾斜あり）`, wReq - wUnder >= 8);
}

// ティアの傾斜：上位ティアほど「1段下との差」が大きい（育成が決定的になる）。
const slope = (c) => winRate({ deshiStr: deshi(rankMin(c.reqRank), c.carry), ...c }) - winRate({ deshiStr: deshi(rankMin(c.reqRank) - 13, Math.max(0, c.carry - 3)), ...c });
ok("T3 の傾斜 ≥ T1 の傾斜（神域ほど育成が効く）", slope(CASES[2]) >= slope(CASES[0]));

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
