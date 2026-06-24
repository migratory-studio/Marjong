// 師弟ホームの「師匠の一言」(homeGreeting) と「休憩の2択コミュ」(restTalk)。
// 対局セリフ(characterVoiceMaster)とは別系統。状況連動＋プレイヤーの選択を“覚える”（双方向）。
//
// ── 解決ロジック ──
//   pickMentorGreeting(charId, ctx) : 状況に一致する一言を1つ返す（より具体的な条件を優先）。
//   pickRestTalk(charId, ctx)       : 休憩の2択（prompt＋choices[2]）を1つ返す。
//
// ── ctx 語彙（任意・無ければ既定で評価。指定の無い行は常に候補＝フォールバック）──
//   condTier   : 弟子の調子 tone  "vbad"|"bad"|"ok"|"good"|"vgood"
//   time       : 月内の時期      "asa"|"hiru"|"yoru"（その月の行動数 0/1/2+ ＝上旬/中旬/下旬。
//                キー名は旧仕様の名残。1ターン=1ヶ月の縮尺）
//   bondMin    : 絆Lv 下限
//   lastOutcome: 直近の訓練結果  "daiseikou"|"shippai"（最近のみ）
//   afterChoice: 直近の休憩2択で覚えたタグ（双方向の呼び戻し）
//   phase      : 育成フェーズ    "shitei"|"hadou"（師弟編の最終章読了で hadou。scenarioService.mentorPhase）
//
// choices[].memory がプレイヤーの選択タグ。profile.mentorMemory.lastChoice に保存され、
// 次回以降の greeting の cond.afterChoice で参照される（＝“覚えている”手触り）。
//
// 文言の真実は本体（このファイル）。scenario-forge には reference/mentor-home-lines.md で要件を渡す。
import { CHARACTER_MASTER } from "./characterMaster.js";

const G = (cond, text) => ({ cond, text });
const RT = (cond, prompt, choices) => ({ cond, prompt, choices });

function gMatch(cond, ctx) {
  if (!cond) return true;
  if (cond.condTier && cond.condTier !== ctx.condTier) return false;
  if (cond.time && cond.time !== ctx.time) return false;
  if (cond.bondMin != null && !((ctx.bondLevel || 1) >= cond.bondMin)) return false;
  if (cond.lastOutcome && cond.lastOutcome !== ctx.lastOutcome) return false;
  if (cond.afterChoice && cond.afterChoice !== ctx.afterChoice) return false;
  if (cond.phase && cond.phase !== (ctx.phase || "shitei")) return false;
  if (cond.cleared && !ctx.cleared) return false;                              // 九蓮宝士達成後のみ
  if (cond.treasuresMin != null && !((ctx.treasures || 0) >= cond.treasuresMin)) return false; // 宝n個以上＝物語の終盤
  return true;
}

// 未実装キャラ用テンプレ（grep キーワード ［テンプレ］ つき）。
function templateGreetings(name) {
  const t = (l) => `［テンプレ］${name}・${l}：ここに一言が入ります`;
  return [
    G({}, t("ホーム挨拶")),
    G({ time: "asa" }, t("月初めの挨拶")),
    G({ time: "yoru" }, t("月末の挨拶")),
    G({ condTier: "vgood" }, t("弟子が絶好調")),
    G({ condTier: "vbad" }, t("弟子が絶不調")),
    G({ lastOutcome: "daiseikou" }, t("前回大成功への反応")),
    G({ lastOutcome: "shippai" }, t("前回失敗へのフォロー")),
    G({ phase: "hadou" }, t("覇道編の挨拶")),
  ];
}
function templateRestTalks(name) {
  const t = (l) => `［テンプレ］${name}・${l}`;
  return [
    RT({}, t("休憩の問いかけ"), [
      { key: "a", label: t("選択A"), reply: t("Aへの反応"), memory: "a" },
      { key: "b", label: t("選択B"), reply: t("Bへの反応"), memory: "b" },
    ]),
  ];
}

// ── 詩玥（シ・ユエ）── 楽天・軽口。素性（深謀遠慮／恩師の喪失／点棒嫌い）は絆が深いほど滲む。
const SHIYUE_GREET = [
  G({}, "今月はどうする？ まずは一息つくか、腕を磨くか。"),
  G({}, "さ、修行の時間ネ。我（ウォ）がしっかり見ててやるダヨ。"),
  G({ time: "asa" }, "新しい月が来たヨ。今月も、ツモっていこ？"),
  G({ time: "hiru" }, "お、まだ動けるネ。月なかばの一打、いっとく？"),
  G({ time: "yoru" }, "今月もそろそろ終わりネ。最後にもうひと頑張り？　無理は禁物だけどヨ。"),
  G({ condTier: "vgood" }, "うわ、いい顔してるヨ！　乗ってる月は伸びるダヨ、いっとこ？"),
  G({ condTier: "good" }, "調子よさそうネ。この波、逃さないでヨ。"),
  G({ condTier: "bad" }, "ちょっと重そう？　ま、そういう月もあるダヨ。"),
  G({ condTier: "vbad" }, "……顔色、よくないネ。今月は休むのも修行だヨ？　無理しないで。"),
  G({ lastOutcome: "daiseikou" }, "この前のアレ、見事だったネ！　その調子で頼むヨ、相棒。"),
  G({ lastOutcome: "shippai" }, "この前はうまくいかなかったネ。……気にすんな、次があるダヨ。"),
  G({ afterChoice: "honest" }, "この前『しんどい』って言ってたネ。今月は……ちゃんと見とくから、言ってヨ？"),
  G({ afterChoice: "tough" }, "前は強がってたけど、ホントに平気ネ？　ま、その意気は好きだヨ。"),
  G({ afterChoice: "scary" }, "点棒、こわいって言ってたネ。……だいじょぶ、減ったらツモで返せばいいダヨ。"),
  // 大会敗北の夜の2択（leagueLossTalk）への呼び戻し＝負けた約束を覚えている。
  G({ afterChoice: "again" }, "この前『すぐ雪辱したい』って言ってたネ。……その顔、ちゃんと火が残ってるヨ。今月、獲りにいこ？"),
  G({ afterChoice: "rest" }, "負けた夜、ちゃんと休めた？　……無理に強がらないお前のこと、我は結構買ってるんだヨ。"),
  G({ bondMin: 3 }, "……なんか、お前といると調子が出るんダ。我のほうが、ネ。"),
  // 絆の階段（素性の段階開示）：Lv6＝読みの過去に初めて触れる（第8話「見られなかったツモ」の頃）。
  G({ bondMin: 6 }, "……我サ、人の手を読むの、ほんとは得意だったんだヨ。でも、お前の手だけは——読まなくても、わかる気がするんダ。"),
  // ── 覇道編（師弟編フィナーレ読了後）── 外の強豪の卓へ。高揚の中に、過去がときどき滲む。
  G({ phase: "hadou" }, "ここから先は覇道ネ。外の卓は空気がピリッとしてるヨ。……ふふ、嫌いじゃないダロ？"),
  G({ phase: "hadou" }, "強い奴ほど、いい顔で打つんダヨ。我らも負けてられないネ。"),
  G({ phase: "hadou", time: "asa" }, "覇道の月初めネ。残りの宝、ぜんぶ獲りにいくヨ。——もちろん、二人でネ。"),
  G({ phase: "hadou", condTier: "vgood" }, "その目、覇道の卓でも通じる目だヨ。今月は大きく獲りにいこ？"),
  G({ phase: "hadou", condTier: "vbad" }, "覇道は長いんダ。沈む月があってもいい。……ツモれば勝ち、は逃げないヨ。"),
  G({ phase: "hadou", bondMin: 4 }, "……覇道の卓にいるとサ、たまに昔の我とすれ違う気がするんダ。……ん、独り言ネ。忘れて？"),
  // 覇道編×高絆：深謀遠慮（昔の呼び名）との和解が日常会話にも滲む（13〜20話のアークと同期）。
  G({ phase: "hadou", bondMin: 8 }, "深謀遠慮——昔の我の呼び名ネ。ずっと嫌いだったけどサ、お前と打ってたら、あの頃の我も……ま、悪くなかったかもネ。"),
  // ── 絆最高（Lv10〜）：口調がふっと崩れる特別報酬。物語を最後まで歩いた者だけが聞ける素の声。
  //    中華娘マーカー（ダヨ/ネ/我）が落ち、最後に一粒だけ戻る——崩れたことが分かる型を守ること。
  G({ bondMin: 10 }, "……なあ。『ツモれば勝ち』ってあれ、半分は自分に言い聞かせてるんだ。……お前には、言えるけどネ。"),
  G({ bondMin: 10 }, "……うちの師匠も、よくこうやって隣で見てたんだ。あの人の隣は、あったかかった。……いまは我が、その席にいるんだネ。"),
  G({ bondMin: 10 }, "……ここまで一緒に来てくれて、ありがとう。……あれ、今の、口調忘れてた？　……ふふ。お前のせいダヨ。"),
  // ── クリア後（九蓮宝士）：物語が終わっても卓は続く。「余生」の空気＝肩の力が抜けた二人。
  G({ cleared: true }, "九つの宝、ぜんぶ獲っちゃったネ。……でもサ、我らの卓はまだ終わらないヨ。今日は何して遊ぶ？"),
  G({ cleared: true }, "九蓮宝士サマの朝は早いネ？　ふふ、冗談ヨ。……肩書きより、お前と打つ一局のほうが大事ダヨ。"),
  // クリア後×絆カンスト帯＝この物語のいちばん奥の言葉（素のまま語り、最後の一粒で戻る）。
  G({ cleared: true, bondMin: 12 }, "……全部終わったのに、まだここに来てくれるんだな、お前。……ありがとう。我の麻雀は、お前と打った分だけ、好きになれたヨ。"),
];
const SHIYUE_REST = [
  RT({}, "ね、ちょっと聞いていい？　修行、しんどくない？", [
    { key: "honest", label: "正直しんどい", reply: "……だよネ。無理すんなヨ、我がついてるダロ？", memory: "honest" },
    { key: "tough", label: "全然いける", reply: "ふふ、いい顔ネ。その意気だヨ！", memory: "tough" },
  ]),
  RT({}, "点棒……じゃなくて、HP。減るとヒヤッとするネ。お前は平気？", [
    { key: "scary", label: "正直こわい", reply: "……うん。我も、ホントは苦手なんダ。だから、ツモで返すしかないネ。", memory: "scary" },
    { key: "calm", label: "慣れてきた", reply: "たくましいネ！　その図太さ、嫌いじゃないヨ。", memory: "calm" },
  ]),
  RT({ bondMin: 3 }, "なあ。……我の打ち方、ついてこれてる？", [
    { key: "learn", label: "盗ませてもらってる", reply: "ふふっ、いい弟子ネ。ぜんぶ持ってけ、ダヨ。", memory: "learn" },
    { key: "myway", label: "自分の型でいく", reply: "……いいネ、それ。我に似てきたヨ。", memory: "myway" },
  ]),
  RT({ phase: "hadou" }, "ね、覇道の卓って、どう？　正直なとこ。", [
    { key: "fun", label: "ワクワクする", reply: "ふふっ、頼もしいネ！　その顔が見たくて、我は外に連れ出したんダヨ。", memory: "fun" },
    { key: "heavy", label: "正直、重い", reply: "……わかるヨ。点棒の音が違うもんネ。でも、隣に我がいるダロ？", memory: "heavy" },
  ]),
  // 終盤（宝7つ＝あと少しで物語が終わる頃）：「終わり」を二人で初めて口にする。
  RT({ treasuresMin: 7 }, "残りの宝、あと少しネ。……ぜんぶ獲ったら、我ら、どうなると思う？", [
    { key: "together", label: "ずっと相棒だろ？", reply: "……ふふっ。即答ネ。……うん、我もそのつもりヨ。ずっとネ。", memory: "together" },
    { key: "unknown", label: "想像つかない", reply: "正直ネ。……ま、いいヨ。卓を挟んでれば、我らはずっと我らダヨ。", memory: "unknown" },
  ]),
  // クリア後：肩書きの先の話。余生の卓は「何のために打つか」を選び直せる。
  RT({ cleared: true }, "ね、九蓮宝士サマ。次の目標、決めた？", [
    { key: "stronger", label: "もっと強くなる", reply: "ふふ、終わりがないネぇ、お前は。……いいヨ、我もまだまだ付き合うダヨ。", memory: "stronger" },
    { key: "enjoy", label: "のんびり打ちたい", reply: "……それ、最高の贅沢ネ。勝ち負けのない卓も、麻雀ダヨ。", memory: "enjoy" },
  ]),
];

