import assert from "node:assert/strict";
import { applyRegularMatchToRank } from "../worker/regularRank.js";
import { applyMatchToRank, DAN_TABLE } from "../src/progression/onlineRank.js";
const base = { dan: 3, tierRp: 100, seasonId: "2026-Q4", seasonScore: 20 };
const play = (rank, placement, finishedAt = "2026-11-11") => applyRegularMatchToRank(rank, { placement, finishedAt });
for (const [placement, delta] of [[1,80],[2,25],[3,-10],[4,-45]]) {
  const { state, delta: actual } = play(base, placement);
  assert.equal(actual, delta);
  assert.equal(state.tierRp, 100 + delta);
  assert.equal(state.dan, 3);
}
assert.equal(base.tierRp, 100);
assert.deepEqual(play({ ...base, dan: 1, tierRp: 0 }, 4).state, { ...base, dan: 1, tierRp: 0 });
for (let dan = 1; dan < 9; dan++) {
  const need = DAN_TABLE[dan - 1].next;
  assert.equal(play({ ...base, dan, tierRp: need - 81 }, 1).state.dan, dan);
  assert.deepEqual(play({ ...base, dan, tierRp: need - 80 }, 1).state, { ...base, dan: dan + 1, tierRp: 0 });
  assert.deepEqual(play({ ...base, dan: dan + 1, tierRp: 0 }, 4).state, { ...base, dan, tierRp: need - 45 });
  assert.equal(play({ ...base, dan: dan + 1, tierRp: 45 }, 4).state.dan, dan + 1);
}
assert.equal(play({ ...base, dan: 9, tierRp: 10 }, 1).state.tierRp, 90);
assert.deepEqual(play(base, 3, "2027-01-01").state, { ...base, tierRp: 90, seasonId: "2027-Q1", seasonScore: 0 });
assert.deepEqual(play({ ...base, dan: 3, tierRp: 0 }, 4).state, { ...base, dan: 2, tierRp: 255 });
const human = applyMatchToRank({ ...base, tierRp: 0 }, { placement: 4, finishedAt: "2026-11-11" }).state;
assert.equal(human.dan, 3);
assert.equal(human.tierRp, 0);
console.log("regularrank: wider placement spread, every promotion/demotion boundary, floor, ceiling, season and human isolation OK");
