// 通信対戦 Intent 検証テスト（改造クライアント対策）。Run: node test/netvalidate.mjs
//
// 権威は「自分が awaitDiscard / awaitCalls で提示した選択肢」以外を受け付けないことを検証する：
//  (1) 手番: 提示していないカン/ツモ/リーチ・手牌に無い牌・強制ツモ切り中の手出しは不正。
//  (2) 鳴き: 提示していないロン/ポン/カン・提示外のチー形・壊れた meta は不正。パス/action 無しは可。
//  (3) 能力パラメータ: UI が使う4種だけを型・範囲つきで通す（"__proto__" 等は落ちる）。
//  (4) join 申告: 名前の長さ・制御文字、段位の範囲、未知キャラIDを整える。
//  (5) 実卓: 不正なカン・壊れたチー・null フレームで卓が落ちない／不正 Intent は持ち時間を延ばさない。
//  (6) 1接続1席: 同じ接続の多重 join で卓を埋められない。rejoin の token "__proto__" で落ちない。
//  (7) JaneDoe: 対象が整数の席番号でなければ失敗（Array.prototype を汚さない）。
//  (8) 強制ツモ切り中に鳴いた直後（ツモ牌なし）は自由打牌を受け付ける（以前は tileId:null で空回り）。
//  (9) 安全網: エンジンに受理されない決定が来ても、同じ反復で CPU の手に置き換えて進める。
import { AuthorityRoom, turnDecisionFrom, callDecisionFrom, abilityParamsFrom } from "../src/net/authorityRoom.js";
import { RoomHost, buildSeatedGame, joinInfoFrom } from "../src/net/onlineServer.js";
import { createLoopback } from "../src/net/transport.js";
import { JaneDoeAbility } from "../src/abilities/builtins/janeDoeAbility.js";

let failures = 0;
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); failures++; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const uncaught = [];
process.on("uncaughtException", (e) => uncaught.push(e));

// --- (1) 手番 ---
{
  const tile = (id, kind) => ({ id, kind });
  const player = { hand: [tile(1, 0), tile(2, 5), tile(3, 9)], drawnTileId: 3, riichi: false };
  const opts = { tsumo: false, riichi: true, riichiDiscards: [5], kans: [{ type: "ankan", kind: 9 }], nuki: false, forcedTsumogiri: false };
  assert(turnDecisionFrom({ tileId: 1 }, opts, player)?.tileId === 1, "手牌の牌は切れる");
  assert(turnDecisionFrom({ tileId: 99 }, opts, player) === null, "手牌に無い牌は不正");
  assert(turnDecisionFrom({ tileId: "1" }, opts, player) === null, "tileId は整数のみ");
  assert(turnDecisionFrom({ tileId: 2, riichi: true }, opts, player)?.riichi === true, "提示されたリーチ打牌は可");
  assert(turnDecisionFrom({ tileId: 1, riichi: true }, opts, player) === null, "聴牌を崩すリーチ打牌は不正");
  assert(turnDecisionFrom({ tileId: 2, riichi: true }, { ...opts, riichi: false }, player) === null, "リーチ不可の局面でリーチは不正");
  assert(turnDecisionFrom({ action: "tsumo" }, opts, player) === null, "ツモ和了が提示されていなければ不正");
  assert(turnDecisionFrom({ action: "tsumo" }, { ...opts, tsumo: true }, player)?.type === "tsumo", "提示されたツモは可");
  assert(turnDecisionFrom({ action: "kan", kind: 9, kanType: "ankan" }, opts, player)?.kind === 9, "提示されたカンは可");
  assert(turnDecisionFrom({ action: "kan", kind: 0, kanType: "ankan" }, opts, player) === null, "提示外のカンは不正");
  assert(turnDecisionFrom({ action: "kan", kind: 9, kanType: "shouminkan" }, opts, player) === null, "カン種の取り違えは不正");
  assert(turnDecisionFrom({ action: "nuki" }, opts, player) === null, "北抜き不可なら不正");
  assert(turnDecisionFrom({ action: "explode" }, opts, player) === null, "未知の action は不正");
  const forced = { ...opts, forcedTsumogiri: true, riichi: false };
  assert(turnDecisionFrom({ tileId: 1 }, forced, player) === null, "強制ツモ切り中の手出しは不正");
  assert(turnDecisionFrom({ tileId: 3 }, forced, player)?.tileId === 3, "強制ツモ切り中のツモ切りは可");
  assert(turnDecisionFrom({ tileId: 1 }, opts, { ...player, riichi: true }) === null, "リーチ後の手出しは不正");
}

