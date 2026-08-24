// 琥珀の盾（凌雲・amber-shield）のユニット検証。Run: node test/ambershield.mjs
// MODIFY_POINT_DELTA（受け切り/剥がれ/半額/盾なし素通し）と ON_WIN（盾の復活）、
// および盾が持続資源（局をまたいで減らない・ゲームで満タン）であることを確認する。
import "../src/abilities/builtins/index.js"; // 能力を登録
import { createAbility } from "../src/abilities/registry.js";
import { Hooks } from "../src/abilities/hooks.js";
import { skillRuntimeAbilityParams, skillLevelEntry } from "../src/data/skillLevelMaster.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };

const noopApi = (me = {}) => ({ me, log() {} });
// runtimeParams（Lv → params）から能力を生成。
const ab = (lv) => createAbility("amber-shield", skillRuntimeAbilityParams("lv-amber-shield", lv));
// MODIFY_POINT_DELTA を叩く薄いラッパ。
const hit = (a, delta, { reason = "ron", rank = "満貫", isYakuman = false } = {}) =>
  a[Hooks.MODIFY_POINT_DELTA]({ reason, rank, isYakuman, player: {}, delta }, noopApi(), delta);

// ---- 0) 既定（params なし）＝ Lv5 と一致（フリー対戦の凌雲）----
{
  const def = createAbility("amber-shield");
  ok("既定: maxShields=1 / protectTier=mangan / coverTsumo=true / stripMitigation=0 / regen空",
    def.maxShields === 1 && def.protectTier === "mangan" && def.coverTsumo === true &&
    def.stripMitigation === 0 && def.regen.length === 0 && def.shields === 1);
  const lv5 = skillRuntimeAbilityParams("lv-amber-shield", 5);
  ok("Lv5 runtimeParams が既定と一致（協定）",
    lv5.protectTier === "mangan" && lv5.coverTsumo === true && lv5.maxShields === 1 &&
    lv5.stripMitigation === 0 && Array.isArray(lv5.regen) && lv5.regen.length === 0);
}

// ---- 1) Lv5: 満貫以上の放銃/被ツモ→失点0かつ盾-1、満貫未満→盾-1かつ満額、盾0で素通し ----
{
  const a = ab(5);
  ok("Lv5 ロン満貫: 失点0", hit(a, -8000, { reason: "ron", rank: "満貫" }) === 0);
  ok("Lv5 受け切り後 盾0", a.shields === 0);
  ok("Lv5 盾0で素通し（undefined＝通常失点）", hit(a, -8000, { reason: "ron", rank: "満貫" }) === undefined);

  const b = ab(5);
  ok("Lv5 被ツモ跳満: 失点0（coverTsumo）", hit(b, -6000, { reason: "tsumo", rank: "跳満" }) === 0);
  ok("Lv5 被ツモ受け切り後 盾0", b.shields === 0);

  const c = ab(5);
  ok("Lv5 満貫未満の放銃: 剥がれるが満額（delta）", hit(c, -3900, { reason: "ron", rank: "" }) === -3900);
  ok("Lv5 剥がれ後 盾0", c.shields === 0);

  const d = ab(5);
  ok("Lv5 役満: isYakuman で受け切り0", hit(d, -32000, { reason: "ron", rank: "役満", isYakuman: true }) === 0);

  // 得点・流局罰符は対象外。
  const e = ab(5);
  ok("delta>=0 は対象外（undefined）", hit(e, 8000, { reason: "ron", rank: "満貫" }) === undefined && e.shields === 1);
  ok("流局罰符（reason=draw）は対象外", hit(e, -1000, { reason: "draw" }) === undefined && e.shields === 1);
}

// ---- 2) Lv4: coverTsumo=false → 被ツモは盾を温存して通常失点 ----
{
  const a = ab(4);
  ok("Lv4 被ツモ満貫: 非カバー＝undefined・盾温存", hit(a, -8000, { reason: "tsumo", rank: "満貫" }) === undefined && a.shields === 1);
  ok("Lv4 ロン満貫: 受け切り0", hit(a, -8000, { reason: "ron", rank: "満貫" }) === 0 && a.shields === 0);
}

