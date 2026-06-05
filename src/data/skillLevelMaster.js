// スキル Lv マスタ — major_update_specification.md §10.5 / §16.2。
//
// levelTableId ごとに Lv1〜Lv10 を定義する。スキル Lv は 2 帯に分かれる（§10.5）:
//   - 基準帯 Lv1〜5 … 通常育成／フリー対戦の固定値。Lv5＝完成基準（上限）
//       - 育成開始のマイキャラ … Lv1（能力習得・能力変更直後の初期値）
//       - フリー対戦の既存キャラ／師匠 … Lv5（到達目標・対戦基準）
//       - Lv5 の runtimeParams を既存キャラの現行性能と一致させる想定
//   - 超越帯 Lv6〜10 … 育成反映でのみ到達。フリー対戦には出現させない。
//       基準帯を上回る強化（派生効果の追加・効果量上振れ）はこの帯に置く。
//
// soulCost はその Lv へ「到達する」ための費用（Lv1 は初期値なので 0）。超越帯は
// 基準帯より急勾配にしてプレミアム化する。
// runtimeParams は対局投入時パラメータ。Phase 2B では保存・表示・育成までを使い、
// 数値差分の対局反映は対応済みテンプレートだけ Phase 7 で行う（§10.5 初期方針）。
//                   Lv1   2    3    4    5  |    6     7     8     9    10
const COST_CURVE = [   0, 150, 300, 500, 800, 1200, 1700, 2300, 3000, 4000];

// 6 系統ぶんの Lv テーブルを共通カーブで生成する。unlockDescription だけ
// テンプレートごとに味付けし、育成画面で「この Lv で何が変わるか」を伝える。
// 各系統 10 段階（基準帯 Lv1〜5＋超越帯 Lv6〜10）の説明を渡す。
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
    "超越域へ。引き寄せる有利牌の幅が広がる。",
    "ツモの先読みが一段深くなる。",
    "高め・ドラ絡みを優先して引く。",
    "連続発動でも精度が落ちない。",
    "育成の極致。ほぼ理想のツモが続く。",
  ]),
  "lv-chunchan": buildTable([
    "中張牌の速攻が発動する基礎。",
    "タンヤオ移行が安定する。",
    "手数の押し付けが速くなる。",
    "鳴き判断の精度が上がる。",
    "師匠相当。速攻が完成する。",
    "超越域へ。中張の呼び込みが鋭くなる。",
    "タンヤオ移行がほぼ途切れない。",
    "鳴き判断が最適化される。",
    "終盤まで手数の優位を保つ。",
    "育成の極致。速攻が止まらない。",
  ]),
  "lv-iron-guard": buildTable([
    "鉄壁の守りが発動する基礎。",
    "無失点の継続が長くなる。",
    "発動コストが軽くなる。",
    "発動回数が増える。",
    "師匠相当。鉄壁が完成する。",
    "超越域へ。無失点の持続が伸びる。",
    "発動コストがさらに軽くなる。",
    "発動回数が大きく増える。",
    "守備の穴がほぼ無くなる。",
    "育成の極致。鉄壁が崩れない。",
  ]),
  "lv-danger-sense": buildTable([
    "危険牌察知の基礎。",
    "見抜ける危険牌が増える。",
    "読みの精度が上がる。",
    "終盤の放銃回避が安定する。",
    "師匠相当。危険察知が完成する。",
    "超越域へ。見抜ける危険牌が一段増える。",
    "読みが終盤までぶれない。",
    "複数リーチでも精度を保つ。",
    "放銃をほぼ回避する。",
    "育成の極致。場のすべてが見える。",
  ]),
  "lv-gamble-bet": buildTable([
    "点棒の賭けが発動する基礎。",
    "賭け倍率が安定する。",
    "賭け金の選択肢が広がる。",
    "失敗時の損失が緩和される。",
    "師匠相当。博打が完成する。",
    "超越域へ。賭け倍率の上限が上がる。",
    "賭け金の選択肢がさらに広がる。",
    "失敗時の損失が大きく緩和される。",
    "高倍率でも安定して通る。",
    "育成の極致。博打が必殺になる。",
  ]),
  "lv-dora-pull": buildTable([
    "ドラ手繰りの基礎。",
    "集めるドラ枚数が増える。",
    "打点の伸びが安定する。",
    "終盤までドラを抱えやすい。",
    "師匠相当。ドラ手繰りが完成する。",
    "超越域へ。集まるドラ枚数が増える。",
    "打点の伸びが一段上がる。",
    "終盤までドラを抱え切る。",
    "守りの脆さを補い始める。",
    "育成の極致。一撃が決定的になる。",
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
