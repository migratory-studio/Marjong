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
//
// 大2章「炎を賭す者たちの記憶」（正典＝docs/roguelite-ch2-scenario-plot.md 承認済み 2026-07-10）。
//   縦軸＝『見る者のいなかった炎は、誰が覚えているのか』→ 答え＝火は、配っても減らない。
//   B1(F10)=問いの提示（顔のない灰の層）→ B2(F20)=確信（天界の帳面にも無い）→
//   B3(F30)=火の答え（燃えてりゃ顔が見える）→ B4(F40)=配る者の答え＋反転（あなたは綴られる側）。
//   口調：焔=熱血・俺（characterVoiceMaster HOMURA 準拠）／ルイナ=あたし・伝法な粋筋（design/ruina.json v3）／
//   ドラニエル=わらわ・のじゃ（design/doranie.json v3）。
//   ⚠️ 口癖の反転（いい目だ→いい目に、する 等）は各師匠編 ep20 の切り札＝楼光では使わない（口癖はそのまま）。

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

  // ════ 大2章「炎を賭す者たちの記憶」════════════════════════════════════

  // ── B1「顔のない夜」— F10（灰の門）。問いの提示：見られなかった記憶は、顔から灰になる。
  {
    id: "memory_two-b1",
    chapterId: "memory_two",
    floor: 10,
    title: "顔のない夜",
    lines: buildLines("memory_two-b1", [
      { bg: "bg-ruins", bgm: "bgm-mystery", se: "se-door", stand: [], text:
        "扉が、ひとりでに開く。——流れ込んでくるのは、夜の賭場の記憶。" },
      { bg: "bg-bar", stand: [], text:
        "卓を囲む影、牌の音、笑い声。だが——どの顔も、灰を被ったように暗い。" },
      { bg: "bg-bar", stand: [], text:
        "第一の記憶では、誰の顔も鮮やかだった。……見ていた誰かが、いたからだ。" },
      { bg: "bg-bar", stand: [st("doranie", "center")], speaker: "doranie", text:
        "おかしいのじゃ。下界の卓は、もっと顔がうるさいはずじゃぞ？" },
      { bg: "bg-bar", stand: [st("doranie", "center")], speaker: "doranie", text:
        "……ふむ、わかったのじゃ。ここは、誰にも見られておらんかった記憶の層じゃ。見る者のおらん記憶は、顔から先に灰になる。" },
      { bg: "bg-bar", stand: [st("doranie", "center")], speaker: "doranie", text:
        "じゃがのう——耳を澄ませてみよ。灰の下で、牌の音だけは、まだ熾きておる。" },
      { bg: "bg-ruins", stand: [], text:
        "賭けて、燃え尽きて、誰にも語られなかった夜が、幾重にも積もっている。——この塔の、誰も読まなかった頁。" },
    ]),
  },

  // ── B2「天界の帳面」— F20。確信：誰も見ていない、天すら見ていない。＋F30への引き（燃えたままの火）。
  {
    id: "memory_two-b2",
    chapterId: "memory_two",
    floor: 20,
    title: "天界の帳面",
    lines: buildLines("memory_two-b2", [
      { bg: "bg-ruins", bgm: "bgm-mystery", se: "se-door", stand: [], text:
        "扉の奥——雨に濡れた路地裏の卓。無言で打ち続ける影たち。ここにも、顔はない。" },
      { bg: "bg-street", stand: [st("doranie", "center")], speaker: "doranie", text:
        "わらわ、天界におった頃は、下界の卓がぜんぶ見えておったのじゃ。" },
      { bg: "bg-street", stand: [st("doranie", "center")], speaker: "doranie", text:
        "……じゃがな、この層の夜は——天界の帳面にも、無い。" },
      { bg: "bg-street", stand: [st("doranie", "center")], speaker: "doranie", text:
        "誰も見ておらん。天も見ておらん。そういう夜が、こんなに積もっておったとはのう……。" },
      { bg: "bg-street", stand: [st("doranie", "center")], text:
        "積もった灰の、ずっと奥。——ひとつだけ、火の色が見える。" },
      { bg: "bg-street", stand: [st("doranie", "center")], speaker: "doranie", text:
        "……おかしいのじゃ。灰の層のくせに、あそこだけ——燃えたままじゃぞ？" },
      { bg: "bg-ruins", stand: [], text:
        "誰にも見られないまま、燃え続けている火が——この先に、いる。" },
    ]),
  },

  // ── B3「燃えたまま」— F30（焔の門）。火の答え：燃えてりゃ、周りの顔が見える。＋ルイナの前振り。
  //   焔の追加設定はここで確定した2点のみ（独学＝灯を継がぬ側／ルイナに負けた夜が一度ある）。それ以上は彫らない。
  {
    id: "memory_two-b3",
    chapterId: "memory_two",
    floor: 30,
    title: "燃えたまま",
    lines: buildLines("memory_two-b3", [
      { bg: "bg-ruins", bgm: "bgm-warm", se: "se-door", stand: [], text:
        "扉の奥——夜の露店通り。ひとつの卓だけが、明るい。" },
      { bg: "bg-festival", stand: [], text:
        "卓を囲む顔が、見える。灰の層で初めて見る、名もなき者たちの顔。——火が、照らしている。" },
      { bg: "bg-festival", stand: [st("homura", "center")], speaker: "homura", text:
        "よう。辛気くせえ層だろ、ここは。……だから俺は燃やしてんだよ。毎晩な。" },
      { bg: "bg-festival", stand: [st("homura", "center")], speaker: "homura", text:
        "見てるやつがいなきゃ燃えねえのかって？　逆だろ。燃えてりゃ、周りの顔が見えるんだ。俺の卓は、いつだって明るかったぜ。" },
      { bg: "bg-festival", stand: [st("doranie", "left"), st("homura", "right")], speaker: "doranie", text:
        "ふぉっふぉ、豪気なやつじゃのう！　じゃがぬし、その燃え方——誰に習うた？" },
      { bg: "bg-festival", stand: [st("doranie", "left"), st("homura", "right")], speaker: "homura", text:
        "習っちゃいねえよ、誰にもな。……ただ一晩だけ、でかすぎる火を見たことがある。——紫の、女だ。" },
      { bg: "bg-festival", stand: [st("doranie", "left"), st("homura", "right")], text:
        "その名を、この層の誰もが知っていた。自分の顔は忘れられても、あの女に負けた夜だけは、誰もが語れる。" },
      { bg: "bg-festival", bgm: "bgm-mystery", stand: [st("doranie", "left"), st("homura", "right")], speaker: "homura", text:
        "俺もあの夜は取り返せてねえ。……先へ行くなら教えといてやる。あの火は——賭けても、減らねえぞ。" },
    ]),
  },

  // ── B4「配られた夜」— F40（章踏破）。答え：火は配っても減らない。反転：あなたは綴られる側。踏破演出の直前に流す。
  {
    id: "memory_two-b4",
    chapterId: "memory_two",
    floor: 40,
    title: "配られた夜",
    lines: buildLines("memory_two-b4", [
      { bg: "bg-ruins", bgm: "bgm-night", stand: [], text:
        "最後の扉。——この先に、彼女の記憶があるはずだった。" },
      { bg: "bg-black", se: "se-door", stand: [], text:
        "——開く。部屋は、ひとつではない。無数の夜の断片。全部、違う誰かの目で見た——同じ女。" },
      { bg: "bg-bar", stand: [st("kakeha_ruina", "center")], speaker: "kakeha_ruina", text:
        "……おや。あたしの底を覗きに来たのかい。いい度胸だ。" },
      { bg: "bg-bar", stand: [st("doranie", "left"), st("kakeha_ruina", "right")], speaker: "doranie", text:
        "ルイナ。ぬし、記憶を持っておらんのか？" },
      { bg: "bg-bar", stand: [st("doranie", "left"), st("kakeha_ruina", "right")], speaker: "kakeha_ruina", text:
        "持たないのさ。あたしは配って歩く側でね。——負けた夜ってのは、一生ものだろう？　みんな、大事に持って帰るのさ。" },
      { bg: "bg-bar", stand: [st("doranie", "left"), st("kakeha_ruina", "right")], speaker: "doranie", text:
        "……わかったのじゃ。下の兄ちゃんが言うておった、賭けても減らぬ火——配っても、減らぬのじゃな。" },
      { bg: "bg-bar", stand: [st("doranie", "left"), st("kakeha_ruina", "right")], speaker: "kakeha_ruina", text:
        "あたりまえさ。火ってのは、そういうものだよ。" },
      { bg: "bg-bar", stand: [st("doranie", "left"), st("kakeha_ruina", "right")], speaker: "kakeha_ruina", text:
        "ふふ。……ところで、あんた。気づいてるかい。" },
      { bg: "bg-bar", stand: [st("doranie", "left"), st("kakeha_ruina", "right")], speaker: "kakeha_ruina", text:
        "この塔であんたが越えてきた、顔のない連中——あんたとの一局だけは、顔つきで覚えて帰ってるよ。" },
      { bg: "bg-black", bgm: "bgm-resolve", stand: [], text:
        "思い返す。幾つもの夜、幾つもの卓。読む側のつもりで、登ってきた。——綴られる側に、なっていた。" },
      { bg: "bg-bar", stand: [st("doranie", "left"), st("kakeha_ruina", "right")], speaker: "doranie", text:
        "ふぉっふぉ、よい夜じゃったのう！　下界の麻雀は、最高じゃのう！" },
      { bg: "bg-bar", stand: [st("doranie", "left"), st("kakeha_ruina", "right")], speaker: "kakeha_ruina", text:
        "……いい目だ。また張りにおいで。次はあんたの夜を、誰かが語る番さ。" },
      { bg: "bg-ruins", stand: [], text:
        "塔の光が、熾火のように脈打つ。——第二の記憶が、読み終わる。" },
    ]),
  },
];

// 章×階で該当ビートを引く（無ければ null）。発火判定は呼び元（本戦ボス勝利・初回のみ）で行う。
export function beatForFloor(chapterId, floor) {
  return ROGUELITE_BEAT_MASTER.find((b) => b.chapterId === chapterId && b.floor === floor) || null;
}
