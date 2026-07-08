// 楼光の館・記憶ビート マスタ — 章の物語を要所で見せる短い群像シーン（紙芝居・インライン再生）。
//
// 提案B「記憶の塔」のナラティブ層（正典＝docs/roguelite-ch1-scenario-draft.md 承認済み 2026-07-07）。
// 大1章「還らぬ師の記憶」の縦軸＝『この記憶は、誰のものか』→ 答え＝亡き師のまなざし。
// B1(F10)=違和感の提示 → B2(F20)=確信 → B3(F30)=反転（空席の卓＝待たれていたのはあなた）。
//
// 発火＝配役ボス階（bossFloors）の本戦を退けた直後・**初回のみ**（既読は profile.roguelite.beatsSeen）。
// 再生＝playScenario(null, { lines })（プロローグと同じインライン再生＝scenario-forge 非経由）。
//
// 設計制約（docs たたき台 §2 で確定）:
//   ・話者は「記憶の群像」（章cast）＋地の文のみ。相棒(party先頭)は任意キャラなので台詞に使わない。
//   ・「いま倒した相手」を名指ししない（配役キャラ編成中のモブ退避 edge case を回避＝
//     「扉が開き、記憶が流れ込む」フレーミングで書く）。
//   ・師（先代九蓮宝士）は声のみ（speakerNameOverride「？？？」・立ち絵なし）＝正典「容姿未確定・盛りすぎない」。
//   ・背景/BGM/SE は実リソースのみ（backgroundMaster / scenarioAudioMaster に実在する id だけ使う）。
//
// 口調の正典：詩玥=中華娘・我(ウォ)／凌雲=さわやかな静・僕／真守=冷静デジタル・私／
//   姚玖=寡黙クール・俺・「揃うと、いいな」／春嬋=早口世話焼き・うち・「間に合わせる」「兄さん」
//   （姚玖/春嬋は scenario-forge design/yao_chu.json・chun_chan.json designVersion 2 準拠）。

// 行ビルダ：{ bg, bgm?, se?, speaker?, name?, stand, text } → scenarioPlayer 行形式（lineNo 自動採番）。
function buildLines(beatId, rows) {
  return rows.map((r, idx) => ({
    scenarioId: `rl-beat-${beatId}`,
    lineNo: idx + 1,
    speakerCharacterId: r.speaker || null,
    speakerNameOverride: r.name || null,
    text: r.text,
    standings: r.stand || [],
    backgroundId: r.bg,
    bgmId: r.bgm,
    seId: r.se,
  }));
}

const st = (characterId, position) => ({ characterId, position });

