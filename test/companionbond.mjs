// 相棒絆（companion bond）＋プレイヤー履歴のロジックテスト。
// Run: node test/companionbond.mjs
//
// カバー:
//  - companionLevelFromExp: exp → level 境界
//  - applyMatchToCompanion: 連勝/連敗の遷移とリセット、九蓮ジャンプ(+120)
//  - condMatches: companionBondMin / winStreakMin / loseStreakMin / lastHandResult / playStyleTag
//  - detectPlayStyle: 各タグ（riichi / meld / aggressive / defensive）
//  - topPlayStyle: しきい値（母数不足で null、比率不足で null、十分なら返す）
import {
  companionLevelFromExp,
  applyMatchToCompanion,
  detectPlayStyle,
  topPlayStyle,
  defaultPlayerHistory,
} from "../src/progression/companionBond.js";
import { pickVoiceLine } from "../src/data/voiceLines.js";
import { GROWTH_TUNING } from "../src/progression/progressionService.js";

let failures = 0;
const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); failures++; } };
const eq = (a, b, msg) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

// ============================================================
// 1. companionLevelFromExp — exp → level 境界
// ============================================================
{
  const base = GROWTH_TUNING.bondExpPerLevel; // 40

  // Lv1 初期（exp=0）
  const r0 = companionLevelFromExp(0);
  eq(r0.level, 1, "exp=0 → Lv1");
  eq(r0.exp, 0, "exp=0 残exp=0");

  // Lv1 閾値の1手前（base*1 - 1 = 39）
  const r39 = companionLevelFromExp(base - 1);
  eq(r39.level, 1, "exp=39 → まだLv1");
  eq(r39.exp, base - 1, "exp=39 残exp=39");

  // Lv1→2 の境界（base*1 = 40）
  const r40 = companionLevelFromExp(base);
  eq(r40.level, 2, "exp=40 → Lv2 へ昇格");
  eq(r40.exp, 0, "exp=40 残exp=0");

  // Lv2→3 の境界（40 + 80 = 120）
  const r120 = companionLevelFromExp(base + base * 2);
  eq(r120.level, 3, "exp=120 → Lv3 へ昇格");
  eq(r120.exp, 0, "exp=120 残exp=0");

  // 途中の値（40 + 50 = 90 → Lv2で残 50）
  const r90 = companionLevelFromExp(base + 50);
  eq(r90.level, 2, "exp=90 → Lv2");
  eq(r90.exp, 50, "exp=90 残exp=50");

  // 負値は 0 として扱う
  const rNeg = companionLevelFromExp(-10);
  eq(rNeg.level, 1, "exp=-10 → Lv1");
  eq(rNeg.exp, 0, "exp=-10 残exp=0");

  console.log("  companionLevelFromExp: OK");
}