// ── ビビ ── 物静か・凛とした芯。守りの人。心を許すと茶目っ気。
const BIBI_GREET = [
  G({}, "……今月も来たね。えらい。何をする？"),
  G({}, "焦らなくていい。守りを固めるところから、ね。"),
  G({ time: "asa" }, "月の初め。……静かに始めるの、嫌いじゃないでしょ。"),
  G({ time: "yoru" }, "もう月末。無理は禁物。……でも、あと一つだけなら、見ててあげる。"),
  G({ condTier: "vgood" }, "いい目をしてる。……今月は、攻めても沈まないかもね。"),
  G({ condTier: "vbad" }, "顔が疲れてる。……今月は守りの月。休むのも、立派な手。"),
  G({ lastOutcome: "daiseikou" }, "この前のあれ、見てた。……ちゃんと、誰にも奪わせなかったね。"),
  G({ lastOutcome: "shippai" }, "うまくいかない月もある。……守りきれなくても、あなたは沈んでない。"),
  G({ afterChoice: "rely" }, "この前、頼ってくれたね。……うん、その距離で、いい。"),
  G({ afterChoice: "again" }, "……この前の『折れてない』って言葉、思い出してた。……うん。今月も、いける。"),
  G({ afterChoice: "rest" }, "……ちゃんと休めた？　……弱さを見せられるのは、強さだよ。"),
  G({ bondMin: 5 }, "……あなたが卓にいると、守りがいがある。……それだけ。深い意味は、まだ内緒。"),
  // 絆最高（Lv10〜）：いちばん深い本音は、物語を最後まで歩いた者だけに。
  G({ bondMin: 10 }, "……ねえ。わたしが守るのは、点棒じゃなくて——あなた、なんだよ。" ),
];
const BIBI_REST = [
  RT({}, "少し、話そう。……守るのと、攻めるの。どっちが好き？", [
    { key: "guard", label: "守るほう", reply: "……うん。沈まなければ、いつか勝てる。それが、わたしの麻雀。", memory: "guard" },
    { key: "attack", label: "攻めるほう", reply: "ふふ。……いいよ。そのぶん、後ろはわたしが受けるから。", memory: "attack" },
  ]),
  RT({}, "つらいとき、ひとりで抱えてない？", [
    { key: "rely", label: "頼っていい？", reply: "……もちろん。奪わせない。あなたのことも、ね。", memory: "rely" },
    { key: "endure", label: "まだ平気", reply: "……無理は、しないで。倒れる前に、言うこと。約束。", memory: "endure" },
  ]),
];

// ── 賭羽ルイナ ── 女博徒・大胆不敵・色気と余裕。賭け／天秤の語彙。
const RUINA_GREET = [
  G({}, "来たわね。さて……今月はどんな賭けに出る？"),
  G({}, "勝率？　そんなの、賽を振ってから考えればいいのよ。"),
  G({ time: "asa" }, "月明けから熱いじゃない。……いい目をしてるわ。"),
  G({ time: "yoru" }, "締めの勝負は映えるのよ。月末にひと勝負、どう？"),
  G({ condTier: "vgood" }, "ふふ、ツキが乗ってるわね。こういう月は——大きく張りなさい。"),
  G({ condTier: "vbad" }, "今月は分が悪い。……引き際を知るのも、博徒の才よ。"),
  G({ lastOutcome: "daiseikou" }, "この前の大勝負、見事だったわ。……痺れたわよ、ちょっとね。"),
  G({ lastOutcome: "shippai" }, "負けたって？　いいじゃない。笑って次を張れる子は、強くなる。"),
  G({ afterChoice: "allin" }, "この前は全張りだったわね。……その度胸、嫌いじゃないわ。"),
  G({ afterChoice: "again" }, "『すぐ取り返す』……あの目、悪くなかったわ。今月、どこで張る？"),
  G({ afterChoice: "rest" }, "引いて、整えて、また張る。……あんた、博打の呼吸がわかってきたじゃない。"),
  G({ bondMin: 5 }, "あんたとの修行、悪くない賭けだったわ。……配当はまだ先のお楽しみ、ね。"),
  // 絆最高（Lv10〜）：いちばん深い本音は、物語を最後まで歩いた者だけに。
  G({ bondMin: 10 }, "……あんたには教えとく。あたしが本当に賭けてるのは、点棒じゃない。生き方のほうよ。"),
];
const RUINA_REST = [
  RT({}, "ねえ。あんたにとって、賭けって何？", [
    { key: "allin", label: "一発逆転", reply: "ふふ、わかってるじゃない。……でも、引き際だけは見極めなさい。", memory: "allin" },
    { key: "calc", label: "計算と天秤", reply: "賢いわね。……でも、最後の一押しは度胸よ。覚えておいて。", memory: "calc" },
  ]),
  RT({ bondMin: 3 }, "負けるの、こわい？", [
    { key: "fear", label: "こわい", reply: "正直でいいわ。……こわさを知ってる子ほど、大胆になれるの。", memory: "fear" },
    { key: "laugh", label: "笑い飛ばす", reply: "あはっ、最高。……あんた、いい博徒になるわよ。", memory: "laugh" },
  ]),
];

