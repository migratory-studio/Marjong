// Verify round/honba progression rules against the engine (no DOM needed).
import { Game } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";

let fails = 0;
const eq = (label, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label} (got=${got}, want=${want})`);
};
const mk = (rounds) => new Game(
  CHARACTERS.slice(0,4).map(c=>({character:c,abilities:instantiateAbilities(c)})),
  -1, 1, { maxRounds: rounds }
);

// --- 東風戦: dealer rotation, label, honba, ending ---
{
  const g = mk(1);
  eq("初期ラベル", g.roundLabel(), "東1局");
  // non-dealer win: 親流れ, honba reset, kyoku++
  g.honba = 2;
  g._endHand(false, 1, false);
  eq("親流れ後ラベル", g.roundLabel(), "東2局");
  eq("親流れ honba reset", g.honba, 0);
  eq("親流れ後 dealer", g.dealerIndex, 1);
  eq("東2局で続行", g.isGameOver(), false);
}

// --- 連荘(dealer win): same kyoku, honba+1 ---
{
  const g = mk(1);
  g._endHand(true, 0, false); // dealer keeps
  eq("連荘ラベル維持", g.roundLabel(), "東1局");
  eq("連荘 honba+1", g.honba, 1);
  eq("連荘 dealer維持", g.dealerIndex, 0);
}

// --- 流局: honba+1; dealer tenpai keeps, else rotates ---
{
  const g = mk(1);
  g._endHand(true, null, true); // draw, dealer tenpai
  eq("流局(親聴牌) honba+1", g.honba, 1);
  eq("流局(親聴牌) 局維持", g.roundLabel(), "東1局");
  g._endHand(false, null, true); // draw, dealer noten
  eq("流局(親ノーテン) honba carry", g.honba, 2);
  eq("流局(親ノーテン) 局進行", g.roundLabel(), "東2局");
}

// --- 東4 -> 東風戦終了 (no 南1) ---
{
  const g = mk(1);
  // advance through 東1..東4 via non-dealer wins
  for (let i = 0; i < 3; i++) g._endHand(false, 1, false); // ->東2,東3,東4
  eq("東4到達", g.roundLabel(), "東4局");
  eq("東4 continues", g.isGameOver(), false);
  g._endHand(false, 1, false); // finish 東4 (no renchan)
  eq("東風戦 東4後に終了", g.isGameOver(), true);
}

// --- 半荘戦: 東4 -> 南1, ends after 南4 ---
{
  const g = mk(2);
  for (let i = 0; i < 4; i++) g._endHand(false, 1, false); // through 東4 into next
  eq("半荘 東4後は南1局", g.roundLabel(), "南1局");
  eq("半荘 南1で続行", g.isGameOver(), false);
  for (let i = 0; i < 3; i++) g._endHand(false, 1, false); // 南2,南3,南4
  eq("半荘 南4到達", g.roundLabel(), "南4局");
  eq("半荘 南4 continues", g.isGameOver(), false);
  g._endHand(false, 1, false); // finish 南4
  eq("半荘 南4後に終了", g.isGameOver(), true);
}

// --- トビ終了 (bust ends immediately, even mid-round) ---
{
  const g = mk(2);
  g.players[2].points = -100;
  g._endHand(false, 1, false);
  eq("トビ即終了", g.isGameOver(), true);
}

console.log(fails === 0 ? "\nALL ROUND TESTS PASSED" : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
