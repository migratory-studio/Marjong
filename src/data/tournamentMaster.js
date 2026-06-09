// 大会マスタ — major_update_specification.md §4.6.5 / §4.5.2（Phase 4B）。
//
// 大会＝育成成果を試す連戦。autobattle を maxMatches 連戦し、runHp を持ち越す（§4.6.3）。
// 完走でクリア評価（勝率→ランク）＋継承（メタ通貨）＋ tournament_won（シナリオ解放ゲート）。
// 出場ゲート：相手評価が「大劣勢」だと門前払い（§4.6.2）。数値は仮・チューニング前提。
export const TOURNAMENT_MASTER = [
  {
    id: "beginner",
    name: "初級大会・宝への道",
    matches: 3,        // 連戦数
    oppLv: 2,          // 相手 param Lv（paramsFromLv）
    oppHpMax: 8000,    // 相手の点棒
    soulClear: 500,    // 完走ソウル
    // 勝率（連対数 / matches）→ 評価ランク（§4.5.2・満貫級が下限）と継承（メタ通貨）量。
    evalRanks: ["満貫級", "跳満級", "倍満級", "三倍満級"], // wins 0..3
    metaByWins: [1, 1, 2, 3],
  },
];

export const tournamentById = (id) => TOURNAMENT_MASTER.find((t) => t.id === id) || TOURNAMENT_MASTER[0];
