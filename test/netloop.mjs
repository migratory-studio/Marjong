// 通信対戦 L4a の配線テスト。Run: node test/netloop.mjs
//
// 同一プロセス内でループバック・トランスポートを張り、権威(AuthorityRoom)＋遠隔クライアント
// (ClientSession, 席0)を結線して1ゲーム(東風戦)を最後まで進める。CPU席1-3は権威ローカル、席0は
// クライアントが Intent を返して進む。検証:
//   - ゲームが Intent/Event の往復だけで最後まで進む(=配線が回る)。
//   - クライアントの discard/ack Intent が実際に流れている。
//   - クライアントのレプリカが、権威の「公開状態(河/面子/リーチ/点数/親/局)＋自席の手牌」と一致。
// （L4a は redaction なしなので全公開。自席手牌＋公開のみ照合＝L4b の redaction 後も成立する契約。）
import { Game } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";
import { createLoopback } from "../src/net/transport.js";
import { AuthorityRoom } from "../src/net/authorityRoom.js";
import { ClientSession } from "../src/net/clientSession.js";

let failures = 0;
const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); failures++; } };

function seatOf(startIdx) {
  const seated = [];
  for (let i = 0; i < 4; i++) {
    const c = CHARACTERS[(startIdx + i) % CHARACTERS.length];
    seated.push({ character: c, abilities: instantiateAbilities(c) });
  }
  return seated;
}

const ids = (arr) => arr.map((t) => t.id);
const sortedIds = (arr) => ids(arr).slice().sort((a, b) => a - b);
const meldKey = (melds) =>
  melds.map((m) => m.type + ":" + m.tiles.map((t) => t.id).sort((a, b) => a - b).join(",")).join("|");
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout: ${label}`)), ms)),
  ]);

async function playOne(seed) {
  const startIdx = seed % CHARACTERS.length;
  const { a: authEp, b: cliEp } = createLoopback();
  const auth = new Game(seatOf(startIdx), /*human*/ -1, seed);
  const room = new AuthorityRoom(auth, { 0: authEp }, { timeout: 5000 });
  const client = new ClientSession(cliEp, { seat: 0, seated: seatOf(startIdx) });

  await withTimeout(room.run(), 30000, `seed ${seed} run`);
  await new Promise((r) => setTimeout(r, 0)); // 末尾の配送(microtask)をフラッシュ

  assert(auth.isGameOver(), `seed ${seed}: authority reached game over`);
  assert(room.done, `seed ${seed}: room finished`);
  assert(client.intentCount > 0, `seed ${seed}: client sent discard intents (${client.intentCount})`);

  // 公開状態の一致（全席）。
  for (let i = 0; i < 4; i++) {
    const ap = auth.players[i];
    const cp = client.replica.players[i];
    assert(eq(ids(ap.discards), ids(cp.discards)), `seed ${seed}: seat ${i} river mismatch`);
    assert(meldKey(ap.melds) === meldKey(cp.melds), `seed ${seed}: seat ${i} meld mismatch`);
    assert(!!ap.riichi === !!cp.riichi, `seed ${seed}: seat ${i} riichi mismatch`);
    assert(ap.points === cp.points, `seed ${seed}: seat ${i} points mismatch (${ap.points} vs ${cp.points})`);
  }
  // 自席(0)の手牌一致（クライアントが知ってよい唯一の手牌）。
  assert(
    eq(sortedIds(auth.players[0].hand), sortedIds(client.replica.players[0].hand)),
    `seed ${seed}: own-seat hand mismatch`
  );
  // 公開スカラ。権威は最終 Event 配信「後」に _endHand で親/局を次局用へ進める（次局は来ない）。
  // クライアントは「最後に受け取った Event 時点」の値を持つのが正しいので、最終 Event の pub と
  // 突き合わせる（＝公開スカラを正しく同期できている、の検証）。
  const lastPub = room.recorder.records.filter((r) => r.pub).at(-1).pub;
  assert(client.replica.dealerIndex === lastPub.dealer, `seed ${seed}: dealer sync mismatch`);
  assert(client.replica.kyoku === lastPub.kyoku, `seed ${seed}: kyoku sync mismatch`);
  return { intents: client.intentCount, calls: client.callCount };
}

(async () => {
  let totalIntents = 0, totalCalls = 0;
  const SEEDS = [101, 202, 303, 404, 505];
  for (const seed of SEEDS) {
    try {
      const r = await playOne(seed);
      totalIntents += r.intents; totalCalls += r.calls;
    } catch (e) {
      assert(false, `seed ${seed} threw: ${e.message}`);
    }
  }
  console.log(`  wired ${SEEDS.length} games over loopback — client discard intents=${totalIntents}, call windows=${totalCalls}`);

  if (failures === 0) console.log("\n✅ netloop wiring checks passed");
  else { console.error(`\n❌ ${failures} failure(s)`); process.exit(1); }
  process.exit(0);
})();
