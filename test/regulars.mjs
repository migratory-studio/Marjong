import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createRegulars, selectRegulars, settleRegular } from "../worker/regulars.js";
import { RegularClub } from "../worker/regularClub.js";
import { RoomHost, buildSeatedGame } from "../src/net/onlineServer.js";
import { AuthorityRoom } from "../src/net/authorityRoom.js";
import { ClientSession } from "../src/net/clientSession.js";
import { createLoopback } from "../src/net/transport.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";

const now = Date.parse("2026-11-04T14:00:00Z"); // 水曜23時
const pool = createRegulars();
assert.equal(new Set(pool.map(b => b.name)).size, 32);
for (const b of pool) Object.assign(b, { start: 17, off: 0, weekend: false });
pool[0].recent = [["human:a"]];
const picks = selectRegulars(pool, ["human:a"], 3, new Set([pool[1].id]), now);
assert.equal(picks.length, 3);
assert.ok(picks.every(b => b.id !== pool[0].id && b.id !== pool[1].id));
assert.equal(selectRegulars(pool.slice(0, 3), [], 4, new Set(), now, true).length, 0);
const capped = { ...pool[0], day: "2026-11-04", played: 5 };
assert.equal(selectRegulars([capped], [], 1, new Set(), now).length, 0);
const result = { now, charId: "shiyue", points: 40000, placement: 1, matchId: "game", opponents: [] };
let bot = pool[0];
for (const [humanPlayed, placement, score] of [[false,1,0],[true,4,0],[true,1,60],[true,1,60]]) {
  bot = settleRegular(bot, { ...result, placement, humanPlayed }).next;
  assert.equal(bot.rank.seasonScore, score);
}
assert.equal(bot.rank.tierRp, 150);
bot = settleRegular(bot, { ...result, now: now + 3600000, humanPlayed: true }).next;
assert.equal(bot.rank.seasonScore, 120);
assert.equal(bot.rank.dan, 2);
bot = settleRegular(bot, { ...result, now: Date.parse("2027-01-01T00:01Z"), humanPlayed: false }).next;
assert.equal(bot.rank.seasonScore, 0);

// Exercise the actual SQLite statements, mixed room, AI-only room and outbox retries locally.
const db = new DatabaseSync(":memory:");
const storage = { sql: { exec(query, ...args) {
  const rows = db.prepare(query).all(...args);
  return { toArray: () => rows, one: () => { assert.equal(rows.length, 1); return rows[0]; } };
} }, transactionSync(fn) {
  db.exec("begin");
  try { fn(); db.exec("commit"); } catch (e) { db.exec("rollback"); throw e; }
} };
const club = new RegularClub(storage);
new RegularClub(storage);
assert.equal(club.sql.exec("SELECT count(*) AS n FROM regulars").one().n, 32);
const realNow = Date.now;
Date.now = () => now;
try {
  for (const b of pool) db.prepare("UPDATE regulars SET data=? WHERE id=?").run(JSON.stringify(b), b.id);
  const host = new RoomHost();
  const makeSeated = ids => ids.map(id => {
    const character = CHARACTERS.find(c => c.id === id);
    return { character, abilities: instantiateAbilities(character) };
  });
  const humans = ["a", "b"].map(name => {
    const { a, b } = createLoopback();
    const session = new ClientSession(b, { makeSeated });
    host.handle(a, { regulars: club, matchWaitMs: 20 });
    b.send({ type: "intent.join", charId: "shiyue", name, bot: true });
    return session;
  });
  await new Promise(r => setTimeout(r, 10));
  assert.equal(host.room, null);
  await new Promise(r => setTimeout(r, 120));
  assert.ok(host.room.done && host.room.humanPlayed);
  assert.equal(host.room.players.filter(s => s.bot).length, 2);
  assert.equal(humans.every(s => s.intentCount > 0), true);
  assert.equal(club.busy.size, 0);
  const bots = club.reserve([], 4, true);
  assert.equal(bots.length, 4);
  const { game } = buildSeatedGame(bots.map(b => b.charId));
  const room = new AuthorityRoom(game);
  await room.run();
  club.finish(room, bots, 0, []);
  club.release(bots);
  const batches = db.prepare("SELECT data FROM outbox ORDER BY rowid").all().map(r => JSON.parse(r.data));
  assert.ok(batches[0].every(b => b.ranking_eligible));
  assert.deepEqual(batches[1].map(b => b.placement).sort(), [1,2,3,4]);
  assert.ok(batches[1].every(b => !b.ranking_eligible && b.season_score === 0));
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 503 });
    await assert.rejects(club.flush({}));
    assert.equal(db.prepare("select count(*) as n from outbox").get().n, 2);
    globalThis.fetch = async () => new Response(null, { status: 204 });
    await new RegularClub(storage).flush({});
    assert.equal(db.prepare("select count(*) as n from outbox").get().n, 0);
  } finally { globalThis.fetch = originalFetch; }
} finally { Date.now = realNow; db.close(); }
console.log("regulars: matching, schedules, ranking limits, midnight, season, persistence and delivery OK");