// ---- 3) Lv7: 満貫未満で剥がれ→失点半額（100点丸め） ----
{
  const a = ab(7);
  // -3900*0.5=-1950 → Math.round(-19.5)*100 = -1900（JSのroundは+∞方向）。
  ok("Lv7 満貫未満の放銃: 半額（100点丸め）", hit(a, -3900, { reason: "ron", rank: "" }) === -1900);
  ok("Lv7 半額後 盾0", a.shields === 0);
  const b = ab(7);
  ok("Lv7 満貫以上は半額でなく受け切り0", hit(b, -8000, { reason: "ron", rank: "満貫" }) === 0);
}

// ---- 4) ON_WIN regen: Lv6 満貫和了→+1 / Lv9 倍満→+2 / Lv10 5000点→+1 ----
const win = (a, me, res) => a[Hooks.ON_WIN]({ winner: me, result: res }, noopApi(me));
{
  // Lv6: 盾を1枚使ってから満貫和了で1枚復活（max1を超えない）。
  const a = ab(6); const me = {};
  hit(a, -8000, { reason: "ron", rank: "満貫" }); // 盾0
  win(a, me, { rank: "満貫", total: 8000 });
  ok("Lv6 満貫和了で盾+1（max1）", a.shields === 1);
  win(a, me, { rank: "満貫", total: 8000 }); // 満タンなら何もしない
  ok("Lv6 満タンでは増えない", a.shields === 1);
  // 別人の和了では復活しない。
  const b = ab(6); const meB = {};
  hit(b, -8000, { reason: "ron", rank: "満貫" });
  win(b, meB, { rank: "満貫", total: 8000, /* winner != me */ });
  // winner === me なので増える。別人ケースを別途:
  const c = ab(6); const meC = {};
  hit(c, -8000, { reason: "ron", rank: "満貫" });
  c[Hooks.ON_WIN]({ winner: {}, result: { rank: "満貫", total: 8000 } }, noopApi(meC));
  ok("Lv6 他人の和了では復活しない", c.shields === 0);
  // 満貫未満の和了では復活しない（minRank=mangan 未満）。
  const d = ab(6); const meD = {};
  hit(d, -8000, { reason: "ron", rank: "満貫" });
  win(d, meD, { rank: "", total: 3900 });
  ok("Lv6 満貫未満の和了では復活しない", d.shields === 0);
}
{
  // Lv9: 盾2枚。両方使い、倍満和了で+2。
  const a = ab(9); const me = {};
  ok("Lv9 maxShields=2 初期2枚", a.shields === 2);
  hit(a, -8000, { reason: "ron", rank: "満貫" }); // 盾1
  hit(a, -8000, { reason: "ron", rank: "満貫" }); // 盾0
  ok("Lv9 2枚消費して盾0", a.shields === 0);
  win(a, me, { rank: "倍満", total: 16000 });
  ok("Lv9 倍満和了で盾+2", a.shields === 2);
  // 満貫和了は+1（最大amountルール採用：満貫はminRank=manganのみ該当→1）。
  const b = ab(9); const meB = {};
  hit(b, -8000, { reason: "ron", rank: "満貫" });
  hit(b, -8000, { reason: "ron", rank: "満貫" });
  win(b, meB, { rank: "満貫", total: 8000 });
  ok("Lv9 満貫和了は+1", b.shields === 1);
}
{
  // Lv10: 5000点以上の和了で+1（minWinPoints:5000）、倍満以上で+2。
  const a = ab(10); const me = {};
  hit(a, -8000, { reason: "ron", rank: "満貫" });
  hit(a, -8000, { reason: "ron", rank: "満貫" });
  ok("Lv10 2枚消費 盾0", a.shields === 0);
  win(a, me, { rank: "", total: 5000 }); // 満貫未満だが5000点
  ok("Lv10 5000点和了で盾+1", a.shields === 1);
  const b = ab(10); const meB = {};
  hit(b, -8000, { reason: "ron", rank: "満貫" });
  hit(b, -8000, { reason: "ron", rank: "満貫" });
  win(b, meB, { rank: "倍満", total: 16000 });
  ok("Lv10 倍満和了で盾+2", b.shields === 2);
  const c = ab(10); const meC = {};
  hit(c, -8000, { reason: "ron", rank: "満貫" }); // 盾2→1
  hit(c, -8000, { reason: "ron", rank: "満貫" }); // 盾1→0
  win(c, meC, { rank: "", total: 4000 }); // 5000未満→復活なし
  ok("Lv10 4000点の和了では復活しない", c.shields === 0);
}

