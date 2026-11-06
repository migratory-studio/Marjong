import { CHARACTERS } from "../src/characters/characters.js";
import { applyMatchToRank, defaultRankState } from "../src/progression/onlineRank.js";

export const PUBLIC_ROOM = "match3";
export const HUMAN_WAIT_MS = 15000;
export const REGULAR_COUNT = 64;
export const PRACTICE_INTERVAL_MS = 15 * 60000;
const MINUTE = 60000;
const playable = CHARACTERS.filter(c => !c.locked).map(c => c.id);
// 完成形を確認したHNだけをシャッフルする。運営名、自由入力、単語の自動連結は使わない。
const handles = [
  "もちペン", "あさつゆ", "はねこ", "ナナイロ", "昼寝部", "青まめ", "雨宿り中", "つむぎ茶",
  "こたつ番", "ほしラムネ", "川辺のいし", "ゆず文庫", "とびうお", "白いごはん", "月のしおり", "たぬきちどり",
  "きなこ月", "しらす丼", "すみれ色", "ぽんず屋", "こむぎ雲", "北窓", "ねこのひげ", "らむねびん",
  "小石メモ", "つばめ便", "まる湯", "夜ふかし椿", "茶々丸", "りんご飴", "海辺ノート", "まどの雪",
  "ふくろう便", "ひなた豆", "そらみつ", "花びら餅", "木かげ", "ほうじ丸", "七草ノート", "あおい栞",
  "月見だんご", "ひつじ雲", "みずたまり", "風待ち鳥", "しおせんべい", "小春びより", "すずめ茶房", "夕なぎ",
  "くるみパン", "こはく糖", "うたたね舟", "なずな色", "さざ波メモ", "朝のミルク", "ねむり猫", "かえで便り",
  "星くずソーダ", "白いマグ", "つきあかり", "森のこみち", "くもり空", "あんず日和", "ひだまり窓", "灯台もと",
];

function shuffle(items) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Return only missing profiles. Persisted identities and results are never regenerated.
export function createRegulars(existing = []) {
  const ids = new Set(existing.map(b => b.id));
  const names = new Set(existing.map(b => b.name));
  const missing = Array.from({ length: REGULAR_COUNT }, (_, i) => i)
    .filter(i => !ids.has("regular-" + (i + 1)));
  const available = shuffle(handles.filter(name => !names.has(name)));
  if (available.length < missing.length) throw new Error("Not enough unique regular handles");
  const chars = shuffle(playable);
  return missing.map((i, index) => ({
    id: "regular-" + (i + 1), name: available[index], oshi: chars[i % chars.length],
    second: chars[(i + 1 + Math.floor(Math.random() * (chars.length - 1))) % chars.length],
    // 夜に厚め、早朝・昼にも重なる活動帯。毎週1〜2日の休みをずらす。
    start: [0, 4, 8, 12, 15, 17, 18, 20][i % 8], off: Math.floor(Math.random() * 7),
    weekend: i % 4 === 0, dailyLimit: 1 + i % 3, cooldown: 35 + Math.floor(Math.random() * 61),
    rank: defaultRankState(), recent: [], games: 0, day: "", played: 0, mixed: 0, last: 0,
  }));
}

export function japanClock(now) {
  const d = new Date(now + 9 * 3600000);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours(), weekday: d.getUTCDay() };
}

export function selectRegulars(pool, humanKeys, count, busy, now, practice = false) {
  const { day, hour, weekday } = japanClock(now);
  const concurrency = hour >= 19 && hour < 24 ? 16 : 8;
  const candidates = shuffle(pool).filter(b => {
    const weekend = weekday === 0 || weekday === 6;
    return !busy.has(b.id) && weekday !== b.off && !(b.weekend && !weekend && weekday % 2 === 1)
      && (hour - b.start + 24) % 24 < 8 && now - b.last >= b.cooldown * MINUTE
      && (b.day !== day || b.played < b.dailyLimit + Number(b.weekend && weekend));
  });
  const limit = Math.min(count, concurrency - busy.size, candidates.length);
  if (practice && limit < 4) return [];
  const keys = [...humanKeys];
  const selected = [];
  while (selected.length < limit) {
    // 直近の3卓で同卓した相手にペナルティ。古い組み合わせから解禁する。
    const repeats = b => b.recent.reduce((sum, group, idx) =>
      sum + keys.filter(k => group.includes(k)).length * (3 - idx), 0);
    candidates.sort((a, b) => repeats(a) - repeats(b) || a.last - b.last);
    const bot = candidates.shift();
    const roll = Math.random();
    const others = playable.filter(id => id !== bot.oshi && id !== bot.second);
    const charId = roll < 0.8 ? bot.oshi : roll < 0.95 ? bot.second : others[Math.floor(Math.random() * others.length)];
    selected.push({ id: bot.id, name: bot.name, dan: bot.rank.dan, oshi: bot.oshi, charId, bot: true });
    keys.push(bot.id);
  }
  return selected;
}

export function settleRegular(bot, { now, matchId, placement, points, charId, opponents, humanPlayed }) {
  const { day } = japanClock(now);
  const mixed = (bot.day === day ? bot.mixed : 0) + Number(humanPlayed);
  const { state, delta } = applyMatchToRank(bot.rank, { placement, numPlayers: 4, finishedAt: now });
  const eligible = humanPlayed && mixed <= 2;
  state.seasonScore = (state.seasonId === bot.rank.seasonId ? bot.rank.seasonScore : 0)
    + (eligible ? Math.max(0, delta) : 0);
  const next = { ...bot, rank: state, games: bot.games + 1, day, mixed, last: now,
    played: (bot.day === day ? bot.played : 0) + 1, recent: [opponents, ...bot.recent].slice(0, 3) };
  const result = { match_id: matchId, bot_id: bot.id, username: bot.name, char_id: charId,
    finished_at: new Date(now).toISOString(), placement, final_points: points, games: next.games,
    human_played: humanPlayed, ranking_eligible: eligible, season_id: state.seasonId,
    season_score: state.seasonScore, dan: state.dan, tier_rp: state.tierRp };
  return { next, result };
}
