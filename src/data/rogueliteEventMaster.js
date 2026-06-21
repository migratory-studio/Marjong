// 楼光の館・遭遇イベント・マスタ — docs「B. ローグライト」／direction-attachment-first。
//
// 戦わないフロア「遭遇」で出す“短い会話＋2択”。本作の核（キャラ愛着×双方向＝返せる）に直結する。
// 完全マスタ駆動：文言・2択・結果はここだけ。適用ロジックは main.js（applyEventOutcome）。
//
// 1イベント:
//   { id, weight, speakerId?, title, lines:[…], choices:[ { label, reply, outcome } ] }
//   speakerId … 立ち絵を出すキャラID（相棒など）。null＝ナレーション（行きずりの遭遇）。
//   outcome（いずれか／複数可）:
//     effect   … cardEffects.applyEffect に渡す生 effect（dealMul/takeReduce/heal/maxHpUp/grantAbility/compound）
//     cardId   … 特定カードを付与（rogueliteCardMaster）
//     draft    … true で無料バフ3択
//     healFrac … パーティHPを最大比で回復（0..1）
//     hurtFrac … パーティHPを最大比で減少（供物・最低1は残す）
//   reply … 選択後にキャラが短く「返す」一言（双方向の手触り）。
//
// 段階解放（絆/進行）は将来 condMatches で足せる土台にしておく（今は無条件）。

export const ROGUELITE_EVENT_MASTER = [
  {
    id: "fallen-player",
    weight: 10,
    speakerId: null,
    title: "行き倒れの打ち手",
    lines: ["階段の踊り場に、力尽きた打ち手がうずくまっている。", "「……牌を、もう一度だけ握りたい」と、かすれた声。"],
    choices: [
      {
        label: "肩を貸す（HPを少し分けてやる）",
        reply: "「恩に着る……この盾（鉄壁の陣）、持っていけ」",
        outcome: { hurtFrac: 0.15, item: "iron-wall" },
      },
      {
        label: "見なかったことにする",
        reply: "先を急ごう。館はまだ深い。",
        outcome: { effect: { kind: "dealMul", mul: 1.1 } },
      },
    ],
  },
  {
    id: "shiyue-pondering",
    weight: 10,
    speakerId: "shiyue",
    title: "詩玥の読み",
    lines: ["「ねえ、ちょっと止まらない？」", "詩玥が壁の影を、じっと睨んでいる。", "「……この先、嫌な気配がする。我の勘、当たるんだから」"],
    choices: [
      {
        label: "詩玥の読みに従う（慎重に進む）",
        reply: "「ふふ、素直でよろしい。守りを固めておくわ」",
        outcome: { effect: { kind: "compound", parts: [{ kind: "takeReduce", rate: 0.15 }, { kind: "heal", amount: 0.15 }] } },
      },
      {
        label: "構わず突き進む（攻めで押す）",
        reply: "「……もう。無茶するんだから。なら、ツモって押し切るわよ」",
        outcome: { effect: { kind: "dealMul", mul: 1.25 } },
      },
    ],
  },
  {
    id: "pile-of-sticks",
    weight: 9,
    speakerId: "shiyue",
    title: "点棒の山",
    lines: ["通路の真ん中に、点棒がうずたかく積まれている。", "詩玥の表情が、ほんの少しだけ硬くなる。", "「……点棒なんて、好きにすればいいわ。我は、いらない」"],
    choices: [
      {
        label: "点棒を懐に（HP最大値を増やす）",
        reply: "「現金なんだから。……まあ、生き延びるのも実力よ」",
        outcome: { effect: { kind: "maxHpUp", mul: 1.2 } },
      },
      {
        label: "蹴り崩して進む（詩玥に倣う）",
        reply: "「……っ。ふぅん、あんたも変わり者ね。嫌いじゃないわ」",
        outcome: { effect: { kind: "dealMul", mul: 1.2 }, cardId: "grant-lucky-draw" },
      },
    ],
  },
  {
    id: "shady-bet",
    weight: 8,
    speakerId: null,
    title: "怪しい誘い",
    lines: ["仮面の打ち手が、骰子を転がしながら囁く。", "「運試しはどうだい。痛い目を見るか、宝を掴むか――」"],
    choices: [
      {
        label: "賭けに乗る（HPを払って強力なバフ）",
        reply: "「ハハッ、いい度胸だ。持っていきな」",
        outcome: { hurtFrac: 0.3, effect: { kind: "compound", parts: [{ kind: "dealMul", mul: 1.4 }, { kind: "takeReduce", rate: 0.2 }] } },
      },
      {
        label: "断って先へ（堅実に1枚）",
        reply: "「つまらない奴め。……まあいい、餞別だ」",
        outcome: { draft: true },
      },
    ],
  },
  {
    id: "old-master-tea",
    weight: 8,
    speakerId: null,
    title: "一服の老師",
    lines: ["小さな茶室。穏やかな老人が、茶を差し出してくる。", "「急いては事を仕損じる。まずは、一服しなされ」"],
    choices: [
      {
        label: "茶をいただく（しっかり回復）",
        reply: "「ふぉっふぉ。良い飲みっぷりじゃ」",
        outcome: { healFrac: 0.4 },
      },
      {
        label: "礼だけして先へ（手数を得る）",
        reply: "「達者でな。……牌は、逃げぬよ」",
        outcome: { cardId: "grant-chunchan" },
      },
    ],
  },
];

export function eventById(id) {
  return ROGUELITE_EVENT_MASTER.find((e) => e.id === id) || null;
}

// 遭遇イベントを1つ重み抽選（直近 exclude を避ける）。
export function pickEvent(rng, { exclude = [] } = {}) {
  const ex = new Set(exclude);
  let pool = ROGUELITE_EVENT_MASTER.filter((e) => (e.weight || 0) > 0 && !ex.has(e.id));
  if (!pool.length) pool = ROGUELITE_EVENT_MASTER.filter((e) => (e.weight || 0) > 0);
  const total = pool.reduce((a, e) => a + e.weight, 0);
  let r = rng() * total;
  for (const e of pool) if ((r -= e.weight) < 0) return e;
  return pool[0] || null;
}
