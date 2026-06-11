// 大会オート節シミュレータ（leagueAutoSim）の回帰テスト（DOM不要・決定論）。
// 「大一番」構造: 道中の節はオート観戦可＝simulateLeagueSection が手動対局と同じ
// result 形（standings/history/players）を返し、点の総和が保存されることを検証する。
import { simulateLeagueSection, LEAGUE_SIM } from "../src/autobattle/leagueAutoSim.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };
const eq = (label, got, want) => ok(`${label} (got=${JSON.stringify(got)}, want=${JSON.stringify(want)})`, got === want);

// 決定論 rng（mulberry32）。
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mkUnits = (strengths, start = 25000) => strengths.map((s, i) => ({
  id: `u${i}`, name: `ユニット${i}`, color: "#abc", isHuman: i === 0, start, strength: s,
}));

// --- 形と保存則 ---
{
  const units = mkUnits([20, 35, 35, 35]);
  const r = simulateLeagueSection({ units, seats: 4, hands: 4, rng: makeRng(1) });
  eq("standings は卓のユニット数ぶん", r.standings.length, 4);
  ok("standings の形（id/isHuman/points）", r.standings.every((s) => typeof s.id === "string" && typeof s.points === "number"));
  ok("isHuman は弟子ユニットのみ", r.standings.filter((s) => s.isHuman).length === 1 && r.standings[0].isHuman);
  eq("history は 開始＋局数", r.history.length, 5);
  eq("players は units と同数", r.players.length, 4);
  const sum = r.standings.reduce((a, s) => a + s.points, 0);
  eq("点の総和が保存される（素点が破綻しない）", sum, 25000 * 4);
  ok("全ステップに局ラベル", r.steps.every((s) => /^[東南西北]\d局$/.test(s.label)));
}

// --- 決定論（同じ rng シードなら同じ結果） ---
{
  const a = simulateLeagueSection({ units: mkUnits([30, 30, 30, 30]), hands: 8, rng: makeRng(7) });
  const b = simulateLeagueSection({ units: mkUnits([30, 30, 30, 30]), hands: 8, rng: makeRng(7) });
  eq("同シードで同結果", JSON.stringify(a.standings), JSON.stringify(b.standings));
}

// --- ペア卓（2ユニット・4席）と三麻卓（3ユニット） ---
{
  const pair = simulateLeagueSection({ units: mkUnits([30, 40], 50000), seats: 4, hands: 4, rng: makeRng(3) });
  eq("ペア卓: 2ユニットで総和保存", pair.standings.reduce((a, s) => a + s.points, 0), 100000);
  const sanma = simulateLeagueSection({ units: mkUnits([30, 40, 50], 75000), seats: 3, hands: 3, rng: makeRng(4) });
  eq("三麻卓: 3ユニットで総和保存", sanma.standings.reduce((a, s) => a + s.points, 0), 75000 * 3);
  ok("三麻卓のラベルは東1〜東3", sanma.steps.every((s) => /^東[123]局$/.test(s.label)));
}

// --- 強度が効く（統計）: 強いユニットの平均最終点 > 弱いユニット。ただし全勝はしない（運の床） ---
{
  let strongSum = 0, weakSum = 0, weakTopCount = 0;
  const N = 400;
  for (let i = 0; i < N; i++) {
    const r = simulateLeagueSection({ units: mkUnits([12, 60, 36, 36]), hands: 4, rng: makeRng(1000 + i) });
    weakSum += r.standings[0].points;
    strongSum += r.standings[1].points;
    const top = r.standings.slice().sort((a, b) => b.points - a.points)[0];
    if (top.id === "u0") weakTopCount++;
  }
  ok(`強度60の平均 > 強度12の平均 (${Math.round(strongSum / N)} > ${Math.round(weakSum / N)})`, strongSum / N > weakSum / N);
  ok(`パラメ負けでも時々トップを取れる＝運の床 (${weakTopCount}/${N} 回)`, weakTopCount > N * 0.05);
  ok(`だが支配はされない (${weakTopCount}/${N} < 半数)`, weakTopCount < N * 0.5);
}

// --- 大物手しきい値 ---
{
  const r = simulateLeagueSection({ units: mkUnits([50, 50, 50, 50]), hands: 40, rng: makeRng(9) });
  ok("big フラグは bigWin しきい値と一致", r.steps.filter((s) => !s.draw).every((s) => s.big === (s.value >= LEAGUE_SIM.bigWin)));
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
