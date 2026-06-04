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
};

const DEFAULT = { label: "(未定義)", gradient: "linear-gradient(160deg,#2a2018,#1c140e)" };

// 背景定義を返す。画像パスは規約から導出（実ファイルの有無は呼び出し側がプローブ）。
export function bgDef(id) {
  const def = BACKGROUND_MASTER[id] || DEFAULT;
  return { id, ...def, image: BACKGROUND_MASTER[id] ? `${BG_DIR}/${id}.png` : null };
}
