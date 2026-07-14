// リーチ後のカン/北抜きの回帰テスト。 Run: node test/riichikan.mjs
//   - リーチ後の暗槓は「ツモ牌・待ち不変」のときだけ提示/実行できる（送り槓は禁止）
//   - リーチ後の北抜きは「ツモった北」だけ（手牌の北・和了牌の北は不可）
//   - リーチ後の手出しはエンジンが拒否する（ツモ切りのみ）
import { Game, Phase } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";
import { MeldType } from "../src/core/meld.js";
import { makeKind } from "../src/core/tiles.js";
import { waits } from "../src/core/rules/winCheck.js";

let failures = 0;
const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); failures++; } };

const m = (n) => makeKind("m", n);
const p_ = (n) => makeKind("p", n);
const s = (n) => makeKind("s", n);
const KITA = 30; // 北

let nextId = 100000; // 山の実 id と被らない領域
const T = (kind) => ({ id: nextId++, kind, red: false });

// ゲームを起こし、手番プレイヤーへ手牌13枚＋ツモ牌を仕込む。riichi=true なら宣言済み扱い。
function setup(kinds, drawnKind, { players = 4, riichi = true } = {}) {
  const seated = [];
  for (let i = 0; i < players; i++) {
    const c = CHARACTERS[i % CHARACTERS.length];
    seated.push({ character: c, abilities: instantiateAbilities(c) });
  }
  const game = new Game(seated, /*human*/ -1, 7777);
  game.startHand();
  const idx = game.turn;
  const p = game.players[idx];
  p.hand = kinds.map(T);
  const drawn = drawnKind != null ? T(drawnKind) : null;
  if (drawn) {
    p.hand.push(drawn);
    p.drawnTileId = drawn.id;
  }
  game._lastDraw = drawn;
  p.riichi = riichi;
  if (riichi) p.riichiTurn = 0;
  return { game, idx, p, drawn };
}

// ---- リーチ後: 待ち不変の暗槓（ツモ4枚目）は提示され、実行できる ----
{
  // 111m 234p 567p 888s + 9p単騎待ち、8s をツモ。888s は他の解釈に混ざらない純粋な
  // 暗刻（隣接 souzu なし）なので、暗槓しても待ちは 9p のまま → 合法。
  const hand = [m(1), m(1), m(1), p_(2), p_(3), p_(4), p_(5), p_(6), p_(7), s(8), s(8), s(8), p_(9)];
  const { game, idx, p } = setup(hand, s(8));
  const opts = game.actionOptions(idx);
  assert(opts.kans.length === 1, `wait-preserving ankan is offered after riichi (got ${opts.kans.length})`);
  assert(opts.kans[0]?.type === MeldType.KAN_CLOSED && opts.kans[0]?.kind === s(8), "offered kan is closed kan of the drawn kind");
  game.declareKan(idx, s(8), MeldType.KAN_CLOSED);
  assert(p.melds.length === 1 && p.melds[0].type === MeldType.KAN_CLOSED, "ankan resolved after riichi");
  assert(game.turn === idx && game.phase === Phase.AWAIT_DISCARD, "kanner acts again after rinshan draw");
  assert(p.riichi === true, "riichi persists through the kan");
  // 槓後（リンシャン牌を除いた10枚＋槓子）でも待ちは 9p のまま
  const counts = p.counts();
  const rinshan = p.hand.find((t) => t.id === p.drawnTileId);
  assert(rinshan != null, "rinshan tile was drawn into hand");
  counts[rinshan.kind]--;
  const w = waits(counts, p.numMeldSets());
  assert(w.length === 1 && w[0] === p_(9), `wait unchanged after riichi ankan (got [${w}])`);
}

// ---- リーチ後: 待ちが変わる暗槓（送り槓）は提示されず、直接呼んでも通らない ----
{
  // 111m2m 456p 789p 555s は 2m(単騎)/3m(11m雀頭+12m) の2面待ち。1m は和了牌ではない
  // （1111m は分解できない）ので和了牌ガードは通過し、槓すると 3m 待ちが消えて
  // 2m 単騎に狭まる＝純粋に待ち比較（送り槓検出）で拒否されるケース。
  const hand = [m(1), m(1), m(1), m(2), p_(4), p_(5), p_(6), p_(7), p_(8), p_(9), s(5), s(5), s(5)];
  const { game, idx, p } = setup(hand, m(1));
  const opts = game.actionOptions(idx);
  assert(opts.tsumo !== true, "drawn 1m is not a winning tile (guard reaches the wait comparison)");
  assert(opts.kans.length === 0, "wait-changing ankan is NOT offered after riichi");
  game.declareKan(idx, m(1), MeldType.KAN_CLOSED);
  assert(p.melds.length === 0 && p.hand.length === 14, "engine rejects an illegal riichi kan called directly");
}

// ---- リーチ後: 和了牌での暗槓は不可（アガリを見逃してのカンを封じる） ----
{
  // 444m 56m 678p 234s 99s は 4m/7m 待ち（444m+456m と読める）。4m ツモは
  // ツモ和了できる牌なので、暗槓の選択肢としては出さない。
  const hand = [m(4), m(4), m(4), m(5), m(6), p_(6), p_(7), p_(8), s(2), s(3), s(4), s(9), s(9)];
  const { game, idx, p } = setup(hand, m(4));
  const opts = game.actionOptions(idx);
  assert(opts.tsumo === true, "drawn 4m is a winning tile (tsumo offered)");
  assert(opts.kans.length === 0, "ankan of the winning tile is NOT offered after riichi");
  game.declareKan(idx, m(4), MeldType.KAN_CLOSED);
  assert(p.melds.length === 0 && p.hand.length === 14, "engine rejects a winning-tile riichi kan called directly");
}

