// 師弟ホームの「師匠の一言」(homeGreeting) と「休憩の2択コミュ」(restTalk)。
// 対局セリフ(characterVoiceMaster)とは別系統。状況連動＋プレイヤーの選択を“覚える”（双方向）。
//
// ── 解決ロジック ──
//   pickMentorGreeting(charId, ctx) : 状況に一致する一言を1つ返す（より具体的な条件を優先）。
//   pickRestTalk(charId, ctx)       : 休憩の2択（prompt＋choices[2]）を1つ返す。
//
// ── ctx 語彙（任意・無ければ既定で評価。指定の無い行は常に候補＝フォールバック）──
//   condTier   : 弟子の調子 tone  "vbad"|"bad"|"ok"|"good"|"vgood"
//   time       : 時間帯          "asa"|"hiru"|"yoru"（その日の行動数 0/1/2+）
//   bondMin    : 絆Lv 下限
//   lastOutcome: 直近の訓練結果  "daiseikou"|"shippai"（最近のみ）
//   afterChoice: 直近の休憩2択で覚えたタグ（双方向の呼び戻し）
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
  return true;
}

// 未実装キャラ用テンプレ（grep キーワード ［テンプレ］ つき）。
function templateGreetings(name) {
  const t = (l) => `［テンプレ］${name}・${l}：ここに一言が入ります`;
  return [
    G({}, t("ホーム挨拶")),
    G({ time: "asa" }, t("朝の挨拶")),
    G({ time: "yoru" }, t("夜の挨拶")),
    G({ condTier: "vgood" }, t("弟子が絶好調")),
    G({ condTier: "vbad" }, t("弟子が絶不調")),
    G({ lastOutcome: "daiseikou" }, t("前回大成功への反応")),
    G({ lastOutcome: "shippai" }, t("前回失敗へのフォロー")),
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
  G({}, "今日はどうする？ まずは一息つくか、腕を磨くか。"),
  G({}, "さ、修行の時間ネ。我（ウォ）がしっかり見ててやるダヨ。"),
  G({ time: "asa" }, "おはよ。今日も一日、ツモっていこ？"),
  G({ time: "hiru" }, "お、まだ動けるネ。昼の一打、いっとく？"),
  G({ time: "yoru" }, "そろそろ日が暮れるヨ。最後にもうひと頑張り？　無理は禁物だけどネ。"),
  G({ condTier: "vgood" }, "うわ、いい顔してるヨ今日！　乗ってる日は伸びるダヨ、いっとこ？"),
  G({ condTier: "good" }, "調子よさそうネ。この波、逃さないでヨ。"),
  G({ condTier: "bad" }, "ちょっと重そう？　ま、そういう日もあるダヨ。"),
  G({ condTier: "vbad" }, "……顔色、よくないネ。今日は休むのも修行だヨ？　無理しないで。"),
  G({ lastOutcome: "daiseikou" }, "この前のアレ、見事だったネ！　その調子で頼むヨ、相棒。"),
  G({ lastOutcome: "shippai" }, "この前はうまくいかなかったネ。……気にすんな、次があるダヨ。"),
  G({ afterChoice: "honest" }, "この前『しんどい』って言ってたネ。今日は……ちゃんと見とくから、言ってヨ？"),
  G({ afterChoice: "tough" }, "前は強がってたけど、ホントに平気ネ？　ま、その意気は好きだヨ。"),
  G({ afterChoice: "scary" }, "点棒、こわいって言ってたネ。……だいじょぶ、減ったらツモで返せばいいダヨ。"),
  G({ bondMin: 3 }, "……なんか、お前といると調子が出るんダ。我のほうが、ネ。"),
  // 絆最高：口調がふっと崩れる特別報酬。
  G({ bondMin: 5 }, "……なあ。『ツモれば勝ち』ってあれ、半分は自分に言い聞かせてるんだ。……お前には、言えるけどネ。"),
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
];

// ── ビビ ── 物静か・凛とした芯。守りの人。心を許すと茶目っ気。
const BIBI_GREET = [
  G({}, "……今日も来たね。えらい。何をする？"),
  G({}, "焦らなくていい。守りを固めるところから、ね。"),
  G({ time: "asa" }, "おはよう。……朝の静けさ、嫌いじゃないでしょ。"),
  G({ time: "yoru" }, "もう夜。無理は禁物。……でも、あと一つだけなら、見ててあげる。"),
  G({ condTier: "vgood" }, "いい目をしてる。……今日は、攻めても沈まないかもね。"),
  G({ condTier: "vbad" }, "顔が疲れてる。……今日は守りの日。休むのも、立派な手。"),
  G({ lastOutcome: "daiseikou" }, "この前のあれ、見てた。……ちゃんと、誰にも奪わせなかったね。"),
  G({ lastOutcome: "shippai" }, "うまくいかない日もある。……守りきれなくても、あなたは沈んでない。"),
  G({ afterChoice: "rely" }, "この前、頼ってくれたね。……うん、その距離で、いい。"),
  G({ bondMin: 5 }, "……ねえ。わたしが守るのは、点棒じゃなくて——あなた、なんだよ。" ),
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
  G({}, "来たわね。さて……今日はどんな賭けに出る？"),
  G({}, "勝率？　そんなの、賽を振ってから考えればいいのよ。"),
  G({ time: "asa" }, "朝から熱いじゃない。……いい目をしてるわ。"),
  G({ time: "yoru" }, "夜は、勝負が映えるの。最後にひと勝負、どう？"),
  G({ condTier: "vgood" }, "ふふ、ツキが乗ってるわね。こういう日は——大きく張りなさい。"),
  G({ condTier: "vbad" }, "今日は分が悪い。……引き際を知るのも、博徒の才よ。"),
  G({ lastOutcome: "daiseikou" }, "この前の大勝負、見事だったわ。……痺れたわよ、ちょっとね。"),
  G({ lastOutcome: "shippai" }, "負けたって？　いいじゃない。笑って次を張れる子は、強くなる。"),
  G({ afterChoice: "allin" }, "この前は全張りだったわね。……その度胸、嫌いじゃないわ。"),
  G({ bondMin: 5 }, "……あんたには教えとく。あたしが本当に賭けてるのは、点棒じゃない。生き方のほうよ。"),
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

const EXPLICIT_GREET = { shiyue: SHIYUE_GREET, bibi: BIBI_GREET, kakeha_ruina: RUINA_GREET };
const EXPLICIT_REST = { shiyue: SHIYUE_REST, bibi: BIBI_REST, kakeha_ruina: RUINA_REST };
const EXPLICIT_PRAISE = { shiyue: SHIYUE_PRAISE, bibi: BIBI_PRAISE, kakeha_ruina: RUINA_PRAISE };
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

// 一致候補から「意味の強い条件」を重めにした重み付きランダムで 1 つ返す。
// （condTier は常に ctx にあるため、純粋な具体度比較だと汎用/絆/前回選択の行が潰れる。
//  そこで重み付け：絆・直近結果・前回選択＞極端な調子＞通常の調子＞時間/汎用。変化を残しつつ意味を優先。）
function greetWeight(cond = {}) {
  let w = 1;
  if (cond.condTier) w = Math.max(w, (cond.condTier === "vbad" || cond.condTier === "vgood") ? 3 : 2);
  if (cond.lastOutcome) w = Math.max(w, 4);
  if (cond.bondMin) w = Math.max(w, 4);
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