// --- (2) 鳴き ---
{
  const o = { ron: false, pon: true, kan: false, chi: [[1, 2]] };
  assert(callDecisionFrom({ action: "pass" }, o)?.action === "pass", "パスは可");
  assert(callDecisionFrom({}, o)?.action === "pass", "action 無しはパス扱い");
  assert(callDecisionFrom({ action: "pon" }, o)?.action === "pon", "提示されたポンは可");
  assert(callDecisionFrom({ action: "ron" }, o) === null, "提示されていないロンは不正（フリテン等の回避を防ぐ）");
  assert(callDecisionFrom({ action: "kan" }, o) === null, "提示されていない明槓は不正");
  assert(callDecisionFrom({ action: "chi", meta: [1, 2] }, o)?.meta.join() === "1,2", "提示されたチー形は可");
  assert(callDecisionFrom({ action: "chi", meta: [3, 4] }, o) === null, "提示外のチー形は不正");
  assert(callDecisionFrom({ action: "chi", meta: 5 }, o) === null, "壊れた meta は不正");
  assert(callDecisionFrom({ action: "chi", meta: [1, 2, 3, 4] }, o) === null, "長すぎる meta は不正");
}

// --- (3) 能力パラメータ ---
{
  const game = { players: [{}, {}, {}, {}] };
  const p = abilityParamsFrom({ targetIndex: 2, riverTileId: 40, targetKind: 7, betAmount: 1000, evil: "x" }, game);
  assert(p.targetIndex === 2 && p.riverTileId === 40 && p.targetKind === 7 && p.betAmount === 1000 && !("evil" in p), "既知4種だけを通す");
  assert(!("targetIndex" in abilityParamsFrom({ targetIndex: "__proto__" }, game)), "席番号は整数のみ");
  assert(!("targetIndex" in abilityParamsFrom({ targetIndex: 4 }, game)), "席番号は範囲内のみ");
  assert(!("targetKind" in abilityParamsFrom({ targetKind: 34 }, game)), "牌種は 0..33");
  assert(Object.keys(abilityParamsFrom(null, game)).length === 0, "params 無しは空");
}

// --- (4) join 申告 ---
{
  const j = joinInfoFrom({ charId: "nope", name: "\u202Eab\u0000c" + "x".repeat(100), dan: "99", oshi: { a: 1 }, introGate: "yes" });
  assert(j.charId === null, "未知キャラIDは null（卓組みで既定キャラへ）");
  assert(j.name.startsWith("abc") && Array.from(j.name).length === 16, "名前は制御文字を落として16字まで");
  assert(j.dan === 9, "段位は 1..9 に丸める");
  assert(j.oshi === null, "推しは既知キャラIDのみ");
  assert(j.introGate === false, "introGate は true のときだけ");
  assert(joinInfoFrom({ charId: "shiyue", name: "  ", dan: "abc" }).name === null, "空白だけの名前は null");
  assert(joinInfoFrom({ dan: "abc" }).dan === null, "数でない段位は null");
}