// ── 大成功への「素出し」ボイス（訓練が大成功した瞬間。仮面が一瞬外れる特別反応）──
const SHIYUE_PRAISE = [
  G({}, "……っ、すごいヨ今の！　ほんとに、すごい……！　我、ちょっと鳥肌たったダヨ。"),
  G({}, "見たヨ!? 今の、見た!? ……ふふっ、お前のそういうとこ、好きだヨ。"),
  G({ bondMin: 3 }, "……ねえ。お前の伸び、見てると——昔の自分を、ちょっと思い出すんダ。"),
];
const BIBI_PRAISE = [
  G({}, "……すごい。ほんとに、すごいよ。……ふふ、ちょっとだけ、自慢したくなった。"),
  G({}, "……見てたよ、ぜんぶ。今の——誰にも、文句は言わせない。"),
  G({ bondMin: 3 }, "……あなたの成長、まぶしいな。守ってる場合じゃ、ないかも。"),
];
const RUINA_PRAISE = [
  G({}, "……っ、痺れたわ！　今のは本物。あたしが保証する。"),
  G({}, "あはっ、やってくれるじゃない。……ゾクッときたわよ、ちょっとね。"),
  G({ bondMin: 3 }, "最高じゃない。……あんた、いつかあたしを超えるかもね。"),
];

// ── 師匠の昇段（覇道編・段位の軌跡 MENTOR_RANK_TRACK が動いた瞬間）──
// n＝新しい蓮数。弟子と歩む覇道で「師匠自身の物語」も再び動き出す、反転の節目。
// 点棒嫌いの詩玥は段位そのものより「誰と獲るか」を口にする（素性の滲み）。
const SHIYUE_RANKUP = {
  7: "気づいたら七蓮覇士、だってサ。あはは、お前と打ってると勝手に増えてくネ。……宝も、楽しさも。",
  8: "八蓮極士。——昔の我が聞いたら腰を抜かすヨ。……あと一つだネ、相棒。最後も『ツモれば勝ち』、いこ？",
};
const EXPLICIT_RANKUP = { shiyue: SHIYUE_RANKUP };
// 師匠の昇段セリフを返す。未実装キャラはテンプレ（grep: ［テンプレ］）。
export function pickMentorRankUpLine(charId, n) {
  const line = EXPLICIT_RANKUP[charId]?.[n];
  if (line) return line;
  return `［テンプレ］${nameOf(charId)}・昇段（${n}蓮）：ここに一言が入ります`;
}

// ── 大一番（大会・最終節の手動戦）前の口上 ──
// situation: "top"（首位で迎える）/"chase"（射程圏で追う）/"longshot"（大差を追う）。
// 詩玥はどの局面でも「ツモれば勝ち」に帰着させる＝口癖が大一番で一番強く響く設計。
const SHIYUE_BIGMATCH = {
  top: "首位で大一番、いい眺めネ。……気を抜くなヨ？　最後の一巡まで、二人で締めるダヨ。",
  chase: "追う大一番——望むところダロ？　我らの麻雀、ぜんぶここで出すヨ。",
  longshot: "分が悪い？　ふふ、関係ないネ。ツモれば勝ち——最後までそれだけヨ。",
};
// ビビはどの局面でも「あなたは沈まない／奪わせない」に帰着＝守りの口上が大一番で一番強く響く。
const BIBI_BIGMATCH = {
  top: "首位で大一番……ふふ、いい眺め。最後まで、ビビが背中を守る。一つも、奪わせない。",
  chase: "追う側、ね。……だいじょうぶ。あなたは沈まない。ビビが、そう決めたから。",
  longshot: "分が悪い？　……ううん。守りきって、最後にぜんぶ持っていけばいい。いっしょに、ね。",
};
// ルイナはどの局面も「いい目だ・張る」に帰着＝賭けの美学が大一番で一番強く響く。
const RUINA_BIGMATCH = {
  top: "首位で大一番か。——いい眺めだ。最後の一巡まで、派手に張りきろうじゃないか。",
  chase: "追う側? 上等だよ。こういう時こそ、賭けは燃えるってもんさ。——いい目だ。",
  longshot: "分が悪い? ——はっ、最高じゃないか。大穴ほど、張る価値がある。見てな。",
};
// 凌雲はどの局面でも「沈ませない／受けて、前へ」に帰着＝不動の盾の口上が大一番で響く。
const KUIDOSHI_BIGMATCH = {
  top: "首位で、大一番。……いい眺めだ。最後まで、僕が背中を護る。一つも、沈ませない。",
  chase: "追う側か。——望むところだよ。受けて、受けて、最後に前へ出る。いこう、一緒に。",
  longshot: "分が悪い? ……いいんだ。沈まなければ、まだ終わらない。君を、矢面には立たせないよ。",
};
const EXPLICIT_BIGMATCH = { shiyue: SHIYUE_BIGMATCH, bibi: BIBI_BIGMATCH, kakeha_ruina: RUINA_BIGMATCH, kuidoshi: KUIDOSHI_BIGMATCH };
export function pickMentorBigMatchLine(charId, situation = "chase") {
  const set = EXPLICIT_BIGMATCH[charId];
  if (set) return set[situation] || set.chase;
  return `［テンプレ］${nameOf(charId)}・大一番の口上（${situation}）：ここに一言が入ります`;
}

