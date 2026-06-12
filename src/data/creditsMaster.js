// クレジット（スタッフロール）マスタ — creditsRoll.js が描画する文言の正典。
//
// 後から人や役職が増えたら sections に行を足すだけ（描画コードに文言を書かない）。
// キャストは CHARACTER_MASTER から自動生成（＋最後に弟子＝プレイヤー名）なのでここには書かない。
// 締めの一言は師匠別（lastLineByMentor）＝誰の物語を歩いたかで最後の声が変わる。
export const CREDITS_MASTER = {
  title: "九蓮宝士",
  subtitle: "— ツモれば、ふたりの勝ち —",
  sections: [
    {
      heading: "スタッフ",
      rows: [
        { role: "企画・原案・ディレクション", name: "乃木回遊" },
        { role: "シナリオ・世界観", name: "乃木回遊" },
        { role: "ゲームデザイン・開発", name: "乃木回遊" },
        { role: "UI素材", name: "こぱんだ屋" },
        { role: "開発協力", name: "Claude（Anthropic）" },
      ],
    },
    {
      heading: "Special Thanks",
      rows: [
        { name: "卓を囲んでくれた、すべての打ち手たちへ" },
      ],
    },
  ],
  fin: "Thank you for playing!",
  // 締めの一言（行配列＝改行）。師匠未定義は lastLineDefault。
  lastLineByMentor: {
    shiyue: ["「——ツモれば勝ち、ダヨ。", "　また打とうネ、相棒。」"],
  },
  lastLineDefault: ["「——また、打とう。」"],
};