// --- (5) 実卓：改造クライアントでも卓が落ちない ---
async function playAs(handler, ms) {
  const { game } = buildSeatedGame(["shiyue"]);
  const { a: client, b: server } = createLoopback();
  const room = new AuthorityRoom(game, { 0: server }, { timeout: 300 });
  let crashed = null;
  const log = [];
  client.onMessage((msg) => {
    log.push(msg);
    if (msg.type === "handWon" || msg.type === "handDrawn") client.send({ type: "intent.ack" });
    handler(msg, (m) => client.send(m), game);
  });
  const run = room.run().catch((e) => { crashed = e; });
  await Promise.race([run, wait(ms)]);
  room.done = true;
  return { crashed, log, room };
}
{
  uncaught.length = 0;
  let sentAt = 0;
  const { crashed, log } = await playAs((msg, send, g) => {
    if (msg.type !== "evt.awaitDiscard" || sentAt) return;
    sentAt = Date.now();
    send(null);
    send({ type: "intent.discard", action: "kan", kind: 0, kanType: "shouminkan" });
    const kind = g.players[0].counts().findIndex((n) => n === 1);
    send({ type: "intent.discard", action: "kan", kind, kanType: "ankan" });
    send({ type: "intent.discard", tileId: g.players[0].hand[0].id, riichi: true });
    send({ type: "intent.ability", abilityId: "no-such-ability" });
  }, 900);
  assert(!crashed, `不正なカン等で卓が落ちない (${crashed?.message})`);
  assert(uncaught.length === 0, `null フレームで例外が漏れない (${uncaught[0]?.message})`);
  const auto = log.find((m) => m.type === "evt.autoOn");
  assert(auto, "不正 Intent しか来ない手番は持ち時間切れで代打ちへ（無視されている）");
  assert(!log.some((m) => m.type === "meldCalled" && m.seat === 0 && log.indexOf(m) < log.indexOf(auto)), "代打ち前に席0の面子は作られない");
  assert(!log.some((m) => m.type === "riichiDeclared" && m.seat === 0 && log.indexOf(m) < log.indexOf(auto)), "代打ち前に不正リーチは通らない");
}
{
  let calls = 0;
  const { crashed } = await playAs((msg, send, g) => {
    if (msg.type === "evt.awaitDiscard") { const p = g.players[0]; send({ type: "intent.discard", tileId: p.drawnTileId ?? p.hand.at(-1).id }); }
    if (msg.type === "evt.awaitCalls") { calls++; send({ type: "intent.call", action: "chi", meta: 5 }); send({ type: "intent.call", action: "ron" }); }
  }, 2500);
  assert(!crashed, `壊れたチー/提示外ロンで卓が落ちない (${crashed?.message})`);
  if (!calls) console.warn("note: この配牌では鳴き窓が来なかった（鳴きの検証は (2) の単体で担保）");
}
{
  let own = 0;
  const { crashed, room } = await playAs((msg, send, g) => {
    if (msg.type === "evt.awaitDiscard") {
      const p = g.players[0], o = msg.options;
      if (o.tsumo) return send({ type: "intent.discard", action: "tsumo" });
      const rt = o.riichi && !p.riichi ? p.hand.find((t) => o.riichiDiscards.includes(t.kind)) : null;
      if (rt) return send({ type: "intent.discard", tileId: rt.id, riichi: true });
      send({ type: "intent.discard", tileId: p.drawnTileId ?? p.hand.at(-1).id });
    }
    if (msg.type === "evt.awaitCalls") send({ type: "intent.call", action: msg.options.ron ? "ron" : "pass" });
    if (msg.type === "tileDiscarded" && msg.seat === 0) own++;
  }, 2500);
  assert(!crashed && own > 3 && room.autoSeats.size === 0, `正直なクライアントの手は全部通る (own=${own}, auto=${room.autoSeats.size})`);
}

