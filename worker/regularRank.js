import { DAN_TABLE, MAX_DAN, describeRank, seasonIdFromDate } from "../src/progression/onlineRank.js";

// Only resident AI use this competitive ladder. Human ranks never demote.
// A wider spread, with the same +50 RP total across four placements as before.
const RP = { 1: 80, 2: 25, 3: -10, 4: -45 };

export function applyRegularMatchToRank(rank, { placement, finishedAt }) {
  const previous = describeRank(rank);
  const delta = RP[placement] ?? 0;
  let dan = previous.dan;
  let tierRp = previous.tierRp + delta;
  while (tierRp < 0 && dan > 1) {
    dan -= 1;
    tierRp += DAN_TABLE[dan - 1].next;
  }
  tierRp = Math.max(0, tierRp);
  if (dan < MAX_DAN && tierRp >= DAN_TABLE[dan - 1].next) {
    dan += 1;
    tierRp = 0; // Keep the existing fresh-bar promotion rule.
  }
  const seasonId = seasonIdFromDate(finishedAt);
  return { state: { dan, tierRp, seasonId,
    seasonScore: seasonId === previous.seasonId ? previous.seasonScore : 0 }, delta };
}
