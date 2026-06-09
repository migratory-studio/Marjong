// 大会マスタ — major_update_specification.md §4.6.10（Phase 4B / M リーグ制）。
//
// 大会＝**M リーグ制**：各「節」は半荘（東南戦・25000 持ち点）。素点（(最終−25000)/1000）＋
// 順位点（ウマ）でその節のポイントを出し、**節をまたいで累積**。最終の累積ポイント順位で評価。
// 失敗なし路線（§4.5.2）：トビ終了はあるが大会脱落はせず、全節を打ち切る。最終1位＝優勝。
export const TOURNAMENT_MASTER = [
  {
    id: "beginner",
    name: "初級リーグ・宝への道",
    matches: 3,                 // 節数（半荘の本数）
    rounds: 2,                  // 各節＝半荘（東南戦）
    gateOppLv: 2,               // 出場ゲート判定用の相手 param Lv
    rivalLv: 2,                 // ライバル（モブ）の param Lv（将来 mobLvBand）
    uma: [50, 10, -10, -30],    // 順位点（M リーグ準拠：1位+50 / 2位+10 / 3位△10 / 4位△30）
    // 弟子の最終順位(0..3) → クリア評価ランク（§4.5.2・満貫級が下限）と継承（メタ通貨）量。
    rankByPlace: ["役満級", "倍満級", "跳満級", "満貫級"],
    metaByPlace: [5, 3, 2, 1],
    soulClear: 500,             // 完走ソウル
  },
];

export const tournamentById = (id) => TOURNAMENT_MASTER.find((t) => t.id === id) || TOURNAMENT_MASTER[0];
