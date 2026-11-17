import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createRegulars, HUMAN_WAIT_MS, PRACTICE_INTERVAL_MS, selectRegulars, settleRegular } from "../worker/regulars.js";
import { RegularClub } from "../worker/regularClub.js";
import { RoomHost, buildSeatedGame } from "../src/net/onlineServer.js";
import { AuthorityRoom } from "../src/net/authorityRoom.js";
import { ClientSession } from "../src/net/clientSession.js";
import { createLoopback } from "../src/net/transport.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";

const now = Date.parse("2026-11-04T14:00:00Z"); // 水曜23時
const pool = createRegulars();
assert.equal(pool.length, 64);
assert.equal(new Set(pool.map(b => b.name)).size, 64);
assert.equal(new Set(pool.map(b => b.id)).size, 64);
assert.equal(HUMAN_WAIT_MS, 15000);
assert.equal(PRACTICE_INTERVAL_MS, 15 * 60000);
for (const b of pool) Object.assign(b, { start: 17, off: 0, weekend: false });
pool[0].recent = [["human:a"]];
const picks = selectRegulars(pool, ["human:a"], 3, new Set([pool[1].id]), now);
assert.equal(picks.length, 3);
assert.ok(picks.every(b => b.id !== pool[0].id && b.id !== pool[1].id));
assert.equal(selectRegulars(pool.slice(0, 3), [], 4, new Set(), now, true).length, 0);
const capped = { ...pool[0], day: "2026-11-04", played: 5 };
assert.equal(selectRegulars([capped], [], 1, new Set(), now).length, 0);
assert.equal(selectRegulars(pool, [], 4, new Set(pool.slice(0, 15).map(b => b.id)), now).length, 1);
assert.equal(selectRegulars(pool, [], 4, new Set(pool.slice(0, 16).map(b => b.id)), now).length, 0);
const daytime = Date.parse("2026-11-04T05:00:00Z"); // 14:00 JST
const daytimePool = pool.map(b => ({ ...b, start: 12 }));
assert.equal(selectRegulars(daytimePool, [], 4, new Set(pool.slice(0, 7).map(b => b.id)), daytime).length, 1);
assert.equal(selectRegulars(daytimePool, [], 4, new Set(pool.slice(0, 8).map(b => b.id)), daytime).length, 0);
assert.equal(selectRegulars([{ ...pool[0], last: now - 34 * 60000, cooldown: 35 }], [], 1, new Set(), now).length, 0);
const result = { now, charId: "shiyue", points: 40000, placement: 1, matchId: "game", opponents: [] };
let bot = pool[0];
for (const [humanPlayed, placement, score] of [[false,1,0],[true,4,0],[true,1,60],[true,1,60]]) {
  bot = settleRegular(bot, { ...result, placement, humanPlayed }).next;
  assert.equal(bot.rank.seasonScore, score);
}
assert.equal(bot.rank.tierRp, 195);
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
// Seed a real pre-expansion SQLite database, including nonzero progress and pending delivery.
db.exec("CREATE TABLE regulars (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE outbox (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE clock (id INTEGER PRIMARY KEY, tick INTEGER NOT NULL)");
const legacy = pool.slice(0, 32).map((b, i) => ({ ...b, games: 20 + i, played: 2,
  day: "2026-11-03", last: now - 86400000, recent: [["human:previous"]],
  rank: { ...b.rank, dan: 3, tierRp: 42, seasonScore: 17 }, extraSavedField: "preserve" }));
for (const b of legacy) db.prepare("INSERT INTO regulars VALUES (?, ?)").run(b.id, JSON.stringify(b));
db.prepare("INSERT INTO outbox VALUES (?, ?)").run("pending-before-expansion", "[]");
db.prepare("INSERT INTO clock VALUES (2, ?)").run(now - 60000);
const beforeRows = db.prepare("SELECT id, data FROM regulars ORDER BY id").all();
const club = new RegularClub(storage);
assert.equal(club.sql.exec("SELECT count(*) AS n FROM regulars").one().n, 64);
for (const row of beforeRows) assert.equal(db.prepare("SELECT data FROM regulars WHERE id=?").get(row.id).data, row.data);
assert.equal(db.prepare("SELECT data FROM outbox WHERE id=?").get("pending-before-expansion").data, "[]");
assert.equal(db.prepare("SELECT tick FROM clock WHERE id=2").get().tick, now - 60000);
const migrated = db.prepare("SELECT data FROM regulars").all().map(row => JSON.parse(row.data));
assert.equal(new Set(migrated.map(b => b.name)).size, 64);
assert.ok(migrated.filter(b => Number(b.id.slice(8)) > 32).every(b => b.games === 0 && b.played === 0));
const afterRows = db.prepare("SELECT id, data FROM regulars ORDER BY id").all();
new RegularClub(storage);
assert.deepEqual(db.prepare("SELECT id, data FROM regulars ORDER BY id").all(), afterRows);
// Remove only this test fixture's pending delivery and schedule, then exercise live room behavior.
db.exec("DELETE FROM outbox; DELETE FROM clock");
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
  const regularSeats = host.room.players.filter(s => s.name && !["a", "b"].includes(s.name));
  assert.equal(regularSeats.length, 2);
  // 常連AIは人間席と同じ形で配る（名前に「（AI）」を付けず、bot フラグも載せない）
  assert.ok(host.room.players.every(s => !("bot" in s) && !String(s.name || "").includes("AI")));
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
    globalThis.fetch = async (_url, init) => {
      assert.equal(init.redirect, "manual"); // supported by workerd; never forward credentials on a redirect
      return new Response(null, { status: 503 });
    };
    await assert.rejects(club.flush({}), /HTTP 503/);
    assert.equal(db.prepare("select count(*) as n from outbox").get().n, 2);
    globalThis.fetch = async () => new Response(null, { status: 204 });
    await new RegularClub(storage).flush({});
    assert.equal(db.prepare("select count(*) as n from outbox").get().n, 0);
  } finally { globalThis.fetch = originalFetch; }
  const originalTimer = globalThis.setTimeout;
  try {
    globalThis.setTimeout = callback => { queueMicrotask(callback); return 0; };
    // A missed window is rechecked next tick. Successful and replayed ticks
    // respect the quarter-hour interval, including after a DO restart.
    await club.tick({ waiting: [{}] }, now);
    await club.tick({ waiting: [] }, now + 5 * 60000);
    const restarted = new RegularClub(storage);
    await restarted.tick({ waiting: [] }, now + 5 * 60000);
    await restarted.tick({ waiting: [] }, now + 10 * 60000);
    assert.equal(db.prepare("select count(*) as n from outbox").get().n, 1);
    await restarted.tick({ waiting: [] }, now + 20 * 60000 - 1);
    assert.equal(db.prepare("select count(*) as n from outbox").get().n, 1);
    await restarted.tick({ waiting: [] }, now + 20 * 60000);
    assert.equal(db.prepare("select count(*) as n from outbox").get().n, 2);
    await new RegularClub(storage).tick({ waiting: [] }, now + 20 * 60000);
    assert.equal(db.prepare("select count(*) as n from outbox").get().n, 2);
  } finally { globalThis.setTimeout = originalTimer; }
} finally { Date.now = realNow; db.close(); }
console.log("regulars: matching, schedules, ranking limits, midnight, season, persistence and delivery OK");
