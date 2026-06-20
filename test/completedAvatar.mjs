// 修行完了データの回帰 — src/progression/completedAvatar.js。
//   node test/completedAvatar.mjs
import assert from "node:assert";
import { buildCompletedAvatar, addCompletedAvatar, markGraduated, MAX_COMPLETED_AVATARS } from "../src/progression/completedAvatar.js";

let n = 0;
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const mkAv = (id) => ({
  avatarId: id, name: "弟子" + id, profileText: "", mentorCharacterId: "shiyue",
  skillTemplateId: "tmpl-x", skillLevel: 3, params6: { fire: 50, speed: 40 },
  avatarLevel: 5, avatarHpMax: 12000, bondLevel: 4, presetIds: { icon: "ic" },
});
const result = { role: "attacker", roleLabel: "アタッカー", rank: "役満級", rankIdx: 0, months: 26, treasures: 9, wins: 9 };

// --- build ---
const ca = buildCompletedAvatar(mkAv("a1"), result, "2026-06-21T00:00:00Z");
eq(ca.sourceAvatarId, "a1", "source");
eq(ca.completedAvatarId, "completed-a1", "id");
eq(ca.skillLevel, 3, "能力Lv凍結");
eq(ca.role, "attacker", "ロール");
eq(ca.result.clearMonths, 26, "月数");
eq(ca.result.rank, "役満級", "評価");
ok(!("avatarHpCurrent" in ca), "現在HPは持たない（最大のみ）");

// --- 5枠まで追加 ---
let profile = { completedAvatars: [] };
for (let i = 1; i <= MAX_COMPLETED_AVATARS; i++) {
  const r = addCompletedAvatar(profile, buildCompletedAvatar(mkAv("a" + i), result, ""));
  ok(r.saved, `${i}体目 saved`);
  profile = r.profile;
}
eq(profile.completedAvatars.length, 5, "5枠埋まる");

// --- 6体目＝needsReplace（追加されない）---
const over = addCompletedAvatar(profile, buildCompletedAvatar(mkAv("a6"), result, ""));
ok(!over.saved && over.needsReplace, "満杯はneedsReplace");
eq(over.profile.completedAvatars.length, 5, "満杯時は枠を増やさない");

// --- replaceId 指定で入替 ---
const rep = addCompletedAvatar(profile, buildCompletedAvatar(mkAv("a6"), result, ""), "completed-a3");
ok(rep.saved, "入替saved");
eq(rep.profile.completedAvatars.length, 5, "入替後も5枠");
ok(rep.profile.completedAvatars.some((c) => c.sourceAvatarId === "a6"), "a6が入った");
ok(!rep.profile.completedAvatars.some((c) => c.sourceAvatarId === "a3"), "a3が抜けた");

// --- 同一sourceの再卒業は上書き（枠を増やさない）---
const re = addCompletedAvatar(profile, buildCompletedAvatar(mkAv("a2"), { ...result, rank: "倍満級" }, ""));
ok(re.saved, "再卒業saved");
eq(re.profile.completedAvatars.length, 5, "上書きで枠不変");
eq(re.profile.completedAvatars.find((c) => c.sourceAvatarId === "a2").result.rank, "倍満級", "上書き反映");

// --- markGraduated ---
const gp = markGraduated({ avatars: [{ avatarId: "a1" }, { avatarId: "a2" }] }, "a1");
ok(gp.avatars.find((a) => a.avatarId === "a1").graduated, "a1卒業フラグ");
ok(!gp.avatars.find((a) => a.avatarId === "a2").graduated, "a2は据置");

console.log(`completedAvatar.mjs OK — ${n} checks passed`);