// ---- リーチ後: ツモ牌が無い（リコール交換直後など）は手中4枚でも槓不可 ----
{
  // 8s を4枚とも手中に持つ13枚（形式上ノーテンだが _lastDraw ガードの検証が目的）。
  const hand = [m(1), m(1), m(1), p_(2), p_(3), p_(4), p_(5), p_(6), p_(7), s(8), s(8), s(8), s(8)];
  const { game, idx } = setup(hand, null);
  const opts = game.actionOptions(idx);
  assert((opts?.kans || []).length === 0, "no kan offered after riichi without a live drawn tile");
}

// ---- 三麻・リーチ後: ツモった北は抜ける（抜いた牌はツモ牌そのもの） ----
{
  // 123p 456p 789p 111s + 9s単騎、北ツモ
  const hand = [p_(1), p_(2), p_(3), p_(4), p_(5), p_(6), p_(7), p_(8), p_(9), s(1), s(1), s(1), s(9)];
  const { game, idx, p, drawn } = setup(hand, KITA, { players: 3 });
  assert(game.sanma, "3-player game is sanma");
  const opts = game.actionOptions(idx);
  assert(opts.nuki === true, "drawn North can be pulled after riichi");
  assert(game.nukiKita(idx) === true, "nukiKita succeeds after riichi");
  assert(p.kita.length === 1 && p.kita[0].id === drawn.id, "the pulled tile is the drawn North itself");
  assert(p.riichi === true, "riichi persists through the kita pull");
  assert(p.hand.length === 14, "replacement tile drawn after the pull");
}

// ---- 三麻・リーチ後: 手牌に組み込んだ北は抜けない（ツモは別の牌） ----
{
  // 北暗刻＋9s単騎でリーチしている形。1s をツモ。
  const hand = [p_(1), p_(2), p_(3), p_(4), p_(5), p_(6), p_(7), p_(8), p_(9), KITA, KITA, KITA, s(9)];
  const { game, idx, p } = setup(hand, s(1), { players: 3 });
  const opts = game.actionOptions(idx);
  assert(opts.nuki === false, "hand-North is NOT pullable after riichi");
  assert(game.nukiKita(idx) === false, "nukiKita rejects hand-North after riichi");
  assert(p.hand.length === 14 && p.kita.length === 0, "hand untouched by the rejected pull");
}

// ---- 三麻・リーチ後: 和了牌の北は抜けない（ツモるかツモ切るかの二択） ----
{
  // 北単騎リーチで北をツモ → ツモ和了は出るが北抜きは出ない
  const hand = [p_(1), p_(2), p_(3), p_(4), p_(5), p_(6), p_(7), p_(8), p_(9), s(1), s(1), s(1), KITA];
  const { game, idx } = setup(hand, KITA, { players: 3 });
  const opts = game.actionOptions(idx);
  assert(opts.tsumo === true, "winning North offers tsumo");
  assert(opts.nuki === false, "winning North is NOT pullable after riichi");
}

// ---- リーチ後: 手出しはエンジンが拒否（ツモ切りだけ通る） ----
{
  const hand = [m(1), m(1), m(1), p_(2), p_(3), p_(4), p_(5), p_(6), p_(7), s(8), s(8), s(8), s(9)];
  const { game, idx, p, drawn } = setup(hand, s(2));
  const inHand = p.hand.find((t) => t.id !== drawn.id);
  game.discard(idx, inHand.id);
  assert(p.hand.length === 14 && p.discards.length === 0, "hand-tile discard is rejected after riichi");
  game.discard(idx, drawn.id);
  assert(p.discards.length === 1 && p.discards[0].id === drawn.id, "tsumogiri goes through after riichi");
}

// ---- リグレッション: リーチしていなければ従来どおり ----
{
  // 非リーチ: 手中4枚の暗槓は（ツモ牌と無関係に）提示される
  const hand = [s(8), s(8), s(8), s(8), m(1), m(1), m(1), p_(2), p_(3), p_(4), p_(5), p_(6), p_(7)];
  const { game, idx } = setup(hand, m(9), { riichi: false });
  const opts = game.actionOptions(idx);
  assert(opts.kans.some((k) => k.type === MeldType.KAN_CLOSED && k.kind === s(8)), "non-riichi ankan offered as before");
}
{
  // 非リーチ三麻: 手牌の北（ツモでない）も従来どおり抜ける
  const hand = [p_(1), p_(2), p_(3), p_(4), p_(5), p_(6), p_(7), p_(8), p_(9), KITA, s(1), s(1), s(9)];
  const { game, idx, p } = setup(hand, s(2), { players: 3, riichi: false });
  const opts = game.actionOptions(idx);
  assert(opts.nuki === true, "non-riichi hand-North pullable as before");
  assert(game.nukiKita(idx) === true && p.kita.length === 1, "non-riichi kita pull works as before");
}

if (failures === 0) console.log("✅ all riichi-kan/nuki checks passed");
else { console.error(`\n❌ ${failures} failure(s)`); process.exit(1); }
