// プロローグ（弟子の出発点）— 手書きシナリオ（scenario-forge 非経由）。
//
// 異能雀士の卵が集う学び舎の卒業式。弟子＝首席。世界観（裏の異能麻雀・ソウル・段位・
// 九蓮宝士）を説明しつつ、巣立って「師」を求める動機までを描く。末尾は、作成フローで
// すでに選び終えた師匠が立つ「決めた、この人しかいない」のシーンで締める。
//
// playScenario(null, { lines: buildPrologueLines({ avatar, mentor }), audio, onEnd }) で再生する。
// 立ち絵は CHARACTER_MASTER に依存せず standings の portraitSrc 直指定でも出せる（弟子＝作成した
// 立ち絵プリセット／モブ＝シルエット）。師匠だけは CHARACTER_MASTER のキャラなので characterId 指定。
import { presetById } from "./avatarPresetMaster.js";

// 学び舎のモブ（同期・学園長）はシルエットを使い回す（graphic/chars/mobs/N.png）。
const mob = (n) => `graphic/chars/mobs/${n}.png`;

// 「決めた」きっかけ（師匠に依存しない普遍の決め手・毎回ランダムで1つ）。
const TRIGGERS = [
  "理由なんて、後づけでいい。心が、勝手にあの人の名を選んでいた。",
  "同じ卓に座りたい——そう思える打ち手は、ひとりだけだった。",
  "初めてあの人の麻雀を見た日の、背筋が震えた感覚を、まだ覚えている。",
  "迷いは一瞬。憧れは、たぶんずっと前から決まっていたらしい。",
];

// 師匠ごとの「入門のひとこと」。未実装師匠は汎用にフォールバック。
function mentorGreeting(mentor) {
  const byId = {
    shiyue: "ふぅん……我（ウォ）の弟子になりたいネ？　いいヨ。「ツモれば勝ち」——それだけ覚えとけば、ナントカなるヨ。",
    bibi: "……いらっしゃい。わたしのところに来たからには、もう、ころばせない。だいじょうぶ。",
    kakeha: "あら、いい目をしてる。あたしと組むなら——生き方ごと、賭けてもらうわよ。",
  };
  return byId[mentor?.id] || `${mentor?.name || "その人"}は、静かにこちらを見て、ひとつうなずいた。`;
}

export function buildPrologueLines({ avatar, mentor } = {}) {
  const deshiName = avatar?.name || "あなた";
  const deshiSrc = presetById(avatar?.presetIds?.standing)?.assetPath || null;

  // 立ち絵パーツ（standings 用）。
  const deshi = (position) => ({ characterId: "deshi", position, portraitSrc: deshiSrc, name: deshiName });
  const principal = (position) => ({ characterId: "mob-principal", position, portraitSrc: mob(3), name: "学園長" });
  const classL = { characterId: "mob-l", position: "left", portraitSrc: mob(6), name: "同期" };
  const classR = { characterId: "mob-r", position: "right", portraitSrc: mob(9), name: "同期" };
  const mentorStand = (position) => ({ characterId: mentor?.id, position });

  const trigger = TRIGGERS[Math.floor(Math.random() * TRIGGERS.length)];

  // 行ビルダ（lineNo は自動採番）。
  const rows = [
    { bg: "bg-campus", stand: [classL, classR], text:
      "卒業式。異能雀士の卵が集う学び舎で、今日、十数人が巣立っていく。" },
    { bg: "bg-black", stand: [], text:
      "表向きは、どこにでもある学校。けれど裏では——ソウルを賭け、異能で麻雀を打つ者たちがいる。卓は、力と生き方を映す鏡だ。" },
    { bg: "bg-campus", stand: [classL, principal("center"), classR], speaker: "mob-principal", name: "学園長", text:
      "——首席。壇上へ。" },
    { bg: "bg-campus", stand: [principal("left"), deshi("center")], text:
      `名を呼ばれて、前へ出る。この期で最も優れた異能雀士として、${deshiName}は壇に立った。` },
    { bg: "bg-campus", stand: [principal("left"), deshi("center")], speaker: "mob-principal", name: "学園長", text:
      "君の異能は本物だ。だが——ここはまだ、入口にすぎない。" },
    { bg: "bg-campus", stand: [principal("left"), deshi("center")], speaker: "mob-principal", name: "学園長", text:
      "段位を重ね、九つの宝を集めた者だけが名乗れる称号がある。『九蓮宝士（きゅうれんほうし）』——九つの大会すべてを制した、頂の名だ。" },
    { bg: "bg-campus", stand: [principal("left"), deshi("center")], speaker: "mob-principal", name: "学園長", text:
      "巷ではこう囁かれる。『九つの宝が揃えば、願いがひとつ叶う』と。……さあ、君は何を願う？" },
    { bg: "bg-campus", stand: [deshi("center")], text:
      "胸の奥で、答えはもう決まっている。まだ見ぬ頂の景色を、この目で見る。それだけだ。" },
    { bg: "bg-campus", stand: [deshi("center")], text:
      "式は終わり、同期たちは散っていく。それぞれが、自分の師を求めて。" },
    { bg: "bg-street", stand: [deshi("center")], text:
      "ここから先は、独りでは登れない。己の異能を磨いてくれる『師』を見つけ、その門を叩く。それが、頂への最初の一歩だ。" },
    { bg: "bg-street", stand: [deshi("left")], text:
      "学び舎を出る。さて——誰の門を、叩こうか。" },
    { bg: "bg-street", stand: [deshi("left")], text:
      "噂は耳にしている。攻めを極めた者。決して点を渡さぬ者。生き方ごと卓に賭ける者……名うての打ち手たち。" },
    { bg: "bg-street", stand: [deshi("left")], text: trigger },
    { bg: "bg-street", stand: [deshi("left"), mentorStand("right")], text:
      "決めた。——この人しかいない。" },
    { bg: "bg-street", stand: [deshi("left"), mentorStand("center")], text:
      `${mentor?.name || "その人"}。あの人の卓に、座らせてもらおう。` },
    { bg: "bg-street", stand: [deshi("left"), mentorStand("center")], speaker: mentor?.id, text:
      mentorGreeting(mentor) },
  ];

  return rows.map((r, idx) => ({
    scenarioId: "prologue",
    lineNo: idx + 1,
    speakerCharacterId: r.speaker || null,
    speakerNameOverride: r.name || null,
    text: r.text,
    standings: r.stand,
    backgroundId: r.bg,
  }));
}
