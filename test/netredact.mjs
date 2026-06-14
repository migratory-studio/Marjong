// 通信対戦 L4b の redaction（漏洩防止）テスト。Run: node test/netredact.mjs
//
// 権威＋遠隔席0クライアントをループバックで結線し1ゲーム完走。検証:
//  (1) 漏洩なし: 席0が受け取った全 Event に、他席の配牌/ツモ牌/手牌スナップショットが入っていない。
//      （seed や未ツモの山も、そもそもどの Event にも入っていない。）
//  (2) 整合: クライアントのレプリカが、公開状態(河/面子/リーチ/点数)＋自席手牌＋他席「枚数」で
//      権威と一致。かつ他席手牌は伏せ札(id=null)＝牌の中身を知り得ていない。
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
const meldKey = (melds) =>
  melds.map((m) => m.type + ":" + m.tiles.map((t) => t.id).sort((a, b) => a - b).join(",")).join("|");
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const withTimeout = (p, ms, label) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout: ${label}`)), ms))]);

// JSON 文字列に "seed" キーや、未ツモの山らしき大量タイル配列が紛れていないかの粗い番兵。
function hasForbiddenKey(obj) {
  return JSON.stringify(obj).includes('"seed"') || JSON.stringify(obj).includes('"wall"');
}

async function run(seed) {
  const startIdx = seed % CHARACTERS.length;
  const VIEW = 0;
  const { a: authEp, b: cliEp } = createLoopback();
  const auth = new Game(seatOf(startIdx), -1, seed);
  const room = new AuthorityRoom(auth, { [VIEW]: authEp }, { timeout: 5000 });
  const client = new ClientSession(cliEp, { seat: VIEW, seated: seatOf(startIdx) });

  await withTimeout(room.run(), 30000, `seed ${seed} run`);
  await new Promise((r) => setTimeout(r, 0));

  assert(auth.isGameOver(), `seed ${seed}: game over`);

  // --- (1) 漏洩なし ---
  let leaks = 0;
  for (const msg of client.received) {
    if (hasForbiddenKey(msg)) { leaks++; }
    if (msg.type === "handStarted") {
      if (msg.hands[VIEW] == null) { assert(false, `seed ${seed}: own deal missing`); }
      for (let i = 0; i < 4; i++) {
        if (i !== VIEW && msg.hands[i] != null) { leaks++; }
      }
    }
    if (msg.type === "tileDrawn" && msg.seat !== VIEW) {
      if (msg.tileId != null || msg.kind != null) { leaks++; }
    }
    if (msg.type === "tileDrawn" && msg.seat === VIEW) {
      if (msg.tileId == null) { assert(false, `seed ${seed}: own draw redacted by mistake`); }
    }
    if (msg.type === "abilityUsed" && msg.seat !== VIEW && msg.hand != null) { leaks++; }
  }
  assert(leaks === 0, `seed ${seed}: ${leaks} leak(s) of hidden info to seat ${VIEW}`);

  // --- (2) 整合 ---
  for (let i = 0; i < 4; i++) {
    const ap = auth.players[i], cp = client.replica.players[i];
    assert(eq(ids(ap.discards), ids(cp.discards)), `seed ${seed}: seat ${i} river`);
    assert(meldKey(ap.melds) === meldKey(cp.melds), `seed ${seed}: seat ${i} melds`);
    assert(!!ap.riichi === !!cp.riichi, `seed ${seed}: seat ${i} riichi`);
    assert(ap.points === cp.points, `seed ${seed}: seat ${i} points`);
    assert(ap.hand.length === cp.hand.length, `seed ${seed}: seat ${i} hand-count (${ap.hand.length} vs ${cp.hand.length})`);
    if (i === VIEW) {
      // 自席は実 tile を完全に把握。
      assert(eq(ids(ap.hand).slice().sort((a, b) => a - b), ids(cp.hand).slice().sort((a, b) => a - b)),
        `seed ${seed}: own hand tiles mismatch`);
    } else {
      // 他席は伏せ札のみ＝牌の中身を知り得ていない（セキュリティ性質）。
      assert(cp.hand.every((t) => t.id == null), `seed ${seed}: seat ${i} hand should be face-down`);
    }
  }
  return { received: client.received.length };
}

(async () => {
  let total = 0;
  const SEEDS = [101, 202, 303, 404, 505];
  for (const seed of SEEDS) {
    try { total += (await run(seed)).received; }
    catch (e) { assert(false, `seed ${seed} threw: ${e.message}`); }
  }
  console.log(`  checked ${total} redacted messages delivered to seat 0 across ${SEEDS.length} games`);
  if (failures === 0) console.log("\n✅ netredact (no-leak + redacted-consistency) checks passed");
  else { console.error(`\n❌ ${failures} failure(s)`); process.exit(1); }
  process.exit(0);
})();
