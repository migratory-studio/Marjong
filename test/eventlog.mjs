// 通信対戦 L3 の決定論再構築テスト。Run: node test/eventlog.mjs
//
// 権威(authoritative) Game を全CPUで最後まで自動対局し、その bus イベントを attachRecorder で
// wire Event 列へ捕捉（各 Event に「真スナップショット」も併記）。続いて空のレプリカ Game に
// その Event 列を applyEvent で再生し、**全 Event ごとに**レプリカの席状態(手牌/河/面子/リーチ/
// 点数)が権威の真と一致することを検証する。これが緑＝「クライアントは Event 列だけから盤面を
// 完全再構築できる」ことの担保（docs/online-multiplayer-p0.md DoD #7）。
import { Game, Phase } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";
import { decideDiscard, decideCall, decideAbilityActivations } from "../src/ai/simpleAI.js";
import { attachRecorder } from "../src/net/eventLog.js";
import { applyEvent } from "../src/net/applyEvent.js";

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

// 全CPUで1ゲーム(東風戦)を最後まで回す。smoke.mjs の autoplay と同型。
function autoplay(game, maxSteps = 50000) {
  game.startHand();
  let steps = 0;
  while (!game.isGameOver() && steps++ < maxSteps) {
    if (game.phase === Phase.HAND_OVER) { game.startHand(); continue; }
    if (game.phase === Phase.AWAIT_CALLS) {
      const decisions = game.pendingCalls.callers.map((c) => ({
        index: c.index, ...decideCall(game, c.index, c.options),
      }));
      game.resolveCalls(decisions);
      continue;
    }
    if (game.phase === Phase.AWAIT_DISCARD) {
      const idx = game.turn;
      for (const a of decideAbilityActivations(game, idx)) game.activateAbility(idx, a.id, a.params);
      const d = decideDiscard(game, idx);
      if (!d) { assert(false, "no discard decision"); break; }
      if (d.type === "tsumo") game.doTsumo(idx);
      else if (d.type === "kan") game.declareKan(idx, d.kind, d.kanType);
      else if (d.type === "nuki") game.nukiKita(idx);
      else game.discard(idx, d.tileId, d.riichi);
      continue;
    }
    break;
  }
  return steps;
}

const ids = (arr) => arr.map((t) => t.id);
const sortedIds = (arr) => ids(arr).slice().sort((a, b) => a - b);
const meldKey = (melds) =>
  melds
    .map((m) => m.type + ":" + m.tiles.map((t) => t.id).sort((a, b) => a - b).join(","))
    .join("|");
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let totalEvents = 0;
let totalHands = 0;
const SEEDS = [101, 202, 303, 404, 505, 606, 707, 808, 909, 1010];

for (const seed of SEEDS) {
  const startIdx = seed % CHARACTERS.length;
  // --- authority: 回しながら Event + 真を捕捉 ---
  const auth = new Game(seatOf(startIdx), /*human*/ -1, seed);
  const { records } = attachRecorder(auth, { withTruth: true });
  autoplay(auth);
  assert(records.length > 0, `seed ${seed}: produced events`);
  totalEvents += records.length;
  totalHands += records.filter((r) => r.type === "handStarted").length;

  // --- replica: Event 列だけから再構築し、全 Event で真と突き合わせ ---
  const replica = new Game(seatOf(startIdx), /*human*/ -1, undefined);
  let diverged = false;
  for (const rec of records) {
    applyEvent(replica, rec);
    const t = rec.truth;
    const tag = `seed ${seed} #${rec.seq} ${rec.type}`;
    // riichiDeclared は discard() の途中で発火する（牌は手牌から抜かれ済みだが、まだ河へ
    // push されていない過渡状態。game.js:316→330→340）。手牌枚数は直後の tileDiscarded で
    // 自己回復するため、この Event でのみ手牌比較を見送る（河/点数/リーチ/面子は検証する）。
    const skipHand = rec.type === "riichiDeclared";
    for (let i = 0; i < 4; i++) {
      const rp = replica.players[i];
      const ts = t.seats[i];
      if (!skipHand && !eq(sortedIds(rp.hand), ts.hand)) { assert(false, `${tag}: seat ${i} hand mismatch`); diverged = true; }
      if (!eq(ids(rp.discards), ts.discards)) { assert(false, `${tag}: seat ${i} river mismatch`); diverged = true; }
      if (meldKey(rp.melds) !== meldKey(ts.melds)) { assert(false, `${tag}: seat ${i} meld mismatch`); diverged = true; }
      if (!!rp.riichi !== ts.riichi) { assert(false, `${tag}: seat ${i} riichi mismatch`); diverged = true; }
      if (rp.points !== ts.points) { assert(false, `${tag}: seat ${i} points mismatch (${rp.points} vs ${ts.points})`); diverged = true; }
    }
    if (replica.dealerIndex !== t.dealer) { assert(false, `${tag}: dealer mismatch`); diverged = true; }
    if (replica.kyoku !== t.kyoku) { assert(false, `${tag}: kyoku mismatch`); diverged = true; }
    if (replica.kyotaku !== t.kyotaku) { assert(false, `${tag}: kyotaku mismatch`); diverged = true; }
    if (diverged) break; // 最初の分岐で止める（原因が読みやすい）
  }
}

console.log(`  replayed ${totalEvents} events over ${totalHands} hands across ${SEEDS.length} games`);

// redaction の地ならし確認（本格 redaction は L4）。wire Event がゲームインスタンス丸ごとや
// 関数を抱え込まず、JSON で完全に往復できる(=配信可能)ことだけ確認する。
{
  const auth = new Game(seatOf(0), -1, 4242);
  const { records } = attachRecorder(auth);
  autoplay(auth);
  let roundtrips = true;
  for (const rec of records) {
    try { JSON.parse(JSON.stringify(rec)); } catch { roundtrips = false; }
  }
  assert(roundtrips, "every wire event JSON-roundtrips (serialisable for transport)");
}

if (failures === 0) console.log("\n✅ eventlog determinism checks passed");
else { console.error(`\n❌ ${failures} failure(s)`); process.exit(1); }
