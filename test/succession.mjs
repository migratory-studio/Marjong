// 修行成果の評価ロジック回帰 — src/progression/successionResult.js。
//   node test/succession.mjs
import assert from "node:assert";
import { avatarRole, evaluateSuccession } from "../src/progression/successionResult.js";

let n = 0;
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

// --- ロール判定（params6 → attacker/blocker/gambler）---
eq(avatarRole({ fire: 50, speed: 40 }), "attacker", "火力速度→攻");
eq(avatarRole({ guard: 60, mental: 50 }), "blocker", "守備メンタル→守");
eq(avatarRole({ gamble: 60 }), "gambler", "勝負勘→博");
// 師匠ロール傾斜（拮抗時に師匠タイプへ寄る）
eq(avatarRole({ fire: 10, guard: 12 }, "attacker"), "attacker", "攻18 vs 守12 → 攻（師匠傾斜込み）");

// --- 評価（クリア月数主体）---
const fast = evaluateSuccession(
  { dayCount: 26, records: { tournamentsWon: 9, treasures: Array(9).fill("x") } },
  { mentorCharacterId: "shiyue", params6: { fire: 80, speed: 70 } });
eq(fast.rank, "役満級", "26ヶ月＝役満級");
eq(fast.role, "attacker", "詩玥×火力→攻");
eq(fast.treasures, 9, "宝9");
eq(fast.wins, 9, "優勝9");

const slow = evaluateSuccession(
  { dayCount: 50, records: {} },
  { mentorCharacterId: "bibi", params6: { guard: 90 } });
eq(slow.rank, "満貫級", "50ヶ月＝満貫級（下限）");
eq(slow.role, "blocker", "ビビ×守備→守");

console.log(`succession.mjs OK — ${n} checks passed`);
