// リーチ棒コスト（riichiCost オプション）の回帰テスト（DOM不要）。
// 楼光の館は点棒＝HPの独自スケール（~1000）。リーチ棒1000点だと供託でHPを超え、
// リーチ自体が宣言不能になっていた（バグ）。riichiCost を 0/小さくすると宣言可能になる。
// Run: node test/riichicost.mjs
import { Game } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";
import { makeKind } from "../src/core/tiles.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };

const M = (r) => makeKind("m", r), P = (r) => makeKind("p", r), S = (r) => makeKind("s", r);
let _id = 1;
const tile = (kind) => ({ id: _id++, kind, red: false });

function mkGame(opts) {
  return new Game(
    CHARACTERS.slice(0, 4).map((c) => ({ character: c, abilities: instantiateAbilities(c) })),
    -1, 1, { maxRounds: 1, ...opts },
  );
}

// 14枚・門前・聴牌（9sを切れば 123m456m789m 11p 23s ＝ 1s/4s 待ち）。
function setTenpai(g, points) {
  g.startHand(); // 山を生成（wall.liveRemaining を満たす）
  const p = g.players[0];
  p.hand = [M(1), M(2), M(3), M(4), M(5), M(6), M(7), M(8), M(9), P(1), P(1), S(2), S(3), S(9)].map(tile);
  p.melds = [];
  p.riichi = false;
  p.points = points;
  g.phase = "await-discard";
  g.turn = 0;
  g._lastDraw = p.hand[p.hand.length - 1]; // 直近ツモ＝9s（ツモ切り判定用）
  return p;
}

// 既定 riichiCost=1000：低HP（500点）ではリーチ不能（旧来の挙動＝バグ再現）。
{
  const g = mkGame({});
  ok("既定 riichiCost=1000", g.riichiCost === 1000);
  setTenpai(g, 500);
  const opts = g.actionOptions(0);
  ok("低HPでは riichiCost=1000 だとリーチ不可（バグ）", opts && opts.riichi === false);
}

// riichiCost=0：同じ低HPでもリーチ可能（修正）。聴牌・門前は満たしている。
{
  const g = mkGame({ riichiCost: 0 });
  ok("riichiCost=0 を受理", g.riichiCost === 0);
  setTenpai(g, 500);
  const opts = g.actionOptions(0);
  ok("riichiCost=0 なら低HPでもリーチ可能（修正）", opts && opts.riichi === true);
  ok("リーチ宣言牌の候補がある（9s）", opts && Array.isArray(opts.riichiDiscards) && opts.riichiDiscards.includes(S(9)));
}

// リーチ宣言で供託は riichiCost ぶんだけ動く（0なら点棒不変＝HPを削らない）。
{
  const g = mkGame({ riichiCost: 0 });
  const p = setTenpai(g, 500);
  g.discard(0, p.hand.find((t) => t.kind === S(9)).id, /*declareRiichi*/ true);
  ok("riichiCost=0：リーチ宣言してもHP不変", p.points === 500);
  ok("riichiCost=0：供託も増えない", g.kyotaku === 0);
  ok("リーチ成立（フラグon）", p.riichi === true);
}

// 和了抑止フラグ：noWinSeats/noTsumoSeats は既定で空集合。
{
  const g = mkGame({});
  ok("noWinSeats は Set・既定空", g.noWinSeats instanceof Set && g.noWinSeats.size === 0);
  ok("noTsumoSeats は Set・既定空", g.noTsumoSeats instanceof Set && g.noTsumoSeats.size === 0);
}

console.log(fails === 0 ? "ALL PASS" : `${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