export const ROGUELITE_BEAT_MASTER = [
  // ── B1「降りない人」— F10（真守の門）。視点の違和感を最初に植える。
  {
    id: "mentor-b1",
    chapterId: "mentor",
    floor: 10,
    title: "降りない人",
    lines: buildLines("mentor-b1", [
      { bg: "bg-ruins", bgm: "bgm-mystery", se: "se-door", stand: [], text:
        "扉が、ひとりでに開く。——塔の奥から、記憶が流れ込んでくる。" },
      { bg: "bg-rain", stand: [], text:
        "雨の日の道場。若い打ち手がひとり、灯りの下で牌譜を並べ続けている。何度も、何度も。" },
      { bg: "bg-rain", stand: [st("mamori", "center")], speaker: "mamori", text:
        "……これは、私の記憶です。あの日は一日中、降りの練習をしていました。" },
      { bg: "bg-rain", stand: [st("mamori", "center")], speaker: "mamori", text:
        "——おかしいですね。私の記憶なら、視点は私のはず。なのにこれは、私を少し離れて見ている。" },
      { bg: "bg-rain", stand: [st("mamori", "center")], speaker: "mamori", text:
        "戸口から、誰かがずっと見ていた。急かしもせず、咎めもせず。……誰だったかは、言うまでもないでしょう。" },
      { bg: "bg-rain", stand: [st("mamori", "center")], text:
        "記憶の中の視線は、ただ静かで、長い。" },
      { bg: "bg-ruins", stand: [st("mamori", "center")], speaker: "mamori", text:
        "先へ。……この塔の記憶が誰のものか——あなたも、確かめたくなったはずです。" },
    ]),
  },

  // ── B2「同期三人」— F20（兄弟弟子の間）。喪失前の暖かさ＋凌雲の悔い一滴＋答えの確信。
  {
    id: "mentor-b2",
    chapterId: "mentor",
    floor: 20,
    title: "同期三人",
    lines: buildLines("mentor-b2", [
      { bg: "bg-ruins", bgm: "bgm-warm", se: "se-door", stand: [], text:
        "扉の奥から、こんどは笑い声が流れ込んでくる。" },
      { bg: "bg-dojo-night", stand: [], text:
        "夜の道場。三人分の声。誰かが盛大に振り込んで、誰かが笑い転げている。" },
      { bg: "bg-dojo-night", stand: [st("shiyue", "left"), st("kuidoshi", "right")], speaker: "shiyue", text:
        "わー、懐かしいネ！ これ、我が真守に振り込んで晩ごはん奢った日ヨ。……アレ？ でも、変ダヨ。" },
      { bg: "bg-dojo-night", stand: [st("shiyue", "left"), st("kuidoshi", "right")], speaker: "shiyue", text:
        "我の記憶なら、我の目から見えるはずネ。なのに我も、凌雲も、真守も——みんな映ってるヨ。" },
      { bg: "bg-dojo-night", stand: [st("shiyue", "left"), st("kuidoshi", "right")], speaker: "kuidoshi", text:
        "……三人とも映っている記憶を、見られる者は。——ひとりしか、いない。" },
      { bg: "bg-dojo-night", stand: [st("shiyue", "left"), st("kuidoshi", "right")], speaker: "kuidoshi", text:
        "……僕はあの頃、卓の外が見えていなかった。護るべきものは、すぐ隣にあったのに。" },
      { bg: "bg-dojo-night", bgm: "bgm-mystery", stand: [st("shiyue", "left"), st("kuidoshi", "right")], speaker: "shiyue", text:
        "……ねえ。この塔、我たちの記憶を映してるんじゃないネ。我たちを見てた誰かの記憶を、映してるんだヨ。" },
      { bg: "bg-ruins", stand: [], text:
        "口にした名は、なかった。言わなくても——きっと、全員がわかっていた。" },
    ]),
  },

  // ── B3「空席の卓」— F30（御庭番の扉＝章踏破）。反転：待たれていたのはあなた。踏破演出の直前に流す。
  {
    id: "mentor-b3",
    chapterId: "mentor",
    floor: 30,
    title: "空席の卓",
    lines: buildLines("mentor-b3", [
      { bg: "bg-ruins", bgm: "bgm-sorrow", stand: [st("yao_chu", "left"), st("chun_chan", "right")], speaker: "yao_chu", text:
        "……ここから先は、父さんの一番奥の記憶だ。荒らされたくなくて、ずっと二人で守ってきた。" },
      { bg: "bg-ruins", stand: [st("yao_chu", "left"), st("chun_chan", "right")], speaker: "chun_chan", text:
        "でも兄さん、この人、もう何度もここまで登ってきたんだよ？ ……父さんの記憶のほうが、とっくにこの人を覚えてるって。" },
      { bg: "bg-ruins", se: "se-door", stand: [st("yao_chu", "left"), st("chun_chan", "right")], text:
        "最後の扉が、開く。" },
      { bg: "bg-washitsu", bgm: "bgm-warm", stand: [], text:
        "——なんでもない、昼下がり。門下の全員が、ひとつの卓を囲んでいる。" },
      { bg: "bg-washitsu", stand: [st("shiyue", "left"), st("kuidoshi", "center"), st("mamori", "right")], text:
        "詩玥が笑い、凌雲が茶を淹れ、真守が黙々と理牌する。庭先で、姚玖と春嬋が点棒を数えている。" },
      { bg: "bg-washitsu", stand: [st("shiyue", "left"), st("kuidoshi", "center"), st("mamori", "right")], text:
        "卓に、席がひとつ空いている。——師の席では、ない。" },
      { bg: "bg-washitsu", stand: [], name: "？？？", text:
        "——いつかこの卓に、わしの知らん誰かが座る。おまえたちの、その先の誰かじゃ。……それが、見たい。" },
      { bg: "bg-washitsu", stand: [], text:
        "気づいてしまう。この塔で、幾度も卓に着いてきたのは——空いていたその席に、座りに来ていたのは。" },
      { bg: "bg-ruins", bgm: "bgm-resolve", stand: [st("yao_chu", "left"), st("chun_chan", "right")], speaker: "chun_chan", text:
        "……ねえ、兄さん。父さんの願い、まだ続いてるんだ。——なら、うちら、まだ間に合うんだよ。" },
      { bg: "bg-ruins", stand: [st("yao_chu", "left"), st("chun_chan", "right")], speaker: "yao_chu", text:
        "ああ。還らない人の記憶が、まだ先を見たがってる。……なら、俺たちの守るものも、変わらない。" },
      { bg: "bg-ruins", stand: [st("yao_chu", "left"), st("chun_chan", "right")], text:
        "姚玖は、記憶の奥——空いたままの席を、長く見ていた。" },
      { bg: "bg-ruins", stand: [st("yao_chu", "left"), st("chun_chan", "right")], speaker: "yao_chu", text:
        "……また——揃うと、いいな。" },
      { bg: "bg-ruins", stand: [], text:
        "塔の光が、やわらかく脈打つ。——第一の記憶が、読み終わる。" },
    ]),
  },
];

// 章×階で該当ビートを引く（無ければ null）。発火判定は呼び元（本戦ボス勝利・初回のみ）で行う。
export function beatForFloor(chapterId, floor) {
  return ROGUELITE_BEAT_MASTER.find((b) => b.chapterId === chapterId && b.floor === floor) || null;
}