// --- (6) 1接続1席 / rejoin token ---
{
  uncaught.length = 0;
  const host = new RoomHost();
  const { a: client, b: server } = createLoopback();
  host.handle(server, { matchWaitMs: 5000, timeout: 300 });
  for (let i = 0; i < 4; i++) client.send({ type: "intent.join", charId: "shiyue" });
  client.send({ type: "intent.rejoin", token: "__proto__" });
  await wait(50);
  assert(host.room == null && host.waiting.length === 1, "同じ接続の多重 join は1席ぶんだけ");
  assert(uncaught.length === 0, `rejoin token "__proto__" で例外が漏れない (${uncaught[0]?.message})`);
  const { a: c2, b: s2 } = createLoopback();
  const got = [];
  c2.onMessage((m) => got.push(m));
  host.handle(s2, { matchWaitMs: 5000, timeout: 300 });
  c2.send({ type: "intent.rejoin", token: "constructor" });
  await wait(50);
  assert(got.some((m) => m.type === "evt.rejoinFailed"), "未知の token は rejoinFailed");
  clearTimeout(host.timer);
}

// --- (7) JaneDoe の対象検証 ---
{
  const ab = new JaneDoeAbility();
  const me = { character: { name: "me" } };
  const them = { character: { name: "them" }, riichi: false, forcedTsumogiri: 0 };
  const game = { players: [me, them], log() {} };
  assert(ab.apply(game, me, { targetIndex: "__proto__" }) === false && [].forcedTsumogiri === undefined, "\"__proto__\" は弾き Array.prototype を汚さない");
  assert(ab.apply(game, me, { targetIndex: "1" }) === false, "文字列の席番号は弾く");
  assert(ab.apply(game, me, { targetIndex: 1 }) === true && them.forcedTsumogiri === 3, "整数の席番号は通る");
}

// --- (8) 強制ツモ切り中に鳴いた直後（ツモ牌なし）：権威が空回りせず本人に選ばせる ---
{
  const { Phase } = await import("../src/core/game.js");
  const { game } = buildSeatedGame(["shiyue"]);
  const { a: client, b: server } = createLoopback();
  const room = new AuthorityRoom(game, { 0: server }, { timeout: 500 });
  game.startHand();
  const p = game.players[0];
  p.drawnTileId = null; game._lastDraw = null; // 鳴いた直後の手番
  game.turn = 0; game.phase = Phase.AWAIT_DISCARD;
  p.forcedTsumogiri = 3;
  let asked = 0;
  client.onMessage((m) => { if (m.type === "evt.awaitDiscard") { asked++; client.send({ type: "intent.discard", tileId: p.hand[0].id }); } });
  const d = await room.decideTurn(0);
  assert(asked === 1 && d?.type === "discard" && d.tileId === p.hand[0].id, "ツモ牌が無ければ強制ツモ切りでも自由打牌を受け付ける（tileId:null で空回りしない）");
  room.done = true;
}

// --- (9) 安全網：エンジンに受理されない決定でも同じ席で空回りしない（CPU の手で進める） ---
{
  const { Events } = await import("../src/core/events.js");
  const { game } = buildSeatedGame(["shiyue"]);
  const room = new AuthorityRoom(game, {}, {});
  const orig = room.decideTurn.bind(room);
  let calls = 0, callsAtFirstDiscard = null;
  room.decideTurn = async (seat) => { calls++; return calls <= 3 ? { type: "discard", tileId: -1, riichi: false } : orig(seat); };
  game.bus.on(Events.TILE_DISCARDED, () => { if (callsAtFirstDiscard == null) callsAtFirstDiscard = calls; });
  const warn = console.warn; console.warn = () => {};
  const run = room.run().catch(() => {});
  await Promise.race([run, wait(300)]);
  console.warn = warn;
  room.done = true;
  assert(callsAtFirstDiscard === 1, `no-op の決定は同じ反復で CPU の手に置き換わる (decideTurn 呼び出し=${callsAtFirstDiscard})`);
}

if (failures === 0) console.log("\n✅ netvalidate (intent validation / join sanitising / one seat per socket) checks passed");
else { console.error(`\n❌ ${failures} check(s) failed`); }
process.exit(failures ? 1 : 0);