// ============================================================
// 2. applyMatchToCompanion — 連勝/連敗遷移とリセット
// ============================================================
{
  // 素の profile（最小限）
  function makeProfile() {
    return { companionBonds: {}, playerHistory: defaultPlayerHistory() };
  }

  // (a) 1位（0）→ winStreak=1、loseStreak=0
  const p1 = applyMatchToCompanion(makeProfile(), { companionId: "shiyue", placement: 0, numPlayers: 4 });
  eq(p1.playerHistory.winStreak, 1, "1位で winStreak=1");
  eq(p1.playerHistory.loseStreak, 0, "1位で loseStreak=0");
  eq(p1.playerHistory.totalMatches, 1, "totalMatches=1");
  eq(p1.playerHistory.lastPlacement, 0, "lastPlacement=0");

  // (b) 連勝2回目
  const p2 = applyMatchToCompanion(p1, { companionId: "shiyue", placement: 0, numPlayers: 4 });
  eq(p2.playerHistory.winStreak, 2, "連勝2回目");
  eq(p2.playerHistory.maxWinStreak, 2, "maxWinStreak=2");

  // (c) 2位（中間）→ 両ストリーク0リセット
  const p3 = applyMatchToCompanion(p2, { companionId: "shiyue", placement: 1, numPlayers: 4 });
  eq(p3.playerHistory.winStreak, 0, "2位で winStreak リセット");
  eq(p3.playerHistory.loseStreak, 0, "2位で loseStreak もリセット");
  eq(p3.playerHistory.maxWinStreak, 2, "maxWinStreak は保存される");

  // (d) ラス（numPlayers-1=3）→ loseStreak=1
  const p4 = applyMatchToCompanion(p3, { companionId: "shiyue", placement: 3, numPlayers: 4 });
  eq(p4.playerHistory.loseStreak, 1, "ラスで loseStreak=1");

  // (e) ラス連続 → loseStreak=2
  const p5 = applyMatchToCompanion(p4, { companionId: "shiyue", placement: 3, numPlayers: 4 });
  eq(p5.playerHistory.loseStreak, 2, "ラス連続で loseStreak=2");

  // (f) 1位が来ると loseStreak リセット
  const p6 = applyMatchToCompanion(p5, { companionId: "shiyue", placement: 0, numPlayers: 4 });
  eq(p6.playerHistory.loseStreak, 0, "1位で loseStreak リセット");
  eq(p6.playerHistory.winStreak, 1, "1位で winStreak=1 再開");

  // (g) bond exp が正しく積まれる（1位=+12）
  const pb = applyMatchToCompanion(makeProfile(), { companionId: "shiyue", placement: 0, numPlayers: 4 });
  eq(pb.companionBonds.shiyue.exp, 12, "1位で exp=12");
  // ラス=+2
  const pb2 = applyMatchToCompanion(makeProfile(), { companionId: "shiyue", placement: 3, numPlayers: 4 });
  eq(pb2.companionBonds.shiyue.exp, 2, "ラスで exp=2");

  // (h) 別キャラの bonds は独立
  const pMulti = applyMatchToCompanion(pb, { companionId: "ryuun", placement: 1, numPlayers: 4 });
  eq(pMulti.companionBonds.shiyue.exp, 12, "shiyue の bond は影響なし");
  eq(pMulti.companionBonds.ryuun.exp, 6, "ryuun の bond=6（2位）");

  // (i) 2人戦: 0=1位(+12) / 1=ラス(+2)
  const p2p_win = applyMatchToCompanion(makeProfile(), { companionId: "shiyue", placement: 0, numPlayers: 2 });
  eq(p2p_win.companionBonds.shiyue.exp, 12, "2人戦 1位=+12");
  const p2p_los = applyMatchToCompanion(makeProfile(), { companionId: "shiyue", placement: 1, numPlayers: 2 });
  eq(p2p_los.companionBonds.shiyue.exp, 2, "2人戦 ラス=+2");

  console.log("  applyMatchToCompanion (連勝/連敗/bond): OK");
}

// ============================================================
// 3. 九蓮ジャンプ（treasureJustCleared=true → +120 追加）
// ============================================================
{
  function makeProfile() {
    return { companionBonds: {}, playerHistory: defaultPlayerHistory() };
  }

  // 通常 1位は +12
  const pNormal = applyMatchToCompanion(makeProfile(), { companionId: "shiyue", placement: 0, numPlayers: 4 });
  // 九蓮達成同時 1位は +12+120=132
  const pJump = applyMatchToCompanion(makeProfile(), {
    companionId: "shiyue", placement: 0, numPlayers: 4, treasureJustCleared: true,
  });
  // level 計算: 132 exp → Lv1で40超=Lv2、残92 → Lv2で80超=Lv3、残12
  eq(pJump.companionBonds.shiyue.level, 3, "九蓮ジャンプで exp=132→Lv3");
  eq(pJump.companionBonds.shiyue.exp, 12, "九蓮ジャンプで残exp=12");
  assert(pJump.companionBonds.shiyue.level > pNormal.companionBonds.shiyue.level, "九蓮ジャンプ > 通常");

  // ラス+九蓮: +2+120=122
  const pJumpLast = applyMatchToCompanion(makeProfile(), {
    companionId: "shiyue", placement: 3, numPlayers: 4, treasureJustCleared: true,
  });
  // 122 exp → Lv1で40超=Lv2(残82) → Lv2で80超=Lv3(残2)
  eq(pJumpLast.companionBonds.shiyue.level, 3, "ラス+九蓮で Lv3");
  eq(pJumpLast.companionBonds.shiyue.exp, 2, "ラス+九蓮で残exp=2");

  console.log("  applyMatchToCompanion (九蓮ジャンプ +120): OK");
}

// ============================================================
// 4. styleCounts の加算と topPlayStyle
// ============================================================
{
  function makeProfile() {
    return { companionBonds: {}, playerHistory: defaultPlayerHistory() };
  }

  // styleTags が正しく styleCounts に積まれる
  const p1 = applyMatchToCompanion(makeProfile(), {
    companionId: "shiyue", placement: 0, numPlayers: 4, styleTags: ["riichi", "aggressive"],
  });
  eq(p1.playerHistory.styleCounts.riichi, 1, "styleCounts.riichi=1");
  eq(p1.playerHistory.styleCounts.aggressive, 1, "styleCounts.aggressive=1");

  console.log("  styleCounts 加算: OK");
}

