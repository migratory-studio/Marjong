// スキル Lv マスタ — major_update_specification.md §10.5 / §16.2。
//
// levelTableId ごとに Lv1〜Lv5 を定義する。スキル Lv の基準（§10.5）:
//   - 育成開始のマイキャラ … Lv1（能力習得・能力変更直後の初期値）
//   - フリー対戦の既存キャラ／師匠 … Lv5（到達目標・対戦基準）
// そのため最低でも Lv1〜Lv5 をカバーし、Lv5 の runtimeParams を既存キャラの
// 現行性能と一致させる想定（実際のランタイム反映は Phase 7）。
//
// soulCost はその Lv へ「到達する」ための費用（Lv1 は初期値なので 0）。
// runtimeParams は対局投入時パラメータ。Phase 2B では保存・表示・育成までを使い、
// 数値差分の対局反映は対応済みテンプレートだけ Phase 7 で行う（§10.5 初期方針）。
const COST_CURVE = [0, 150, 300, 500, 800]; // Lv1..Lv5 への到達費用

// 6 系統ぶんの Lv テーブルを共通カーブで生成する。unlockDescription だけ
// テンプレートごとに味付けし、育成画面で「この Lv で何が変わるか」を伝える。
function buildTable(unlockDescriptions) {
  return unlockDescriptions.map((desc, i) => ({
    skillLevel: i + 1,
    soulCost: COST_CURVE[i] ?? 0,
    runtimeParams: {}, // Phase 7 で各能力の効果量を割り当てる
    maxChargesOverride: null,
    cooldownOverride: null,
    unlockDescription: desc,
  }));
}

export const SKILL_LEVEL_MASTER = {
  "lv-lucky-draw": buildTable([
    "幸運のツモが発動する基礎。",
    "ツモの引き寄せが安定する。",
    "高め牌を引く確率が上がる。",
    "連続発動の取りこぼしが減る。",
    "師匠相当。ツモ運が完成する。",
  ]),
  "lv-chunchan": buildTable([
    "中張牌の速攻が発動する基礎。",
    "タンヤオ移行が安定する。",
    "手数の押し付けが速くなる。",
    "鳴き判断の精度が上がる。",
    "師匠相当。速攻が完成する。",
  ]),
  "lv-iron-guard": buildTable([
    "鉄壁の守りが発動する基礎。",
    "無失点の継続が長くなる。",
    "発動コストが軽くなる。",
    "発動回数が増える。",
    "師匠相当。鉄壁が完成する。",
  ]),
  "lv-danger-sense": buildTable([
    "危険牌察知の基礎。",
    "見抜ける危険牌が増える。",
    "読みの精度が上がる。",
    "終盤の放銃回避が安定する。",
    "師匠相当。危険察知が完成する。",
  ]),
  "lv-gamble-bet": buildTable([
    "点棒の賭けが発動する基礎。",
    "賭け倍率が安定する。",
    "賭け金の選択肢が広がる。",
    "失敗時の損失が緩和される。",
    "師匠相当。博打が完成する。",
  ]),
  "lv-dora-pull": buildTable([
    "ドラ手繰りの基礎。",
    "集めるドラ枚数が増える。",
    "打点の伸びが安定する。",
    "終盤までドラを抱えやすい。",
    "師匠相当。ドラ手繰りが完成する。",
  ]),
};

export function skillLevelEntry(tableId, level) {
  return (SKILL_LEVEL_MASTER[tableId] || []).find((e) => e.skillLevel === level) || null;
}

// 次の Lv のエントリ（最大なら null）。育成画面の費用表示・強化可否に使う。
export function nextSkillLevel(tableId, level) {
  return (SKILL_LEVEL_MASTER[tableId] || []).find((e) => e.skillLevel === level + 1) || null;
}

export function maxSkillLevel(tableId) {
  const t = SKILL_LEVEL_MASTER[tableId] || [];
  return t.length ? t[t.length - 1].skillLevel : 0;
}