// ---- 5) 持続資源: resetForHand では減らない / resetForGame で満タン ----
{
  const a = ab(8); // maxShields=2
  hit(a, -8000, { reason: "ron", rank: "満貫" }); // 盾1
  ok("Lv8 1枚消費 盾1", a.shields === 1);
  a.resetForHand();
  ok("resetForHand で盾は減らない（持続）", a.shields === 1);
  a.resetForHand();
  ok("resetForHand 連発でも維持", a.shields === 1);
  a.resetForGame();
  ok("resetForGame で満タンに戻る", a.shields === 2);
}

// ---- 6) 守り演出の材料: lastResult.guards（守り切った席と「本来の失点」）----
// 守備キャラの成果は点棒が動かないことなので、deltas だけでは被ダメ演出から消えてしまう。
// _settle が「本来いくら失うはずだったか」を残しているか（docs/character-ingame-fx-plan.md §8-3-1）。
{
  const { Game } = await import("../src/core/game.js");
  const { CHARACTERS, instantiateAbilities } = await import("../src/characters/characters.js");
  const pick = (id) => CHARACTERS.find((c) => c.id === id);
  const seated = ["kuidoshi", "shiyue", "mamori", "chun_chan"]
    .map((id) => ({ character: pick(id), abilities: instantiateAbilities(pick(id)) }));
  const g = new Game(seated, -1, 4242);
  g.startHand();
  const shield = g.players[0].abilities.find((a) => a.id === "amber-shield");
  ok("凌雲は盾を1枚持って始まる", shield && shield.shields === 1);
  // 凌雲(席0)が満貫(8000)を放銃した体で精算する。
  const raw = [0, 0, 0, 0];
  raw[0] = -8000; raw[1] = 8000;
  g._settle(raw, { reason: "ron", winnerIndex: 1, rank: "満貫", isYakuman: false });
  const guards = g._lastGuards || [];
  ok("守り切った席が guards に載る", guards.length === 1 && guards[0].seat === 0);
  ok("本来の失点(raw)を保持している", guards[0] && guards[0].raw === -8000);
  ok("実際の増減(adjusted)は0", guards[0] && guards[0].adjusted === 0);
  ok("軽減額(blocked)が出ている", guards[0] && guards[0].blocked === 8000);
  ok("盾を1枚使った", shield.shields === 0);
  ok("勝者の取り分も同額ぶん減る（誰の点棒にもならない）", g.players[1].points === 14000);
}

// ---- 7) 超越帯の「半分は、受ける」= 軽減されても実損が残るケース ----
// stripMitigation>0（Lv7+）は盾が剥がれつつ失点が半額になる＝guards に載るが adjusted<0。
// UI 側はこのとき「守った」演出だけで済ませてはいけない（HPバー・トビ演出が要る）。
{
  const { Game } = await import("../src/core/game.js");
  const { CHARACTERS, instantiateAbilities } = await import("../src/characters/characters.js");
  const pick = (id) => CHARACTERS.find((c) => c.id === id);
  const seated = ["kuidoshi", "shiyue", "mamori", "chun_chan"]
    .map((id) => ({ character: pick(id), abilities: instantiateAbilities(pick(id)) }));
  const g = new Game(seated, -1, 99);
  g.startHand();
  const shield = g.players[0].abilities.find((a) => a.id === "amber-shield");
  shield.stripMitigation = 0.5; // Lv7+ 相当
  const raw = [0, 0, 0, 0];
  raw[0] = -2000; raw[1] = 2000; // 閾値未満（満貫未満）＝盾が剥がれる側
  g._settle(raw, { reason: "ron", winnerIndex: 1, rank: "", isYakuman: false });
  const gd = (g._lastGuards || [])[0];
  ok("半額軽減でも guards に載る", !!gd && gd.seat === 0);
  ok("本来の失点は -2000", gd && gd.raw === -2000);
  ok("実損が残る（adjusted<0）", gd && gd.adjusted === -1000);
  ok("軽減額は半分", gd && gd.blocked === 1000);
  ok("持ち点も実際に減っている", g.players[0].points === 12000);
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