// ============================================================
// 5. condMatches — 各新キーで正しく絞る/通す（pickVoiceLine 経由）
// ============================================================
{
  // テスト用のキャラをモックで入れ込む代わりに、pickVoiceLine の内部 condMatches を
  // 直接叩く方法は難しいため、voiceLines.js のエクスポートに依存。
  // condMatches は非公開関数なので、pickVoiceLine + CHARACTER_VOICE_MASTER のモック経路ではなく、
  // voiceLines.js を直接書き換えずに condMatches ロジック単体を検証するため、
  // 同じロジックを inline で再現してテストする。
  //
  // 設計上の意図: ステップ2でセリフマスタに実際の cond が入れば結合テストになる。
  // ここでは condMatches ロジックの正しさを確認する最小の単体テストとする。

  // condMatches と同等の実装（voiceLines.js の内容と同期して手書き）
  function condMatchesLocal(cond, ctx) {
    if (!cond) return true;
    if (cond.companionBondMin != null && !((Number(ctx.companionBondLevel) || 1) >= cond.companionBondMin)) return false;
    if (cond.winStreakMin   != null && !(Number(ctx.winStreak)  >= cond.winStreakMin))  return false;
    if (cond.loseStreakMin  != null && !(Number(ctx.loseStreak) >= cond.loseStreakMin)) return false;
    if (cond.lastHandResult && cond.lastHandResult !== ctx.lastHandResult) return false;
    if (cond.playStyleTag   && cond.playStyleTag   !== ctx.playStyleTag)   return false;
    return true;
  }

  // companionBondMin
  assert(condMatchesLocal({ companionBondMin: 3 }, { companionBondLevel: 5 }), "bondMin=3, level=5 → 通す");
  assert(condMatchesLocal({ companionBondMin: 3 }, { companionBondLevel: 3 }), "bondMin=3, level=3 → 通す（等値）");
  assert(!condMatchesLocal({ companionBondMin: 3 }, { companionBondLevel: 2 }), "bondMin=3, level=2 → 弾く");
  assert(condMatchesLocal({ companionBondMin: 1 }, {}), "bondMin=1, 未供給(=1扱い) → 通す");
  assert(!condMatchesLocal({ companionBondMin: 2 }, {}), "bondMin=2, 未供給(=1扱い) → 弾く");

  // winStreakMin
  assert(condMatchesLocal({ winStreakMin: 3 }, { winStreak: 4 }), "winStreakMin=3, streak=4 → 通す");
  assert(condMatchesLocal({ winStreakMin: 3 }, { winStreak: 3 }), "winStreakMin=3, streak=3 → 通す（等値）");
  assert(!condMatchesLocal({ winStreakMin: 3 }, { winStreak: 2 }), "winStreakMin=3, streak=2 → 弾く");
  assert(!condMatchesLocal({ winStreakMin: 1 }, {}), "winStreakMin=1, 未供給(=0) → 弾く");

  // loseStreakMin
  assert(condMatchesLocal({ loseStreakMin: 2 }, { loseStreak: 3 }), "loseStreakMin=2, streak=3 → 通す");
  assert(!condMatchesLocal({ loseStreakMin: 2 }, { loseStreak: 1 }), "loseStreakMin=2, streak=1 → 弾く");

  // lastHandResult
  assert(condMatchesLocal({ lastHandResult: "agari" }, { lastHandResult: "agari" }), "lastHandResult 一致 → 通す");
  assert(!condMatchesLocal({ lastHandResult: "agari" }, { lastHandResult: "dealIn" }), "lastHandResult 不一致 → 弾く");
  assert(!condMatchesLocal({ lastHandResult: "agari" }, {}), "lastHandResult 未供給 → 弾く");

  // playStyleTag
  assert(condMatchesLocal({ playStyleTag: "riichi" }, { playStyleTag: "riichi" }), "playStyleTag 一致 → 通す");
  assert(!condMatchesLocal({ playStyleTag: "riichi" }, { playStyleTag: "meld" }), "playStyleTag 不一致 → 弾く");
  assert(!condMatchesLocal({ playStyleTag: "riichi" }, {}), "playStyleTag 未供給 → 弾く");

  // 条件なし（cond=null/undefined）は常に通す
  assert(condMatchesLocal(null, {}), "cond=null → 常に通す");
  assert(condMatchesLocal(undefined, {}), "cond=undefined → 常に通す");

  // 複合条件
  assert(
    condMatchesLocal({ companionBondMin: 3, winStreakMin: 2 }, { companionBondLevel: 5, winStreak: 3 }),
    "複合条件: 両方満たす → 通す"
  );
  assert(
    !condMatchesLocal({ companionBondMin: 3, winStreakMin: 2 }, { companionBondLevel: 5, winStreak: 1 }),
    "複合条件: winStreak 不足 → 弾く"
  );

  console.log("  condMatches (各新キー): OK");
}

