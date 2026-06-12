// ゼロ・リサーチ（ルクス・ゼロ / zero-search）の回帰テスト（DOM不要）。
// Run: node test/zerosearch.mjs
//   1. 既知の1シャンテン手で liveCandidates が正しい有効牌種を返す（生牌に在るもののみ・
//      トップ2・待ち広い順）。
//   2. 発動→次ツモで targetKind が確実に引ける（全山探索）。生有効牌0のとき
//      activationCondition=false / uiState.visible は true だが候補空（グレーアウト相当）。
//   3. 1局1回・1ゲーム2局上限（resetForHand/Game の挙動）。
import { ZeroSearchAbility, zeroSearchEffectiveKinds } from "../src/abilities/builtins/drawAbilities.js";
import { Hooks } from "../src/abilities/hooks.js";
import { emptyCounts, makeKind, kindLabel, tilesToCounts } from "../src/core/tiles.js";
import { shanten } from "../src/core/rules/shanten.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };

const M = (r) => makeKind("m", r), P = (r) => makeKind("p", r), S = (r) => makeKind("s", r);
let _id = 1;
const tile = (kind, red = false) => ({ id: _id++, kind, red });
function handCounts(...kinds) { const c = emptyCounts(); for (const k of kinds) c[k]++; return c; }

// 山(live)から peekLive を満たす軽量モック。kinds 配列で生牌を表す。
function mockWall(liveKinds, doraKinds = []) {
  const live = liveKinds.map((k) => tile(k));
  return {
    live,
    liveRemaining: live.length,
    peekLive(n) { return live.slice(0, n); },
    doraKinds() { return doraKinds.slice(); },
  };
}

// liveCandidates / activationCondition / uiState を駆動する api を組む。
function makeApi(handKinds, numMelds, wall) {
  const counts = handCounts(...handKinds);
  const player = { counts: () => counts.slice(), numMeldSets: () => numMelds };
  return { me: player, state: { wall }, log() {} };
}

// ---- 1. 既知の1シャンテン手で effectiveKinds / liveCandidates ----
{
  // 123m 456m 789m 5p / 1s3s5s7s（雀頭欠け＋カンチャン）= 1シャンテン。
  const handKinds = [M(1), M(2), M(3), M(4), M(5), M(6), M(7), M(8), M(9), P(5), S(1), S(3), S(5), S(7)];
  const counts = handCounts(...handKinds);
  ok("対象手は14枚1シャンテン", shanten(counts, 0) === 1);

  const eff = zeroSearchEffectiveKinds(counts, 0);
  const effKinds = new Set(eff.map((e) => e.kind));
  // 5p（雀頭化で聴牌）と 2s/4s/6s（カンチャン埋めで聴牌）は有効牌のはず。
  ok("有効牌に 5筒 が含まれる", effKinds.has(P(5)));
  ok("有効牌に 2索/4索/6索 が含まれる", effKinds.has(S(2)) && effKinds.has(S(4)) && effKinds.has(S(6)));
  ok("breadth 降順にソート済み", eff.every((e, i) => i === 0 || eff[i - 1].breadth >= e.breadth));

  // 生牌を 2s と 5p のみに絞る → liveCandidates はこの2種だけ（トップ2）。
  {
    const wall = mockWall([S(2), S(2), P(5), M(1) /* 無効牌 */]);
    const ab = new ZeroSearchAbility();
    const cands = ab.liveCandidates(makeApi(handKinds, 0, wall));
    ok("liveCandidates は生牌に在る有効牌のみ", cands.every((k) => k === S(2) || k === P(5)) && cands.length <= 2);
    ok("liveCandidates が空でない（生有効牌あり）", cands.length > 0);
  }
  // 同 breadth が3種以上生牌に在る → トップ2に切り詰める。
  {
    const wall = mockWall([P(5), S(2), S(4), S(6)]);
    const ab = new ZeroSearchAbility();
    const cands = ab.liveCandidates(makeApi(handKinds, 0, wall));
    ok("liveCandidates はトップ2まで", cands.length === 2);
  }
}