// ── 対局見守り相槌（battle quips）── オート対局（雀荘巡り等）に同行した師匠の相槌。
// event: matchStart(試合開始) / bigWin(満貫以上) / bigLoss(大放銃・被ツモ) / pinch(HP25%初到達)
//        tobi(飛び) / bustWin(相手を飛ばした) / abilityUse(必殺発動) / readWin(読み勝ち)
//        complete(完走) / retreat(撤退) / rareGuest(レア客登場)
// cond は greeting と同じ語彙（bondMin / condTier）。絆が深いほど素が滲む行を混ぜること。
const Q = (event, cond, text) => ({ event, cond, text });
const SHIYUE_BATTLE = [
  Q("matchStart", {}, "よーし、我（ウォ）がしっかり見ててやるネ。気楽にいこ？"),
  Q("matchStart", {}, "ここの卓、いい匂いがするヨ。……勝負の匂いネ。"),
  Q("matchStart", { condTier: "vgood" }, "今日のお前、目がキラキラしてるヨ。荒稼ぎの予感ネ！"),
  Q("bigWin", {}, "満貫!?　……ふっふーん、我の弟子だからネ。当然ヨ。"),
  Q("bigWin", {}, "うわ、デカい！　今夜はごちそうだネ！"),
  Q("bigWin", { bondMin: 3 }, "……今の手、きれいだったヨ。我、ちょっと見惚れたネ。"),
  Q("bigLoss", {}, "いったた……。だいじょぶ、点棒は減っても腕は減らないダヨ。"),
  Q("bigLoss", {}, "ま、麻雀だからネ。そういう日もある。顔上げてこ？"),
  Q("bigLoss", { bondMin: 4 }, "……今の、我まで胸が痛いヨ。……ほんと、点棒ってやつは。"),
  Q("pinch", {}, "おい、顔上げて。『ツモれば勝ち』ダロ？　我が見てる。まだ終わってないヨ。"),
  Q("pinch", { bondMin: 4 }, "……減ってく点棒、見てるの……我のほうがつらいかもネ。でもお前なら返せる。我は知ってるヨ。"),
  Q("tobi", {}, "——もういい、よく打った。帰ろ？　今日のことは我が覚えとく。次で取り返すネ。"),
  Q("bustWin", {}, "飛ばした!?　あはは、容赦ないネぇ！　誰に似たんだか……我か。"),
  Q("abilityUse", {}, "出た、必殺！　そこで切るのが勝負勘ネ！"),
  Q("abilityUse", {}, "いい呼吸ヨ！　切り札は出す瞬間がすべてダヨ。"),
  Q("readWin", {}, "ほら、読み通り！　相手の癖、ちゃんと見えてたネ。"),
  Q("readWin", { bondMin: 3 }, "……いい読みだった。……我も昔、そういうの得意だったんダ。"),
  Q("riichiSelf", {}, "いいリーチだ。あとはツモるだけネ！"),
  Q("riichiSelf", {}, "乗った！　その手、我も好きヨ。"),
  Q("riichiOpp", {}, "リーチ……！　慌てない慌てない。深呼吸ネ。"),
  Q("riichiOpp", { bondMin: 3 }, "……来たね。だいじょぶ、我はお前の隣にいるヨ。"),
  Q("rareGuest", {}, "おっ、あれは……腕利きが来たネ。面白くなってきたヨ？"),
  Q("complete", {}, "完走！　お疲れさま、いい巡りだったネ。帰ってお茶にしよ？"),
  Q("retreat", {}, "引き際を知るのも腕のうちダヨ。……ん、いい判断ネ。"),
];
function templateBattleQuips(name) {
  const t = (l) => `［テンプレ］${name}・見守り${l}：ここに相槌が入ります`;
  return [
    "matchStart", "bigWin", "bigLoss", "pinch", "tobi", "bustWin",
    "abilityUse", "readWin", "complete", "retreat", "rareGuest",
    "riichiSelf", "riichiOpp",
  ].map((ev) => Q(ev, {}, t(ev)));
}
// ビビの見守り＝守りの相棒。攻めの戦果より「奪わせなかったこと」を褒める。
// 安全な場面では幼さ（小声の歓声・好奇心・茶目っ気）を出し、守り/ピンチ/飛びは凛とした芯を崩さない。
const BIBI_BATTLE = [
  Q("matchStart", {}, "……はじまるね。後ろは、ビビが見てる。安心して打って。"),
  Q("matchStart", {}, "この卓、ちょっと張りつめてる。……ふふ、でも平気。だれにも、奪わせないから。"),
  Q("matchStart", { condTier: "vgood" }, "今日のあなた、いい目してる。……攻めても、いいよ。沈んだら、ビビが受けるから。"),
  Q("bigWin", {}, "わ……っ、おおきい。やった、やったね……！"),
  Q("bigWin", {}, "満貫……ふふん。ほら、攻めたって沈まないでしょ？"),
  Q("bigWin", { bondMin: 3 }, "……今の、かっこよかった。ビビ、ちょっと……どきっとしちゃった。"),
  Q("bigLoss", {}, "……っ、もってかれた。だいじょうぶ、点棒なんて……あとで取り返せる。"),
  Q("bigLoss", {}, "いたかった、ね。……でも、まだ立ってる。それでいい。"),
  Q("bigLoss", { bondMin: 4 }, "……やだ。あなたが減るの、見たくないの。……次は、ぜったい受けるから。"),
  Q("pinch", {}, "……っ、だめ。これ以上は、ビビが受ける。だいじょうぶ。あなたは、沈まない。"),
  Q("pinch", { bondMin: 4 }, "……こわい顔、しないで。ビビがいる。……ぜったい、奪わせないから。"),
  Q("tobi", {}, "——もう、いい。よく粘った。今日のことは、ビビが覚えてる。次は、守りきる。"),
  Q("bustWin", {}, "……飛ばしちゃった。ふふ、ごめんね？　……ううん、ぜんぜん、ごめんじゃないの。"),
  Q("abilityUse", {}, "身代わり、いくよ。だれのアガりも、ぜんぶ、なかったことにする。"),
  Q("abilityUse", { bondMin: 4 }, "……ビビが、人形になる番。痛いのは、ぜんぶこっちでいいの。"),
  Q("readWin", {}, "ほら、ね。……攻めなくたって、ちゃんと勝てる。それが、ビビの麻雀。"),
  Q("riichiSelf", {}, "……リーチ？　ふふ、めずらしい。いいよ、いってみよ。後ろは見てるから。"),
  Q("riichiOpp", {}, "リーチ……。慌てないで。ビビの後ろに、隠れていい。"),
  Q("riichiOpp", { bondMin: 3 }, "……来たね。だいじょうぶ。こういうの、ビビの得意分野なの。"),
  Q("rareGuest", {}, "……あの人、つよい。ぴりっとした。……ふふ、ちょっと、わくわくするね？"),
  Q("complete", {}, "完走、おつかれさま。……ちゃんと、誰にも奪われずに帰ってきた。えらい。"),
  Q("retreat", {}, "引くのも、守り。……うん、いい判断。無理しないあなた、ビビは好きだよ。"),
];
// ルイナの見守り＝賭けの相棒。攻め・大物手・大博打を「いい張り」と楽しみ、負けは「賭け金は戻らない」と笑い飛ばす。
// 絆が深い行では、飄々の下の“ちゃんと見てる”優しさを一瞬だけ覗かせる。
const RUINA_BATTLE = [
  Q("matchStart", {}, "さて、見物といくよ。あんたの賭けっぷり、見せてもらおうか。"),
  Q("matchStart", {}, "いい卓だ。……勝負の匂いがするね。"),
  Q("matchStart", { condTier: "vgood" }, "今日のあんた、いい目をしてる。——派手に荒らしておいで。"),
  Q("bigWin", {}, "満貫! ——はっ、いい張りだ。それでこそ、あたしの弟子さ。"),
  Q("bigWin", {}, "でかい一発だね! こういうのを見ると、ぞくぞくするよ。"),
  Q("bigWin", { bondMin: 3 }, "……今の手、惚れ惚れするね。あたしも、見習いたいくらいさ。"),
  Q("bigLoss", {}, "おっと、持ってかれたね。なに、賭け金は戻らない——そういうもんさ。"),
  Q("bigLoss", {}, "いてて。ま、派手に張れば、こういう日もある。気にしなさんな。"),
  Q("bigLoss", { bondMin: 4 }, "……ちょいと痛かったね。だいじょうぶ、あんたの目はまだ死んでないよ。"),
  Q("pinch", {}, "後がない? ——いいねえ、そこからが本当の勝負だ。あたしが見てる、張りな。"),
  Q("pinch", { bondMin: 4 }, "……こんな崖っぷちでも、あんたなら笑って張れる。あたしは、知ってるよ。"),
  Q("tobi", {}, "——そこまでだ。よく張った。賭けに負けは付きもの、胸張って帰りな。"),
  Q("bustWin", {}, "飛ばしたね! あはっ、容赦ない。——いいよ、それが勝負ってもんだ。"),
  Q("abilityUse", {}, "出た、大博打! ……その度胸、嫌いじゃないよ。"),
  Q("abilityUse", {}, "張ったね。賭けるなら、そのくらい思いきりよくいかなきゃ。"),
  Q("readWin", {}, "ほら、読み勝ちだ。運命任せじゃない、あんたの目で掴んだ一勝さ。"),
  Q("readWin", { bondMin: 3 }, "……いい読みだった。あんた、ほんとに育ったね。"),
  Q("riichiSelf", {}, "リーチか! いい度胸だ。——来な、あんたのいい目。"),
  Q("riichiSelf", {}, "乗った。その勝負、あたしも好きだよ。"),
  Q("riichiOpp", {}, "向こうがリーチ……。慌てない慌てない。よく見な。"),
  Q("riichiOpp", { bondMin: 3 }, "……来たね。だいじょうぶ、あたしが隣にいる。好きに張りな。"),
  Q("rareGuest", {}, "おや、あれは——腕利きだ。ふふ、面白くなってきたじゃないか。"),
  Q("complete", {}, "完走だ。お疲れさん。——いい巡りだったね。一杯、やってこ?"),
  Q("retreat", {}, "引き際を知るのも、博徒の腕さ。……うん、いい判断だ。"),
];
// 凌雲の見守り＝不動の盾の相棒。攻めの戦果も「攻めることも護りのうち」と肯定し、被弾・ピンチは
// 「沈まなければいい／受けは僕が」と支える。絆が深い行で、受け切れなかった悔いや故郷訛りが一瞬滲む。
const KUIDOSHI_BATTLE = [
  Q("matchStart", {}, "さ、始めようか。……後ろは、僕が見てる。気楽に、いこう。"),
  Q("matchStart", {}, "いい卓だね。……一打ずつ、確かめていこう。"),
  Q("matchStart", { condTier: "vgood" }, "今日の君は、いい目をしてる。……攻めても、沈まないよ。"),
  Q("bigWin", {}, "満貫か。……うん、いい手だった。攻めることも、護りのうちだよ。"),
  Q("bigWin", {}, "大きいね。……その一打、よく通した。"),
  Q("bigWin", { bondMin: 3 }, "……今の、きれいだったよ。僕も、つい見惚れた。"),
  Q("bigLoss", {}, "……大きいの、もらったね。だいじょうぶ。沈んでなければ、まだ立てる。"),
  Q("bigLoss", {}, "痛かったね。……でも、点棒は、また積めばいい。顔を、上げて。"),
  Q("bigLoss", { bondMin: 4 }, "……今のは、僕が受けたかった。……次は、前に立つよ。"),
  Q("pinch", {}, "——ここからが、本番だ。沈まないと、決めたんだろう? 僕が、見てる。"),
  Q("pinch", { bondMin: 4 }, "……苦しいね。でも、君は折れない。それは、僕が知ってるよ。"),
  Q("tobi", {}, "——よく、粘った。今日は、ここまで。次は、僕が前で受けるよ。"),
  Q("bustWin", {}, "飛ばしたね。……ふふ。守り抜いた先に、ちゃんと攻めが、あった。"),
  Q("abilityUse", {}, "盾、いくよ。……致命の一撃は、ぜんぶ、引き受ける。"),
  Q("abilityUse", { bondMin: 4 }, "……君は、攻めていい。痛いのは、こっちで持つから。"),
  Q("readWin", {}, "ほら、読み通り。……相手を知れば、受けは、もっと固くなる。"),
  Q("readWin", { bondMin: 3 }, "いい読みだ。……“相手を知る”が、身についてきたね。"),
  Q("riichiSelf", {}, "いいリーチだ。……攻めると決めたら、迷わない。それでいい。"),
  Q("riichiOpp", {}, "リーチ……。慌てない。受けの形は、もうできてる。"),
  Q("riichiOpp", { bondMin: 3 }, "……来たね。だいじょうぶ。僕の後ろに、いていい。"),
  Q("rareGuest", {}, "おや。……あれは、腕利きだね。いい相手だ。よく、見ておこう。"),
  Q("complete", {}, "完走、お疲れさま。……一度も沈まずに、帰ってこれたね。"),
  Q("retreat", {}, "引くのも、護りだよ。……うん、いい判断だ。"),
];
// 姚玖の見守り＝御庭番の兄。おっとり朴訥（俺）・夢を語ると饒舌。攻めの戦果も褒めるが、底は「守る側」の安心感。
// 絆が深いと「陰で見てきた者の実感」が滲む。design/yao_chu.json 準拠。
const YAO_CHU_BATTLE = [
  Q("matchStart", {}, "さ、肩の力を抜いていこう。俺がちゃんと見てるからな。"),
  Q("matchStart", {}, "いい卓だなァ。……ゆっくり、楽しんでこい。"),
  Q("matchStart", { condTier: "vgood" }, "お、今日は目が冴えてるなァ。大きいの、狙ってみるか?"),
  Q("bigWin", {}, "おお、揃えたな! ……いいぞ、その大きいの、俺は好きだ。"),
  Q("bigWin", {}, "でかい手だ……。夢があって、いいなァ。"),
  Q("bigWin", { bondMin: 3 }, "……今の、きれいだったよ。俺が揃えたかった形、お前が見せてくれたなァ。"),
  Q("bigLoss", {}, "いてて……。まあ、点棒は減っても、腕は減らないさ。"),
  Q("bigLoss", {}, "そういう日もあるさ。顔、上げていこう。"),
  Q("bigLoss", { bondMin: 4 }, "……減るとこ見てると、俺まで、こたえるなァ。でも、お前なら拾い直せる。"),
  Q("pinch", {}, "だいじょぶ、まだ終わってない。俺が後ろで見てる。……守りも、攻めのうちだ。"),
  Q("pinch", { bondMin: 4 }, "……苦しいとこだなァ。でも俺は知ってる。お前は、ここから粘れる子だ。"),
  Q("tobi", {}, "——もういい、よく打った。帰ろう。今日のことは、俺が覚えとくさ。"),
  Q("bustWin", {}, "飛ばしたか……! ふふ、容赦ないなァ。頼もしいぞ。"),
  Q("abilityUse", {}, "出たな、切り札。……いい呼吸だ。"),
  Q("abilityUse", {}, "そこで使うか。うん、勝負勘、育ってるなァ。"),
  Q("readWin", {}, "ほら、読み通り。相手の癖、ちゃんと見えてたな。"),
  Q("readWin", { bondMin: 3 }, "……いい読みだ。陰から見てると、お前の成長がよく分かるよ。"),
  Q("riichiSelf", {}, "いいリーチだ。あとは、揃うのを待つだけさ。"),
  Q("riichiSelf", {}, "乗ったなァ。その大きいの、見せてもらおうか。"),
  Q("riichiOpp", {}, "リーチか。……慌てない。ゆっくり、対処しよう。"),
  Q("riichiOpp", { bondMin: 3 }, "……来たな。だいじょぶ、俺がついてる。落ち着いていこう。"),
  Q("rareGuest", {}, "お……あれは、腕利きだなァ。面白い相手が来た。"),
  Q("complete", {}, "完走か。お疲れさん。……いい巡りだった。茶でも淹れよう。"),
  Q("retreat", {}, "引き際を知るのも、腕のうちさ。……うん、いい判断だ。"),
];
// 春嬋の見守り＝御庭番の妹分。早口・きびきびの世話焼き（うち）。速さと先手を褒め、ピンチでは「間に合わせる」で励ます。
// 絆が深いと、底の「間に合いたい一心」が一瞬覗く。design/chun_chan.json 準拠。
const CHUN_CHAN_BATTLE = [
  Q("matchStart", {}, "よしっ、いくよっ! うちが見てるから、思いっきり攻めなっ。"),
  Q("matchStart", {}, "テンポ、テンポっ! 先手で押してこっ。"),
  Q("matchStart", { condTier: "vgood" }, "今日のあんた、ノってるねっ! 速攻、決めちゃいなっ。"),
  Q("bigWin", {}, "でかいっ! やるじゃんっ、間に合わせたねっ。"),
  Q("bigWin", {}, "満貫っ!? ……ふふん、うちの弟子だものっ。"),
  Q("bigWin", { bondMin: 3 }, "……今の、かっこよかったよ。うち、ちょっと見惚れちゃったっ。"),
  Q("bigLoss", {}, "うっ、もってかれた……。だいじょぶ、すぐ取り返せるっ。"),
  Q("bigLoss", {}, "痛かったね。でも、止まんないでっ。次いこっ。"),
  Q("bigLoss", { bondMin: 4 }, "……減るの、見てらんないっ。次は、うちがもっと早く声かけるからっ。"),
  Q("pinch", {}, "まだっ、間に合うっ! ここで止まったら終わりっしょ。顔上げてっ。"),
  Q("pinch", { bondMin: 4 }, "……こわい顔しないでっ。間に合わせる、絶対。うちがついてるっ。"),
  Q("tobi", {}, "——もういいっ、よく粘った。帰ろっ。次は、間に合わせるからっ。"),
  Q("bustWin", {}, "飛ばしたっ! ……あはは、容赦ないっ。スカッとするねっ。"),
  Q("abilityUse", {}, "出たっ、切り札! いいタイミングっ。"),
  Q("abilityUse", {}, "そこっ! ……うん、勝負どころ、分かってきたねっ。"),
  Q("readWin", {}, "ほらっ、読み勝ちっ! 相手の手、見えてたねっ。"),
  Q("readWin", { bondMin: 3 }, "……いい読み。速いだけじゃないとこ、見せてくれたねっ。"),
  Q("riichiSelf", {}, "リーチっ! はやいっ、いいよいいよっ。"),
  Q("riichiSelf", {}, "乗ったっ! そのまま、ツモり切れっ。"),
  Q("riichiOpp", {}, "リーチ来たっ。……落ち着いてっ、まだ間に合うっ。"),
  Q("riichiOpp", { bondMin: 3 }, "……来たね。だいじょぶ、うちが見てる。慌てないっ。"),
  Q("rareGuest", {}, "お、つよそうなの来たっ! ……燃えてきたっしょ?"),
  Q("complete", {}, "完走っ! おつかれっ。いい巡りだったねっ、さ、帰ろっ。"),
  Q("retreat", {}, "引くのも、速さのうちっ。……うん、いい判断だよっ。"),
];
// ルクス・ゼロの見守り＝無機質な精密機械（クール系）。戦果を効率・誤差で評価。絆が深いと一瞬だけ平坦が緩む。
// design/yobinin.json 準拠。
const YOBININ_BATTLE = [
  Q("matchStart", {}, "始めろ。……私が、すべて見ている。"),
  Q("matchStart", {}, "最短経路を引け。無駄は、省け。"),
  Q("matchStart", { condTier: "vgood" }, "今日は、調子がいいな。……数字に、出ている。"),
  Q("bigWin", {}, "満貫。……効率的だ。悪くない。"),
  Q("bigWin", {}, "捕捉、確保。計算どおりの出力だ。"),
  Q("bigWin", { bondMin: 3 }, "……いい手だ。お前の打牌、誤差が減ってきている。"),
  Q("bigLoss", {}, "誤差が出た。……再計算しろ。点棒は、取り返せる。"),
  Q("bigLoss", {}, "想定内の被弾だ。崩れるな。"),
  Q("bigLoss", { bondMin: 4 }, "……今のは、私でも読めなかった。お前のせいじゃない。顔を上げろ。"),
  Q("pinch", {}, "まだ、確率はゼロじゃない。……落ち着け。経路は、残っている。"),
  Q("pinch", { bondMin: 4 }, "……減っていく点棒を見るのは、好かない。だが、お前なら詰め切れる。データが、そう言っている。"),
  Q("tobi", {}, "——終了。よく打った。今日の数値は、私が記録しておく。次に活かせ。"),
  Q("bustWin", {}, "飛ばしたか。……効率的な決着だ。"),
  Q("abilityUse", {}, "切り札。……投入の判断、正しい。"),
  Q("abilityUse", {}, "そこだ。最適なタイミングだった。"),
  Q("readWin", {}, "読み勝ち。……相手の経路を、捕捉していたな。"),
  Q("readWin", { bondMin: 3 }, "……いい読みだ。お前の計算、私に近づいている。"),
  Q("riichiSelf", {}, "リーチ。待ちは、確保した。あとは、ツモだ。"),
  Q("riichiSelf", {}, "宣言したな。……期待値は、正だ。いける。"),
  Q("riichiOpp", {}, "相手、リーチ。……慌てるな。安牌を、計算しろ。"),
  Q("riichiOpp", { bondMin: 3 }, "……来たな。大丈夫だ、私が一緒に読む。落ち着け。"),
  Q("rareGuest", {}, "……格上だ。いいデータになる。捕捉しろ。"),
  Q("complete", {}, "完走。誤差なく、帰投した。……お疲れ。"),
  Q("retreat", {}, "撤退。期待値が負なら、引くのが正解だ。……賢明な判断だ。"),
];
// ドラニエルの見守り＝無邪気な自称天使（のじゃ）。派手な賭けを煽り、飛んでもけろっと。煽りは悪気ゼロの天然。
// design/doranie.json 準拠。
const DORANIE_BATTLE = [
  Q("matchStart", {}, "さあ弟子よ、張れ張れ! わらわが見ておるぞ!"),
  Q("matchStart", {}, "ぬるい打ちは許さんぞ! 派手にいかんか!"),
  Q("matchStart", { condTier: "vgood" }, "ほう、今日はいい目をしておるのう! 大物手、狙ってみい!"),
  Q("bigWin", {}, "わはは、でかいのじゃ! さすがわらわの弟子よ!"),
  Q("bigWin", {}, "満貫か! ……ぬるい、もっとデカく張らんか! ……まあ、上出来じゃ!"),
  Q("bigWin", { bondMin: 3 }, "……今のは、見事じゃった。わらわ、ちと感心したのじゃ。"),
  Q("bigLoss", {}, "うぐっ、持っていかれたか! ……まあ、賭けじゃ、気にするな!"),
  Q("bigLoss", {}, "飛ぶときは飛ぶ、それが博徒じゃ! 顔を上げい!"),
  Q("bigLoss", { bondMin: 4 }, "……痛かったのう。わらわも紙HPじゃから、その気持ち、よう分かるぞ。次じゃ次!"),
  Q("pinch", {}, "おっと、危ないのじゃ! ……だが博徒の見せ場は、ここからじゃぞ!"),
  Q("pinch", { bondMin: 4 }, "……わらわの前で、沈むでないぞ。一発、大きいのを狙え。お前ならできる。"),
  Q("tobi", {}, "——飛んでしもうたか! わはは、派手じゃったのう! ……よし、帰って茶じゃ。次こそ大物手ぞ。"),
  Q("bustWin", {}, "飛ばしたのじゃ! わはは、容赦ないのう、わらわの弟子は!"),
  Q("abilityUse", {}, "おお、切り札じゃ! そこで切るのが、博徒よ!"),
  Q("abilityUse", {}, "いい度胸じゃ! 賭けは、そうでなくてはのう!"),
  Q("readWin", {}, "読み勝ちか! ……ふむ、わらわの天界仕込みが効いておるな?"),
  Q("readWin", { bondMin: 3 }, "……ようも見抜いたのう。お前、筋がよいぞ。"),
  Q("riichiSelf", {}, "リーチじゃ! さあ、一発ツモるのじゃ!"),
  Q("riichiSelf", {}, "乗ったのう! 大物手、期待しておるぞ!"),
  Q("riichiOpp", {}, "むっ、相手リーチか。……まあ、構わん、張り返せ!"),
  Q("riichiOpp", { bondMin: 3 }, "……来たのう。だいじょぶじゃ、わらわがついておる。慌てるな。"),
  Q("rareGuest", {}, "ほう、強そうなのが来たぞ! ……わくわくするのう!"),
  Q("complete", {}, "完走じゃ! よう頑張った! さ、帰って大物手の話をしようぞ!"),
  Q("retreat", {}, "引くか。……ふむ、賢いのう。たまには、それも博徒の腕じゃ。"),
];
const EXPLICIT_BATTLE = { shiyue: SHIYUE_BATTLE, bibi: BIBI_BATTLE, kakeha_ruina: RUINA_BATTLE, kuidoshi: KUIDOSHI_BATTLE, yao_chu: YAO_CHU_BATTLE, chun_chan: CHUN_CHAN_BATTLE, yobinin: YOBININ_BATTLE, doranie: DORANIE_BATTLE };