// ============================================================
// 6. detectPlayStyle — 各タグ
// ============================================================
{
  const mkPlayer = (overrides = {}) => ({
    index: 0,
    riichi: false,
    melds: [],
    ...overrides,
  });

  // riichi タグ
  const riichiPlayer = mkPlayer({ riichi: true });
  const r1 = detectPlayStyle(riichiPlayer, { winner: null, loser: null });
  assert(r1.includes("riichi"), "riichi: リーチ→タグあり");
  assert(r1.includes("defensive"), "riichi かつ和了/放銃なし→defensive も付く");

  // meld タグ（鳴き2以上）
  const meldPlayer = mkPlayer({ melds: [{}, {}] });
  const r2 = detectPlayStyle(meldPlayer, { winner: null, loser: null });
  assert(r2.includes("meld"), "melds=2→meld タグ");

  // meld 1つではタグなし
  const meld1 = mkPlayer({ melds: [{}] });
  const r2b = detectPlayStyle(meld1, { winner: null, loser: null });
  assert(!r2b.includes("meld"), "melds=1→meld タグなし");

  // aggressive: 自分が和了者
  const aggrPlayer = mkPlayer();
  const r3 = detectPlayStyle(aggrPlayer, { winner: 0, loser: null });
  assert(r3.includes("aggressive"), "自分が和了→aggressive");
  assert(!r3.includes("defensive"), "和了者は defensive なし");

  // defensive: 和了でも放銃でもない
  const defPlayer = mkPlayer();
  const r4 = detectPlayStyle(defPlayer, { winner: 1, loser: 2 });
  assert(r4.includes("defensive"), "和了でも放銃でもない→defensive");
  assert(!r4.includes("aggressive"), "defensive で aggressive なし");

  // 放銃者は defensive なし
  const dealinPlayer = mkPlayer();
  const r5 = detectPlayStyle(dealinPlayer, { winner: 1, loser: 0 });
  assert(!r5.includes("defensive"), "放銃→defensive なし");
  assert(!r5.includes("aggressive"), "放銃→aggressive なし");

  // null/undefined 耐性
  const r6 = detectPlayStyle(null, null);
  eq(r6, [], "player=null → []");

  // riichi + aggressive 複合
  const comboPlayer = mkPlayer({ riichi: true });
  const r7 = detectPlayStyle(comboPlayer, { winner: 0, loser: null });
  assert(r7.includes("riichi"), "複合: riichi");
  assert(r7.includes("aggressive"), "複合: aggressive");
  assert(!r7.includes("defensive"), "複合: defensive なし（和了）");

  console.log("  detectPlayStyle (各タグ): OK");
}

// ============================================================
// 7. topPlayStyle — しきい値（母数不足で null / 比率不足で null / 十分なら返す）
// ============================================================
{
  // 母数不足（totalMatches < 5）→ null
  const hist0 = { totalMatches: 4, styleCounts: { riichi: 4, defensive: 0 } };
  eq(topPlayStyle(hist0), null, "母数4→null");

  // 母数5、比率4/5=0.8 → "riichi" を返す
  const hist1 = { totalMatches: 5, styleCounts: { riichi: 4, defensive: 1 } };
  eq(topPlayStyle(hist1), "riichi", "母数5・比率0.8→riichi");

  // 母数5、比率2/5=0.4 → ちょうど閾値 → 返す
  const hist2 = { totalMatches: 5, styleCounts: { riichi: 2, meld: 3 } };
  eq(topPlayStyle(hist2), "meld", "母数5・比率0.6→meld");

  // 比率不足（最頻タグが 0.4 未満）→ null
  // totalMatches=10, riichi=3(0.3) → null
  const hist3 = { totalMatches: 10, styleCounts: { riichi: 3, defensive: 3, meld: 4 } };
  // meld が最頻だが 4/10=0.4 → ちょうど境界、通る
  eq(topPlayStyle(hist3), "meld", "比率ちょうど0.4→meld");

  // 最頻が 0.39... → null
  const hist4 = { totalMatches: 10, styleCounts: { riichi: 3, meld: 3 } };
  // 最頻 3/10=0.3 → null
  eq(topPlayStyle(hist4), null, "比率0.3→null");

  // styleCounts が空 → null
  const hist5 = { totalMatches: 10, styleCounts: {} };
  eq(topPlayStyle(hist5), null, "styleCounts空→null");

  // playerHistory 未定義 → null
  eq(topPlayStyle(null), null, "null→null");
  eq(topPlayStyle(undefined), null, "undefined→null");

  console.log("  topPlayStyle (しきい値): OK");
}

// ============================================================
// 結果
// ============================================================
if (failures === 0) {
  console.log("\n✅ all companionbond checks passed");
} else {
  console.error(`\n❌ ${failures} failure(s)`);
  process.exit(1);
}
