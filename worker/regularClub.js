import { AuthorityRoom } from "../src/net/authorityRoom.js";
import { buildSeatedGame } from "../src/net/onlineServer.js";
import { createRegulars, HUMAN_WAIT_MS, selectRegulars, settleRegular } from "./regulars.js";

// The public queue and the cron use the same named Durable Object. Reservations
// are synchronous; a live bot can occupy only one seat across overlapping rooms.
export class RegularClub {
  constructor(storage) {
    this.storage = storage;
    this.sql = storage.sql;
    this.busy = new Set();
    storage.transactionSync(() => {
      this.sql.exec("CREATE TABLE IF NOT EXISTS regulars (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
      this.sql.exec("CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
      this.sql.exec("CREATE TABLE IF NOT EXISTS clock (id INTEGER PRIMARY KEY, tick INTEGER NOT NULL)");
      if (!this.sql.exec("SELECT 1 FROM regulars LIMIT 1").toArray().length) {
        for (const bot of createRegulars()) {
          this.sql.exec("INSERT INTO regulars VALUES (?, ?)", bot.id, JSON.stringify(bot));
        }
      }
    });
  }

  reserve(humans, count, practice = false) {
    if (!count) return [];
    const pool = this.sql.exec("SELECT data FROM regulars").toArray().map(row => JSON.parse(row.data));
    const bots = selectRegulars(pool, humans, count, this.busy, Date.now(), practice);
    for (const bot of bots) this.busy.add(bot.id);
    return bots;
  }

  release(bots) {
    for (const bot of bots) this.busy.delete(bot.id);
  }

  finish(room, bots, firstSeat, humans) {
    const matchId = crypto.randomUUID();
    const now = Date.now();
    const places = room.game.rankings();
    const keys = [...humans, ...bots.map(b => b.id)];
    this.storage.transactionSync(() => {
      const rows = bots.map((b, index) => {
        const bot = JSON.parse(this.sql.exec("SELECT data FROM regulars WHERE id=?", b.id).one().data);
        const player = room.game.players[firstSeat + index];
        const { next, result } = settleRegular(bot, { now, matchId, placement: places.indexOf(player) + 1,
          points: player.points, charId: b.charId, opponents: keys.filter(k => k !== b.id), humanPlayed: room.humanPlayed });
        this.sql.exec("UPDATE regulars SET data=? WHERE id=?", JSON.stringify(next), b.id);
        return result;
      });
      this.sql.exec("INSERT INTO outbox VALUES (?, ?)", matchId, JSON.stringify(rows));
    });
  }

  async tick(host, scheduledTime) {
    // Replayed/late Cron requests must not start extra matches. A five-minute
    // tick also delivers saved results; background matches run at most twice/hour.
    const last = this.sql.exec("SELECT tick FROM clock WHERE id=1").toArray()[0]?.tick ?? 0;
    if (scheduledTime <= last) return;
    this.sql.exec("INSERT OR REPLACE INTO clock VALUES (1, ?)", scheduledTime);
    const practiceDue = () => scheduledTime - (this.sql.exec("SELECT tick FROM clock WHERE id=2").toArray()[0]?.tick ?? 0) >= 30 * 60000;
    if (!practiceDue() || host.waiting.length) return;
    const previousRoom = host.room;
    await new Promise(resolve => setTimeout(resolve, HUMAN_WAIT_MS));
    if (host.waiting.length || previousRoom !== host.room || !practiceDue()) return;
    const bots = this.reserve([], 4, true);
    if (!bots.length) return;
    try {
      this.sql.exec("INSERT OR REPLACE INTO clock VALUES (2, ?)", scheduledTime);
      const { game } = buildSeatedGame(bots.map(b => b.charId));
      const room = new AuthorityRoom(game);
      await room.run();
      this.finish(room, bots, 0, []);
    } finally {
      this.release(bots);
    }
  }

  async flush(env) {
    const batch = this.sql.exec("SELECT id FROM outbox ORDER BY rowid LIMIT 16").toArray();
    for (const { id } of batch) {
      const response = await fetch(env.REGULAR_RESULT_URL + "?match=" + id, {
        method: "POST", headers: { "x-regular-token": env.REGULAR_WRITE_TOKEN,
          Authorization: "Bearer " + env.SUPABASE_ANON_JWT }, redirect: "error",
      });
      if (!response.ok) throw new Error("Regular results delivery failed: HTTP " + response.status);
      this.sql.exec("DELETE FROM outbox WHERE id=?", id);
    }
  }
}