// ── 大会敗北の夜の2択（leagueLossTalk）──
// 大会リザルト（優勝できなかった夜）に師匠が問いかけ、プレイヤーが返せる（双方向の見せ場）。
// tier: "close"（最終2位＝あと一歩）/ "far"（3位以下）。"any" はどちらでも候補。
// memory タグ "again"（雪辱）/"rest"（休む）は homeGreeting の afterChoice で呼び戻される＝
// 負けた夜の約束を、翌月の師匠が覚えている。
const LL = (tier, cond, prompt, choices) => ({ tier, cond, prompt, choices });
const SHIYUE_LEAGUE_LOSS = [
  LL("close", {}, "……あと一歩、だったネ。ねえ、今どんな気持ち？　正直なとこ。", [
    { key: "again", label: "悔しい。すぐ雪辱したい", reply: "ふふ、いい目だヨ。その火、消さないでネ。——次は獲るヨ、二人で。", memory: "again" },
    { key: "rest", label: "ちょっと休みたい", reply: "ん、それも強さネ。負けた夜は、ゆっくり茶でも飲も？　……我も付き合うヨ。", memory: "rest" },
  ]),
  LL("far", {}, "……今日は、卓が遠かったネ。……顔、上げられそう？", [
    { key: "again", label: "もう一回挑む", reply: "……ふふ、即答かヨ。頼もしいネ。なら我は、何度でも隣に座るだけヨ。", memory: "again" },
    { key: "rest", label: "今月は休む", reply: "うん、いい判断ネ。点棒は逃げても、卓は逃げないヨ。……また来月、ネ。", memory: "rest" },
  ]),
];
const BIBI_LEAGUE_LOSS = [
  LL("any", {}, "……負けたね。……ねえ、ひとつだけ聞かせて。折れてない？", [
    { key: "again", label: "折れてない", reply: "……うん。その目なら、大丈夫。次は、わたしがぜんぶ守るから。", memory: "again" },
    { key: "rest", label: "少し、折れたかも", reply: "……正直で、えらい。今日は休も。……あなたを責める人は、ここにはいない。", memory: "rest" },
  ]),
];
const RUINA_LEAGUE_LOSS = [
  LL("any", {}, "負けたわね。……さ、あんたはどっちの博徒？", [
    { key: "again", label: "すぐ取り返す", reply: "あはっ、いい啖呵。……でも頭は冷やしときなさい。熱い心と冷えた頭、両方が要るのよ。", memory: "again" },
    { key: "rest", label: "今日は引く", reply: "引き際を知ってる。……上等よ。それでこそ、次の大勝負が映えるってもの。", memory: "rest" },
  ]),
];
// 凌雲＝『何度でも立ち上がる（無冠の九蓮）』へ帰着。memory again/rest は homeGreeting で呼び戻す。
const KUIDOSHI_LEAGUE_LOSS = [
  LL("close", {}, "……あと一歩、だったね。ねえ、今、どんな気持ち? 正直なところ。", [
    { key: "again", label: "悔しい。すぐ立ち上がる", reply: "……うん。その目だ。僕らは、何度でも立ち上がる。それが、僕らだろう?", memory: "again" },
    { key: "rest", label: "少し、休みたい", reply: "それも、強さだよ。沈んだ夜は、ゆっくりでいい。……僕も、隣にいる。", memory: "rest" },
  ]),
  LL("far", {}, "……今日は、卓が遠かったね。……顔、上げられそう?", [
    { key: "again", label: "もう一度、挑む", reply: "……ふふ、即答だね。なら僕は、何度でも、隣に座るよ。", memory: "again" },
    { key: "rest", label: "今月は、休む", reply: "うん、いい判断だ。沈まなければ、卓は逃げない。……また、来月。", memory: "rest" },
  ]),
];
const EXPLICIT_LEAGUE_LOSS = { shiyue: SHIYUE_LEAGUE_LOSS, bibi: BIBI_LEAGUE_LOSS, kakeha_ruina: RUINA_LEAGUE_LOSS, kuidoshi: KUIDOSHI_LEAGUE_LOSS };
// 敗北の2択を1つ返す。未実装キャラは null（リザルトは従来の定型文のまま＝テンプレ文言を本番に出さない）。
export function pickLeagueLossTalk(charId, tier, ctx = {}) {
  const all = EXPLICIT_LEAGUE_LOSS[charId];
  if (!all) return null;
  const matches = all.filter((e) => (e.tier === tier || e.tier === "any") && gMatch(e.cond, ctx));
  if (!matches.length) return null;
  return matches[(Math.random() * matches.length) | 0];
}

