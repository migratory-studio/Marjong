// ネビュラ「暗黒星」の被弾演出の材料テスト（DOM不要）。
// Run: node test/nebula.mjs
//
// 設計は docs/character-ingame-fx-plan.md §14-2-1。呪い＝守り（guards）の鏡像で、
// 「本来いくら失うはずだったか」を演出が先に見せてから、倍に膨らんだ実失点を出す。
// その材料が lastResult.curses に載ることを担保する:
//   - 失点が倍化した席が curses に載り、raw（本来）/ adjusted（実際）/ extra（膨らんだ差）を持つ
//   - 守り（guards）とは排他＝同じ席が両方に載らない
//   - 膨らんだぶんは誰の取り分にもならない（勝者の取り分は増えない）
//   - アガりは半減（MODIFY_SCORE）＝失点倍化とは別経路
import { Game } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";
import { Hooks } from "../src/abilities/hooks.js";
import "../src/abilities/builtins/index.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };

const pick = (id) => CHARACTERS.find((c) => c.id === id);
const seatOf = (ids) => ids.map((id) => ({ character: pick(id), abilities: instantiateAbilities(pick(id)) }));

// ---- 失点の倍化が curses に載る ----
{
  const g = new Game(seatOf(["nebula", "shiyue", "mamori", "chun_chan"]), -1, 7);
  g.startHand();
  const before = g.players[0].points;
  const raw = [0, 0, 0, 0];
  raw[0] = -8000; raw[1] = 8000; // ネビュラ(席0)が満貫を放銃した体
  g._settle(raw, { reason: "ron", winnerIndex: 1, rank: "満貫", isYakuman: false });
  const c = (g._lastCurses || [])[0];
  ok("呪われた席が curses に載る", !!c && c.seat === 0);
  ok("本来の失点(raw)を保持している", c && c.raw === -8000);
  ok("実際の失点(adjusted)は倍", c && c.adjusted === -16000);
  ok("膨らんだ差(extra)が出ている", c && c.extra === 8000);
  ok("守り(guards)には載らない（排他）", (g._lastGuards || []).length === 0);
  ok("持ち点は倍だけ減っている", g.players[0].points === before - 16000);
  ok("膨らんだぶんは勝者の取り分にならない", g.players[1].points === pick("shiyue").stats.startingPoints + 8000);
}

// ---- 守りと呪いが同じ卓に居ても、席ごとに正しく振り分けられる ----
{
  const g = new Game(seatOf(["nebula", "shiyue", "kuidoshi", "chun_chan"]), -1, 11);
  g.startHand();
  const raw = [0, 0, 0, 0];
  raw[0] = -4000; raw[2] = -8000; raw[1] = 12000; // ネビュラと凌雲が同時に被弾（ツモられ）
  g._settle(raw, { reason: "tsumo", winnerIndex: 1, rank: "満貫", isYakuman: false });
  const cursed = (g._lastCurses || []).map((x) => x.seat);
  const guarded = (g._lastGuards || []).map((x) => x.seat);
  ok("呪いはネビュラの席だけ", cursed.length === 1 && cursed[0] === 0);
  ok("守りは凌雲の席だけ", guarded.length === 1 && guarded[0] === 2);
}

// ---- アガりの半減は別経路（MODIFY_SCORE）＝curses には載らない ----
{
  const g = new Game(seatOf(["nebula", "shiyue", "mamori", "chun_chan"]), -1, 13);
  g.startHand();
  const ab = g.players[0].abilities.find((a) => a.id === "nebula-curse");
  const res = { valid: true, totalHan: 5, rank: "満貫", ron: 8000, total: 8000 };
  const out = ab[Hooks.MODIFY_SCORE]({ winner: g.players[0], result: res }, { me: g.players[0], log: () => {} }, res);
  ok("アガりは半減する（8000 → 4000）", out.ron === 4000 && out.total === 4000);
  const raw = [4000, -4000, 0, 0];
  g._settle(raw, { reason: "ron", winnerIndex: 0, rank: "満貫", isYakuman: false });
  ok("加点側は呪いに載らない（失点だけが対象）", (g._lastCurses || []).length === 0);
}

// ---- 流局: カリュブディスの受取3倍と同時に呪いがあっても、呪いぶんは消える ----
// QA(2026-08-25 🔴)で見つけた会計の穴。流局のサープラス回収を Σadjusted で測ると、
// 呪いの「負の増分」が余剰と相殺され、消えるはずの呪いぶんが他の支払い側の負担軽減に
// 回ってしまう。増えた方向だけ（max(0, adjusted-raw)）を数えるのが正しい。
{
  const g = new Game(seatOf(["charybdis", "nebula", "shiyue", "mamori"]), -1, 5);
  g.startHand();
  const before = g.players.map((p) => p.points);
  // 席0=カリュブディス(聴牌) / 席1=ネビュラ(ノーテン・呪い) / 席2,3=ノーテン
  g._settle([3000, -1000, -1000, -1000], { reason: "draw" });
  const d = g.players.map((p, i) => p.points - before[i]);
  ok("カリュブディスの受取は3倍（+9000）", d[0] === 9000);
  ok("ネビュラは罰符が倍＋サープラス按分（-4000）", d[1] === -4000);
  ok("呪いのない支払い側は按分だけ（-3000）", d[2] === -3000 && d[3] === -3000);
  ok("呪いで膨らんだぶんは消える（合計 = -1000）", d.reduce((a, b) => a + b, 0) === -1000);
}

// ---- 呪いが無い流局は従来どおり厳密にゼロサム ----
{
  const g = new Game(seatOf(["charybdis", "shiyue", "mamori", "chun_chan"]), -1, 5);
  g.startHand();
  const before = g.players.map((p) => p.points);
  g._settle([3000, -1000, -1000, -1000], { reason: "draw" });
  const d = g.players.map((p, i) => p.points - before[i]);
  ok("呪い無しの流局はゼロサムのまま", d.reduce((a, b) => a + b, 0) === 0);
  ok("受取3倍は保たれる（+9000）", d[0] === 9000);
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
