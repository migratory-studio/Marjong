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

// ---- 4. Phase7 結線（lv-zero-search）: 基準帯テーブル / Lv5≡フリー対戦 / 超越帯＝誤差の一打 ----
{
  const { skillRuntimeAbilityParams } = await import("../src/data/skillLevelMaster.js");
  const ab = (lv) => new ZeroSearchAbility(skillRuntimeAbilityParams("lv-zero-search", lv));

  // テーブル期待値。
  const lv1 = skillRuntimeAbilityParams("lv-zero-search", 1);
  ok("Lv1: maxHands=1 / candidateCount=1 / fallback無し",
    lv1.maxHands === 1 && lv1.candidateCount === 1 && lv1.fallbackDraw === false);
  const lv3 = skillRuntimeAbilityParams("lv-zero-search", 3);
  ok("Lv3: maxHands=2 / candidateCount=2（現行数値に到達）", lv3.maxHands === 2 && lv3.candidateCount === 2);
  const lv6 = skillRuntimeAbilityParams("lv-zero-search", 6);
  ok("Lv6: candidateCount=3（読みの網が広がる）/ fallback無し", lv6.candidateCount === 3 && lv6.fallbackDraw === false);
  const lv7 = skillRuntimeAbilityParams("lv-zero-search", 7);
  ok("Lv7: maxHands=3（1ゲーム3局）", lv7.maxHands === 3);
  const lv9 = skillRuntimeAbilityParams("lv-zero-search", 9);
  ok("Lv9: fallbackDraw=true / fallbackCount=1（誤差の一打・解禁）",
    lv9.fallbackDraw === true && lv9.fallbackCount === 1);
  const lv10 = skillRuntimeAbilityParams("lv-zero-search", 10);
  ok("Lv10: fallbackCount=2 / doraPreference=true（誤差の一打・研ぎ澄まし）",
    lv10.fallbackDraw === true && lv10.fallbackCount === 2 && lv10.doraPreference === true);

  // Lv5 ≡ フリー対戦（無param生成と一致）。
  const free = new ZeroSearchAbility();
  const l5 = ab(5);
  ok("Lv5≡フリー対戦: maxHands=2 / candidateCount=2 / fallback無しで一致",
    free.maxHands === 2 && l5.maxHands === 2 && free.candidateCount === 2 && l5.candidateCount === 2 &&
    free.fallbackDraw === false && l5.fallbackDraw === false);

  // candidateCount: Lv1=1つに切り詰め / Lv6=3つまで広がる。
  const handKinds = [M(1), M(2), M(3), M(4), M(5), M(6), M(7), M(8), M(9), P(5), S(1), S(3), S(5), S(7)];
  {
    const wall = mockWall([P(5), S(2), S(4), S(6)]);
    ok("Lv1: liveCandidates は候補1つまで", ab(1).liveCandidates(makeApi(handKinds, 0, wall)).length === 1);
    ok("Lv6: liveCandidates は候補3つまで", ab(6).liveCandidates(makeApi(handKinds, 0, wall)).length === 3);
  }

  // 超越帯＝誤差の一打（fallbackDraw）。有効牌ゼロの山（該当なし）で挙動が分かれる。
  // deadWall: 有効牌（5p/2s/4s/6s）が一切無いが、手に近い牌（9m=789mに絡む・1p=無関係）は生きている。
  {
    const deadWall = mockWall([M(9), P(1), P(9), S(9)]);
    // Lv5（fallback無し）: 該当なしは従来どおり発動不可。
    ok("Lv5: 該当なし→従来どおり activationCondition=false",
      ab(5).activationCondition(makeApi(handKinds, 0, deadWall)) === false);
    // Lv9: 該当なしでも発動可＝誤差の一打が解禁。
    const a9 = ab(9);
    const api9 = makeApi(handKinds, 0, deadWall);
    ok("Lv9: 該当なしでも activationCondition=true（誤差の一打）", a9.activationCondition(api9) === true);
    ok("Lv9: fallbackKinds が候補を返す（候補1）", a9.fallbackKinds(api9).length === 1);
    const ui9 = a9.uiState(api9);
    ok("Lv9: uiState は候補あり・isFallback=true", ui9.visible === true && ui9.candidates.length === 1 && ui9.isFallback === true);
    // Lv10: 候補2つ。
    ok("Lv10: fallbackKinds は候補2つ", ab(10).fallbackKinds(makeApi(handKinds, 0, deadWall)).length === 2);
    // 生有効牌があるときは通常確保が優先＝isFallback は立たない。
    const liveWall = mockWall([P(5), M(9)]);
    const uiLive = ab(9).uiState(makeApi(handKinds, 0, liveWall));
    ok("Lv9: 生有効牌があれば通常候補・isFallback=false", uiLive.candidates.includes(P(5)) && uiLive.isFallback === false);
  }

  // 誤差の一打の解決: apply（候補ゼロ→fallback 採用・_fallbackMode）→ MODIFY_DRAW で山から掴む。
  {
    const deadWall = mockWall([M(9), P(1), P(9), S(9)]);
    const a = ab(9);
    const game = { wall: deadWall };
    const player = { counts: () => handCounts(...handKinds), numMeldSets: () => 0, character: { name: "x" } };
    const applied = a.apply(game, player, {});
    ok("Lv9: 該当なしで apply 成功（誤差の一打モード）", applied === true && a._fallbackMode === true);
    a.activate();
    const ctx = { player, wall: deadWall };
    const chosen = a[Hooks.MODIFY_DRAW](ctx, { me: player, state: { wall: deadWall }, log() {} });
    ok("Lv9: MODIFY_DRAW が fallback 対象を山から掴む", chosen != null && a._targetKind === chosen.kind);
    ok("Lv9: 解決後 active が下りる（使い切り）", a.active === false);
    // 生有効牌があるときの apply は従来どおり＝_fallbackMode は立たない。
    const b = ab(9);
    b.apply({ wall: mockWall([P(5)]) }, player, { targetKind: P(5) });
    ok("Lv9: 生有効牌ありの apply は通常確保（_fallbackMode=false）", b._fallbackMode === false && b._targetKind === P(5));
  }

  // doraPreference（Lv10）: fallback の同点タイブレークで赤5/ドラを優先する。
  {
    // 手と無関係の孤立牌 1p / 9p(赤フラグ) のみが生きている山＝スコア同点。
    // mockWall は kind 配列受けなので、赤入りの live は直接組む。
    const live = [tile(P(1)), tile(P(9), true)];
    const wall = { live, liveRemaining: live.length, peekLive(n) { return live.slice(0, n); }, doraKinds() { return []; } };
    const a10 = ab(10);
    const kinds = a10.fallbackKinds(makeApi(handKinds, 0, wall));
    const a9 = ab(9);
    const kinds9 = a9.fallbackKinds(makeApi(handKinds, 0, wall));
    // 1p と 9p はどちらも手に絡まない孤立牌＝スコア同点。Lv10 は赤5持ちの 9p を先頭へ、Lv9 は kind 昇順で 1p。
    ok("Lv10: 同点なら赤5持ちの牌種を先頭に（doraPreference）", kinds[0] === P(9));
    ok("Lv9: doraPreference 無しは kind 昇順（1筒が先頭）", kinds9[0] === P(1));
  }
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