// ── 二人打ちの誘い文句（モーダルの一言）──
// 未実装キャラは共通フォールバック（従来文言）。クリア後＝師弟からライバルへ、関係の反転。
const SHIYUE_DUO_INVITE = [
  G({}, "一局、付き合うヨ。……ふふ、手は抜かないネ？　それが我の愛情ダヨ。"),
  G({ cleared: true }, "九蓮宝士サマ、一局どう？　……今日は師匠としてじゃなく、ライバルとして打つヨ。本気の本気、ネ。"),
];
const BIBI_DUO_INVITE = [
  G({}, "一局、いい？　……ビビ、手は抜かないよ。……ふふ、覚悟して？"),
  G({ cleared: true }, "九蓮宝士さま、一局どう？　……今日はね、守る相手じゃなくて——追いかける目標として、打つの。本気で、いくよ。"),
];
// ルイナ＝「組まない」が口癖の博徒。だが弟子だけは別格＝誘いは粋な挑発。クリア後は“好敵手”として張り合う反転。
const RUINA_DUO_INVITE = [
  G({}, "一局、付き合いな。……手は抜かないよ? それが、あたしの礼儀ってもんさ。"),
  G({ cleared: true }, "九蓮宝士サマが、あたしと一局かい? ……いいねえ。今日は師匠じゃなく、好敵手として張り合おうじゃないか。"),
];
// 凌雲＝普段は受けの人だが、弟子相手の一局だけは「手を抜かない」。クリア後は“好敵手”として盾を試させる反転。
const KUIDOSHI_DUO_INVITE = [
  G({}, "一局、付き合おうか。……手は、抜かないよ? それが、僕の礼儀だ。"),
  G({ cleared: true }, "九蓮宝士さま、一局どう? ……今日は師匠じゃなく、好敵手として。——僕の盾、抜けるかな。"),
];
const EXPLICIT_DUO_INVITE = { shiyue: SHIYUE_DUO_INVITE, bibi: BIBI_DUO_INVITE, kakeha_ruina: RUINA_DUO_INVITE, kuidoshi: KUIDOSHI_DUO_INVITE };
export const DUO_INVITE_FALLBACK = "「一局、付き合え。…手は抜かんぞ」";
export function pickMentorDuoInvite(charId, ctx = {}) {
  const all = EXPLICIT_DUO_INVITE[charId];
  if (!all) return null;
  const matches = all.filter((e) => gMatch(e.cond, ctx));
  if (!matches.length) return null;
  // クリア後など「より特別な条件」の行を優先（cleared 行があればそちら）。
  const special = matches.filter((m) => m.cond && Object.keys(m.cond).length);
  const pool = special.length ? special : matches;
  return pool[(Math.random() * pool.length) | 0].text;
}

