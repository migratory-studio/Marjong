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
        { role: "背景素材", name: "みんちりえ" },
        { role: "背景素材", name: "くらげ（BOOTH）" },
        { role: "背景素材", name: "ゲームまてりあるず" },
        { role: "音楽素材", name: "PeriTune" },
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
    // ビビ＝口癖『沈まない』の主語が“あなた”へ反転＋最後の言葉『いってきます』（design/bibi.json 覇道編）。
    bibi: ["「だいじょうぶ。あなたは、もう沈まない。", "　……ビビも、いってくるね。」"],
    // 賭羽ルイナ＝口癖『いい目だ』が『いい目に、する』へ反転（運命任せ→自分で掴む）。後日譚は飄々と“相棒と次も張る”（design/ruina.json 覇道編・ep20）。
    kakeha_ruina: ["「——いい目だ。いや、いい目に、したのさ。", "　次も、派手に張ろうね。相棒。」"],
    // 凌雲＝口癖なし。座右の銘“なりたい自分を知っている”＋弟子を次へ送り出す（design/ryuuun.json 覇道編・ep20）。
    kuidoshi: ["「——次は、君が、誰かの“なりたい姿”になる番だ。", "　いってらっしゃい、ネ。」"],
  },
  lastLineDefault: ["「——また、打とう。」"],
};
