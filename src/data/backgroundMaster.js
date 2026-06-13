// 背景マスタ — シナリオ紙芝居の背景レジストリ（単一の出どころ）。
//
// 各背景は「即時フォールバック用の CSS グラデーション」＋「任意の差し替え画像」を持つ。
// scenarioPlayer は行の backgroundId を見て背景を切り替える（画像があれば cover で被せ、
// 無ければグラデーションのまま）。画像が揃っていなくても崩れない設計。
//
// 素材の置き場（置けば自動で反映）:
//   graphic/bg/<id>.png  （例: graphic/bg/bg-dojo.png）
//
// 列挙の真実は scenario-forge の reference/vocab.json `backgroundIdAllowlist` と
// reference/backgrounds.md。**この3者は常に同期させる**（片方だけ増やさない）。
const BG_DIR = "graphic/bg";

// id, label（生成器向けの用途ラベル）, gradient（即時表示）, image（任意・あれば優先）。
export const BACKGROUND_MASTER = {
  "bg-dojo":       { label: "道場（昼）",       gradient: "linear-gradient(160deg,#2a2018 0%,#3c2c20 55%,#1c140e 100%)" },
  "bg-dojo-dusk":  { label: "道場（夕暮れ）",   gradient: "linear-gradient(160deg,#3a241a 0%,#7a3f24 45%,#2a160e 100%)" },
  "bg-dojo-night": { label: "道場（夜）",       gradient: "linear-gradient(160deg,#10141f 0%,#1b2233 60%,#0a0d15 100%)" },
  "bg-table":      { label: "雀卓（寄り）",     gradient: "radial-gradient(circle at 50% 40%,#246048 0%,#163a2b 80%)" },
  "bg-hall":       { label: "大会会場",         gradient: "linear-gradient(160deg,#1b2536 0%,#2d3c54 55%,#0e151f 100%)" },
  "bg-corridor":   { label: "縁側・廊下",       gradient: "linear-gradient(160deg,#3a3326 0%,#56492f 55%,#241d12 100%)" },
  "bg-street":     { label: "街路",             gradient: "linear-gradient(160deg,#33384a 0%,#4a5168 60%,#20242f 100%)" },
  "bg-rain":       { label: "雨・室内から",     gradient: "linear-gradient(160deg,#222a30 0%,#33414b 60%,#161c20 100%)" },
  "bg-sky":        { label: "空・回想",         gradient: "linear-gradient(180deg,#9fc7e8 0%,#cfe3f0 55%,#f3ead9 100%)" },
  "bg-black":      { label: "暗転",             gradient: "#0a0a0c" },
  "bg-white":      { label: "ホワイトアウト",   gradient: "#f3f1ec" },

  // ── みんちりえ素材（写実系背景）。素材は graphic/bg/sc/ に集約（img で明示）。
  //    商用OK・加工OK・再配布NG・クレジット任意。gradient は読込前/欠落時のフォールバック色。
  // 学園（弟子の出身・プロローグ/青春系シナリオ）
  "bg-school-gate":    { label: "学校の昇降口",   gradient: "linear-gradient(160deg,#3b4350 0%,#262d38 60%,#161b22 100%)", img: "graphic/bg/sc/bg-school-gate.jpg" },
  "bg-school-rooftop": { label: "学校の屋上",     gradient: "linear-gradient(180deg,#9cc3e0 0%,#cfe2ee 55%,#eef4f7 100%)", img: "graphic/bg/sc/bg-school-rooftop.jpg" },
  "bg-classroom":      { label: "教室",           gradient: "linear-gradient(160deg,#caa882 0%,#a8865f 55%,#6e573a 100%)", img: "graphic/bg/sc/bg-classroom.jpg" },
  "bg-school-corridor":{ label: "学校の渡り廊下", gradient: "linear-gradient(160deg,#aebac4 0%,#7d8a96 60%,#4a545d 100%)", img: "graphic/bg/sc/bg-school-corridor.jpg" },
  "bg-clubroom":       { label: "部室",           gradient: "linear-gradient(160deg,#7c8a6e 0%,#5b6650 60%,#343c2c 100%)", img: "graphic/bg/sc/bg-clubroom.jpg" },
  "bg-blackboard":     { label: "黒板",           gradient: "linear-gradient(160deg,#2c3a30 0%,#1f2a23 60%,#131a15 100%)", img: "graphic/bg/sc/bg-blackboard.jpg" },
  "bg-campus":         { label: "学園のキャンパス", gradient: "linear-gradient(160deg,#9fb8cf 0%,#c3d2df 55%,#e6edf2 100%)", img: "graphic/bg/sc/bg-campus.jpg" },
  // 和・師匠（修行・しっとり）
  "bg-kyudo":          { label: "弓道場",         gradient: "linear-gradient(160deg,#3a3326 0%,#56492f 55%,#241d12 100%)", img: "graphic/bg/sc/bg-kyudo.jpg" },
  "bg-washitsu":       { label: "和室",           gradient: "linear-gradient(160deg,#b8a47e 0%,#8f7c58 55%,#5c4d34 100%)", img: "graphic/bg/sc/bg-washitsu.jpg" },
  "bg-ryokan":         { label: "旅館の和室",     gradient: "linear-gradient(160deg,#a89a76 0%,#7e7050 55%,#4e4330 100%)", img: "graphic/bg/sc/bg-ryokan.jpg" },
  // 現代・日常（絆/掛け合い）
  "bg-city":           { label: "都会の街中",     gradient: "linear-gradient(160deg,#3a4150 0%,#525a6c 55%,#21262f 100%)", img: "graphic/bg/sc/bg-city.jpg" },
  "bg-station":        { label: "駅前",           gradient: "linear-gradient(160deg,#3d4453 0%,#565d70 55%,#23272f 100%)", img: "graphic/bg/sc/bg-station.jpg" },
  "bg-cafe":           { label: "喫茶店",         gradient: "linear-gradient(160deg,#6b4f38 0%,#4e3a29 55%,#2c2017 100%)", img: "graphic/bg/sc/bg-cafe.jpg" },
  "bg-arcade":         { label: "商店街",         gradient: "linear-gradient(160deg,#5a4f3e 0%,#736550 55%,#352d22 100%)", img: "graphic/bg/sc/bg-arcade.jpg" },
  "bg-convenience":    { label: "コンビニ",       gradient: "linear-gradient(160deg,#9fb4b0 0%,#7c918d 55%,#465552 100%)", img: "graphic/bg/sc/bg-convenience.jpg" },
  "bg-park":           { label: "公園",           gradient: "linear-gradient(160deg,#86a86a 0%,#5f7d4a 55%,#33472a 100%)", img: "graphic/bg/sc/bg-park.jpg" },
  "bg-festival":       { label: "縁日の屋台",     gradient: "linear-gradient(160deg,#3a2740 0%,#5a3a4a 50%,#241526 100%)", img: "graphic/bg/sc/bg-festival.jpg" },
  "bg-train":          { label: "電車の車内",     gradient: "linear-gradient(160deg,#9aa6ad 0%,#737f87 55%,#444d53 100%)", img: "graphic/bg/sc/bg-train.jpg" },
  // 裏・緊張（アビス/対局前の張り詰め）
  "bg-bar":            { label: "バー",           gradient: "linear-gradient(160deg,#2c2230 0%,#3a2a33 55%,#16101a 100%)", img: "graphic/bg/sc/bg-bar.jpg" },
  "bg-hideout":        { label: "アジト",         gradient: "linear-gradient(160deg,#2a2a30 0%,#3a3a44 55%,#141418 100%)", img: "graphic/bg/sc/bg-hideout.jpg" },
  "bg-basement":       { label: "地下室",         gradient: "linear-gradient(160deg,#26262a 0%,#34343c 55%,#121214 100%)", img: "graphic/bg/sc/bg-basement.jpg" },
  "bg-ruins":          { label: "廃墟の部屋",     gradient: "linear-gradient(160deg,#3a3630 0%,#4c463c 55%,#201d18 100%)", img: "graphic/bg/sc/bg-ruins.jpg" },
};

const DEFAULT = { label: "(未定義)", gradient: "linear-gradient(160deg,#2a2018,#1c140e)" };

// 背景定義を返す。画像は entry.img があればそれ、無ければ規約 graphic/bg/<id>.png を導出
//（実ファイルの有無は呼び出し側がプローブ）。
export function bgDef(id) {
  const def = BACKGROUND_MASTER[id] || DEFAULT;
  const image = BACKGROUND_MASTER[id] ? (def.img || `${BG_DIR}/${id}.png`) : null;
  return { id, ...def, image };
}