// ── 雀荘帰りの一言（雀荘リザルトに師匠が添える）──
// tier: "bigWin"（全勝の荒稼ぎ）/ "win"（勝ち越し）/ "rough"（負け越し・渋い日）。
// 詩玥の bigWin は素性の反転点：HP＝点棒のゲームで点棒を憎む彼女が、「勝ちすぎた日」にだけ
// 点棒の山への複雑な目を見せる（序盤の楽勝続きが、そのまま素が滲む装置になる）。
const P = (tier, cond, text) => ({ tier, cond, text });
const SHIYUE_PARLOR = [
  P("bigWin", {}, "……稼ぎすぎだヨ、今日のお前。ふふ、頼もしいけどサ。——点棒の山なんて、明日にはただの数字ネ。"),
  P("bigWin", { bondMin: 4 }, "山みたいな点棒……。我サ、ほんとはこれ、ちょっと苦手なんだヨ。……でもお前が積んだ山なら、悪くない眺めネ。"),
  P("bigWin", { bondMin: 8 }, "……昔の我は、こういう山を見るのがこわかったんダ。誰かから奪った高さだからネ。……お前の山は、なんでこんなに軽いんだロ。"),
  P("win", {}, "おかえり。いい稼ぎだったみたいネ。今夜は豪勢にいこ？"),
  P("win", {}, "勝ち越しネ。腕、ちゃんと上がってるヨ。我の目に狂いなし！"),
  P("rough", {}, "おかえり。……渋い顔してるネ。ま、卓銭は授業料ダヨ。"),
  P("rough", {}, "そういう日もあるヨ。負けた卓のことは、我と二人で覚えとこ。"),
];
function templateParlorComments(name) {
  const t = (l) => `［テンプレ］${name}・雀荘帰り（${l}）：ここに一言が入ります`;
  return ["bigWin", "win", "rough"].map((tier) => P(tier, {}, t(tier)));
}
// ビビは戦果より「奪われずに帰ってきた」を喜ぶ。bigWin×絆は守りの誇り（点棒＝守りきった証）。
const BIBI_PARLOR = [
  P("bigWin", {}, "わ……こんなに稼いできたの。ふふ、すごい。……でも、いちばんえらいのは、ぜんぶ守りきったこと。"),
  P("bigWin", { bondMin: 4 }, "山みたいな点棒……。ねえ、これ、ぜんぶ奪われなかったってことだよね。……ふふ、ビビ、ちょっと誇らしい。"),
  P("win", {}, "おかえり。勝ち越し、だね。……うん、いい打ち方してた。ビビ、ちゃんと見てたよ。"),
  P("rough", {}, "おかえり。……渋い顔。だいじょうぶ、減ったぶんは、また積めばいい。今日は、休も？"),
];
// ルイナ＝戦果を「いい張り」と楽しむ。bigWin×絆は“賭け金に執着しない”美学（宵越しの銭は持たない）が滲む。
const RUINA_PARLOR = [
  P("bigWin", {}, "おかえり。——派手に荒稼ぎだね。あはっ、その引き、見てて気持ちいいよ。"),
  P("bigWin", { bondMin: 4 }, "山みたいな稼ぎだ。……ま、賭け金なんざ宵越しは持たない主義だけどね。あんたの積んだ山は、悪くない。"),
  P("win", {}, "おかえり。勝ち越しか、いい目だ。今夜は一杯、奢ってもらおうかね。"),
  P("win", {}, "ちゃんと勝って帰ってきたね。——その調子さ。"),
  P("rough", {}, "おかえり。……渋い顔だね。なに、賭け金は戻らない。次で取り返しゃいいのさ。"),
  P("rough", {}, "スッた日か。ま、笑い飛ばして寝な。明日もまた、卓はあるよ。"),
];
// 凌雲＝戦果を「沈まずに守り切った証」として喜ぶ。bigWin×絆は“積んだ点棒＝守り抜いた証”の眺め。
const KUIDOSHI_PARLOR = [
  P("bigWin", {}, "おかえり。……ずいぶん、稼いできたね。ふふ、いい引きだ。"),
  P("bigWin", { bondMin: 4 }, "山みたいな点棒……。守り切って、勝ち切った証だね。……うん、いい眺めだ。"),
  P("win", {}, "おかえり。勝ち越し、だね。……沈まずに、ちゃんと積んできた。えらい。"),
  P("win", {}, "いい打ち方だった。……僕の目に、狂いはないね。"),
  P("rough", {}, "おかえり。……渋い顔だ。だいじょうぶ、減ったぶんは、また受けて取り返せる。"),
  P("rough", {}, "そういう日も、ある。……負けた卓のことは、二人で、覚えておこう。"),
];
const EXPLICIT_PARLOR = { shiyue: SHIYUE_PARLOR, bibi: BIBI_PARLOR, kakeha_ruina: RUINA_PARLOR, kuidoshi: KUIDOSHI_PARLOR };