// ---- 2. 発動→次ツモで targetKind を確実に手繰り寄せる（MODIFY_DRAW） ----
{
  const handKinds = [M(1), M(2), M(3), M(4), M(5), M(6), M(7), M(8), M(9), P(5), S(1), S(3), S(5), S(7)];
  // targetKind=5p を含む山。先頭は無効牌、5p は後方に置いて「全山探索」を検証する。
  // 生有効牌は 5p と 2s のみ（他は無効牌）にして候補を確定させる。
  const wall = mockWall([S(9), M(1), P(5), S(8), S(2)]);
  const ab = new ZeroSearchAbility();
  const game = { wall };
  const player = { counts: () => handCounts(...handKinds), numMeldSets: () => 0 };
  // apply（targetKind 指定）→ activate の順を再現。
  const applied = ab.apply(game, { ...player, character: { name: "ルクス・ゼロ" } }, { targetKind: P(5) });
  ok("apply 成功（候補あり）", applied === true);
  ab.activate();
  ok("発動後 active", ab.active === true);

  const ctx = { player, wall };
  const chosen = ab[Hooks.MODIFY_DRAW](ctx, { me: player, state: { wall }, log() {} });
  ok("MODIFY_DRAW が targetKind(5筒) を返す", chosen && chosen.kind === P(5));
  ok("解決後 active が下りる（使い切り）", ab.active === false);
}

// ---- 2b. 生有効牌0: activationCondition=false / uiState.visible=true・候補空 ----
{
  const handKinds = [M(1), M(2), M(3), M(4), M(5), M(6), M(7), M(8), M(9), P(5), S(1), S(3), S(5), S(7)];
  // 有効牌（5p/2s/4s/6s …）が一切無い山＝場に出切っている。
  const wall = mockWall([M(1), M(9), S(9), P(1)]);
  const ab = new ZeroSearchAbility();
  const api = makeApi(handKinds, 0, wall);
  ok("生有効牌0 → activationCondition=false", ab.activationCondition(api) === false);
  const ui = ab.uiState(api);
  ok("生有効牌0 → uiState.visible=true（1シャンテンなので出す）", ui.visible === true);
  ok("生有効牌0 → uiState.candidates 空（グレーアウト相当）", ui.candidates.length === 0);
}

// ---- 2c. 非1シャンテンでは uiState.visible=false ----
{
  // 完成手（アガリ形・shanten -1）。
  const tenpaiKinds = [M(1), M(2), M(3), M(4), M(5), M(6), M(7), M(8), M(9), S(2), S(3), S(4), P(1), P(1)];
  const wall = mockWall([P(1), S(5)]);
  const ab = new ZeroSearchAbility();
  const api = makeApi(tenpaiKinds, 0, wall);
  ok("非1シャンテン → uiState.visible=false", ab.uiState(api).visible === false);
}

// ---- 3. 1局1回・1ゲーム2局上限（charges / _handsUsed） ----
{
  const handKinds = [M(1), M(2), M(3), M(4), M(5), M(6), M(7), M(8), M(9), P(5), S(1), S(3), S(5), S(7)];
  const wall = mockWall([P(5), S(2)]);
  const ab = new ZeroSearchAbility();
  const game = { wall };
  const player = { counts: () => handCounts(...handKinds), numMeldSets: () => 0, character: { name: "x" } };

  // 局1: 1回発動 → チャージ消費・使用局数1。
  ok("初期 charges=1", ab.charges === 1);
  ab.apply(game, player, { targetKind: P(5) }); ab.activate();
  ok("発動後 charges=0", ab.charges === 0);
  ok("局1発動後 _handsUsed=1", ab._handsUsed === 1);
  // 同局内ではもう発動できない（charges 0）。
  ok("同局2回目は ready=false", ab.ready === false);

  // 局2: resetForHand でチャージ補充、_usedThisHand クリア。
  ab.resetForHand();
  ok("resetForHand で charges 補充", ab.charges === 1 && ab._usedThisHand === false);
  ab.apply(game, player, { targetKind: P(5) }); ab.activate();
  ok("局2発動後 _handsUsed=2", ab._handsUsed === 2);

  // 局3: チャージは補充されるが使用局数が上限 → activationCondition=false。
  ab.resetForHand();
  const api = makeApi(handKinds, 0, wall);
  ok("3局目は使用局数上限で activationCondition=false", ab.activationCondition(api) === false);
  ok("3局目 uiState.visible=false（_handsUsed>=2）", ab.uiState(api).visible === false);

  // resetForGame で全リセット。
  ab.resetForGame();
  ok("resetForGame で _handsUsed=0・charges=1", ab._handsUsed === 0 && ab.charges === 1);
  ok("リセット後は再び発動可", ab.activationCondition(makeApi(handKinds, 0, wall)) === true);
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