// ── 凌雲（リン・ユン）── 型D＝さわやかな静。一人称『僕』・穏やかな常体・口癖なし。
// 不動／受け／沈ませない／（覇道編）相手を知る→自分を知る→なりたい自分。素性（恩師・受けに徹した理由）は
// 絆が深いほど滲み、最高絆で口調が崩れ故郷訛り（ネ/ヨ）が一粒戻る。afterChoice は REST/敗北2択の memory と対応。
const KUIDOSHI_GREET = [
  G({}, "今月は、どうしようか。……焦らなくていい。沈まなければ、道は続くよ。"),
  G({}, "さ、稽古をしようか。君の背中は、僕が見てる。"),
  G({ time: "asa" }, "新しい月だね。今月も、一歩ずつ。——派手じゃなくて、いい。"),
  G({ time: "hiru" }, "まだ動けそうだね。無理のない範囲で、もう一打、どう?"),
  G({ time: "yoru" }, "今月も、そろそろ終わりだ。……最後に一つだけ。沈まない一打を、置いていこうか。"),
  G({ condTier: "vgood" }, "いい目をしてる。……攻めても、沈まない。今月の君なら、そう思えるよ。"),
  G({ condTier: "good" }, "うん、落ち着いてる。その不動が、いちばんの武器だよ。"),
  G({ condTier: "bad" }, "少し、重そうだね。……いいんだ。受けて、しのげば、また流れは来る。"),
  G({ condTier: "vbad" }, "顔色が、よくないね。今月は、守りの月。休むのも——立派な一手だよ。"),
  G({ lastOutcome: "daiseikou" }, "この前の、見てたよ。……うん。あれは、見事だった。"),
  G({ lastOutcome: "shippai" }, "うまくいかない月も、ある。……でも、君は沈んでない。それで、十分だよ。"),
  G({ afterChoice: "endure" }, "この前『まだ耐えられる』って言ってたね。……無理は、しないで。倒れる前に、僕に言うこと。"),
  G({ afterChoice: "lean" }, "前は、頼ってくれたね。……うん。その距離で、いい。背中は、預けて。"),
  G({ afterChoice: "attack" }, "攻めたい、って顔だ。……いいよ。受けは僕が持つ。思い切り、前に出てごらん。"),
  G({ afterChoice: "again" }, "この前『すぐ立ち上がる』って言ってたね。……その目だ。今月も、いこう。"),
  G({ afterChoice: "rest" }, "負けた夜は、ちゃんと休めた? ……強がらない君を、僕は信じてるよ。"),
  G({ bondMin: 3 }, "……君が卓にいると、僕も、もう少し前に出てみようと思えるんだ。"),
  G({ bondMin: 6 }, "……あのね。僕が受けに徹するのは、昔、護れなかったことがあるからなんだ。……いつか、ちゃんと話すよ。"),
  // 覇道編
  G({ phase: "hadou" }, "ここから先は、覇道だ。外の卓は、痛みも大きい。……でも、君となら、受け切れる。"),
  G({ phase: "hadou" }, "強い相手ほど、こちらをよく見てくる。……だからこそ、まず“自分を知る”ことだよ。"),
  G({ phase: "hadou", time: "asa" }, "覇道の、月初め。……今月も、なりたい自分を、思い描いていこうか。"),
  G({ phase: "hadou", condTier: "vbad" }, "覇道は、長い。沈む月も、ある。……何度でも、立ち上がればいい。僕らは、そういうトリオだろう?"),
  G({ phase: "hadou", bondMin: 4 }, "……君と打っていると、盾の向こうに、攻めの景色が見える気がするんだネ。……ふふ、独り言だよ。"),
  G({ phase: "hadou", bondMin: 8 }, "“相手を知る”ばかりで、僕は、自分を知るのを忘れていた。……それに気づけたのは、君のおかげだネ。"),
  // 絆最高（口調が崩れ、故郷訛りが戻る特別報酬）
  G({ bondMin: 10 }, "……なあ。僕の“沈ませない”は、半分、自分への誓いなんだ。……君には、言えるけどネ。"),
  G({ bondMin: 10 }, "……僕の師匠も、よくこうやって隣で見ていた。……いまは僕が、その席にいる。不思議なものだネ。"),
  // クリア後
  G({ cleared: true }, "九つの宝、ぜんぶ獲ったね。……でも、僕らの卓は、まだ続く。今日は、何をしようか。"),
  G({ cleared: true, bondMin: 12 }, "……全部終わっても、まだ来てくれるんだネ。……ありがとう。君と打った分だけ、僕は、前に出られるようになった。"),
];
const KUIDOSHI_REST = [
  RT({}, "少し、話そうか。……つらいとき、ひとりで抱えてない?", [
    { key: "lean", label: "頼っていい?", reply: "……もちろん。背中は、僕が受ける。遠慮は、いらないよ。", memory: "lean" },
    { key: "endure", label: "まだ耐えられる", reply: "……うん。でも、倒れる前に、言うこと。約束だよ。", memory: "endure" },
  ]),
  RT({}, "君は——攻めと守り、どっちが、好き?", [
    { key: "attack", label: "攻めるほう", reply: "ふふ。……いいよ。沈んだら、僕が受ける。だから、思い切り。", memory: "attack" },
    { key: "guard", label: "守るほう", reply: "……似たもの同士だね。沈まなければ、勝ちは、近い。", memory: "guard" },
  ]),
  RT({ bondMin: 3 }, "大きい手を受けるの、こわい?", [
    { key: "scared", label: "正直、こわい", reply: "……うん。こわくて、いい。痛みを知るから、受け切れるんだ。", memory: "scared" },
    { key: "used", label: "慣れてきた", reply: "頼もしいね。……でも、慣れすぎないで。痛みは、知っておくものだよ。", memory: "used" },
  ]),
  RT({ phase: "hadou" }, "ね。……君は、どんなふうに、勝ちたい?", [
    { key: "with", label: "誰かと、一緒に", reply: "……うん。麻雀は、ひとりで勝つものじゃない。僕も、そう思うよ。", memory: "with" },
    { key: "become", label: "なりたい自分に", reply: "いい答えだ。……相手を知って、自分を知る。その先に、なりたい自分がいる。", memory: "become" },
  ]),
];
const KUIDOSHI_PRAISE = [
  G({}, "……っ、今の。見事だったよ。……ふふ、僕まで、背筋が伸びた。"),
  G({}, "見てたよ、ぜんぶ。……うん。誰にも、文句は言わせない一打だ。"),
  G({ bondMin: 3 }, "……君の伸びは、まぶしいね。僕も、うかうかしていられない。"),
];
const EXPLICIT_GREET = { shiyue: SHIYUE_GREET, bibi: BIBI_GREET, kakeha_ruina: RUINA_GREET, kuidoshi: KUIDOSHI_GREET };
const EXPLICIT_REST = { shiyue: SHIYUE_REST, bibi: BIBI_REST, kakeha_ruina: RUINA_REST, kuidoshi: KUIDOSHI_REST };
const EXPLICIT_PRAISE = { shiyue: SHIYUE_PRAISE, bibi: BIBI_PRAISE, kakeha_ruina: RUINA_PRAISE, kuidoshi: KUIDOSHI_PRAISE };
const nameOf = (id) => CHARACTER_MASTER.find((c) => c.id === id)?.name || id;

export const MENTOR_GREETINGS = Object.fromEntries(
  CHARACTER_MASTER.map((c) => [c.id, EXPLICIT_GREET[c.id] || templateGreetings(c.name)])
);
export const MENTOR_REST_TALKS = Object.fromEntries(
  CHARACTER_MASTER.map((c) => [c.id, EXPLICIT_REST[c.id] || templateRestTalks(c.name)])
);
// 大成功の素出しボイス。未実装キャラはテンプレ。
function templatePraise(name) { return [G({}, `［テンプレ］${name}・大成功への素出し`)]; }
export const MENTOR_PRAISE = Object.fromEntries(
  CHARACTER_MASTER.map((c) => [c.id, EXPLICIT_PRAISE[c.id] || templatePraise(c.name)])
);
export const MENTOR_BATTLE_QUIPS = Object.fromEntries(
  CHARACTER_MASTER.map((c) => [c.id, EXPLICIT_BATTLE[c.id] || templateBattleQuips(c.name)])
);
export const MENTOR_PARLOR_COMMENTS = Object.fromEntries(
  CHARACTER_MASTER.map((c) => [c.id, EXPLICIT_PARLOR[c.id] || templateParlorComments(c.name)])
);

// 一致候補から「意味の強い条件」を重めにした重み付きランダムで 1 つ返す。
// （condTier は常に ctx にあるため、純粋な具体度比較だと汎用/絆/前回選択の行が潰れる。
//  そこで重み付け：絆・直近結果・前回選択＞極端な調子＞通常の調子＞時間/汎用。変化を残しつつ意味を優先。）
function greetWeight(cond = {}) {
  let w = 1;
  if (cond.phase) w = Math.max(w, 3); // フェーズの空気は重め（覇道編らしさが日常に滲む）
  if (cond.cleared) w = Math.max(w, 3); // クリア後＝余生の空気も同様に重め
  if (cond.treasuresMin != null) w = Math.max(w, 3);
  if (cond.condTier) w = Math.max(w, (cond.condTier === "vbad" || cond.condTier === "vgood") ? 3 : 2);
  if (cond.lastOutcome) w = Math.max(w, 4);
  if (cond.bondMin) w = Math.max(w, cond.bondMin >= 10 ? 5 : 4); // 口調崩れ帯（最高絆の特別報酬）は埋没させない
  if (cond.afterChoice) w = Math.max(w, 4);
  return w;
}
export function pickMentorGreeting(charId, ctx = {}) {
  const all = MENTOR_GREETINGS[charId] || templateGreetings(nameOf(charId));
  const matches = all.filter((e) => gMatch(e.cond, ctx));
  if (!matches.length) return null;
  const weights = matches.map((m) => greetWeight(m.cond));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < matches.length; i++) { if ((r -= weights[i]) < 0) return matches[i].text; }
  return matches[matches.length - 1].text;
}

// 休憩の2択を1つ返す（cond 一致からランダム）。無ければ null。
export function pickRestTalk(charId, ctx = {}) {
  const all = MENTOR_REST_TALKS[charId] || templateRestTalks(nameOf(charId));
  const matches = all.filter((e) => gMatch(e.cond, ctx));
  if (!matches.length) return null;
  return matches[(Math.random() * matches.length) | 0];
}

// 大成功の素出しボイスを1つ返す（絆が高いほど深い素も候補）。無ければ null。
export function pickMentorPraise(charId, ctx = {}) {
  const all = MENTOR_PRAISE[charId] || templatePraise(nameOf(charId));
  const matches = all.filter((e) => gMatch(e.cond, ctx));
  if (!matches.length) return null;
  return matches[(Math.random() * matches.length) | 0].text;
}

// 雀荘帰りの一言を1つ返す（tier 一致＋絆行は greetWeight で重め）。
// 未実装キャラは null（リザルトに行ごと出さない＝［テンプレ］を本番に漏らさない。QA指摘）。
export function pickMentorParlorComment(charId, tier, ctx = {}) {
  const all = EXPLICIT_PARLOR[charId];
  if (!all) return null;
  const matches = all.filter((e) => e.tier === tier && gMatch(e.cond, ctx));
  if (!matches.length) return null;
  const weights = matches.map((m) => greetWeight(m.cond));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < matches.length; i++) { if ((r -= weights[i]) < 0) return matches[i].text; }
  return matches[matches.length - 1].text;
}

// 対局見守り相槌を1つ返す（絆行を greetWeight で重め＝絆で言い方が変わる）。無ければ null。
// rng 注入式：オート対局の演出抽選は決定論（fxRng）で引くため。
export function pickMentorBattleQuip(charId, event, ctx = {}, rng = Math.random) {
  const all = MENTOR_BATTLE_QUIPS[charId] || templateBattleQuips(nameOf(charId));
  const matches = all.filter((e) => e.event === event && gMatch(e.cond, ctx));
  if (!matches.length) return null;
  const weights = matches.map((m) => greetWeight(m.cond));
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < matches.length; i++) { if ((r -= weights[i]) < 0) return matches[i].text; }
  return matches[matches.length - 1].text;
}
