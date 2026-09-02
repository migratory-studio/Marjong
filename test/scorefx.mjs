// 和了点を動かす能力の「一行」（abilityMaster.scoreFxLabel）の回帰テスト（DOM不要）。
// Run: node test/scorefx.mjs
//
// 器の設計は docs/character-ingame-fx-plan.md §11-3-1。和了画面（showWinResult →
// playScoreFx）が「素点 → 一行 → 改変後」を見せるとき、汎用の 増加!/減少! ではなく
// その能力の語彙を出すためのマスタ。ここでは次を機械的に守る:
//   - 和了点を動かす能力（MODIFY_SCORE / MODIFY_SCORE_GLOBAL）には必ず一行がある
//     ＝新しいキャラを足したとき、和了画面だけ無言に戻るのを防ぐ
//   - 禁じ手（倍率・％の数字をそのまま出す）を含まない … §11-1
//   - 大ラベル（「——」の前）が長すぎない＝1280×720の和了画面で崩れない
//   - {name}（誰の能力か）を使えるのは場能力だけ。勝者本人の能力に名前は要らない
import { ABILITY_MASTER, abilityDef } from "../src/data/abilityMaster.js";
import { createAbility } from "../src/abilities/registry.js";
import { Hooks } from "../src/abilities/hooks.js";
import "../src/abilities/builtins/index.js";

let fails = 0;
const ok = (label, cond) => { console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); if (!cond) fails++; };

// 和了点に触る能力を実インスタンスから拾う（マスタの手書きリストと二重管理しない）。
const scoring = [];   // 勝者本人の倍率系
const fieldScoring = []; // 場能力（他家の和了にも効く）
for (const id of Object.keys(ABILITY_MASTER)) {
  let ab;
  try { ab = createAbility(id); } catch { continue; } // 未登録IDは対象外
  if (typeof ab[Hooks.MODIFY_SCORE_GLOBAL] === "function") fieldScoring.push(id);
  else if (typeof ab[Hooks.MODIFY_SCORE] === "function") scoring.push(id);
}
ok("和了点を動かす能力を検出できている", scoring.length + fieldScoring.length >= 5);

const BANNED = [/[0-9０-９]\s*倍/, /[×x]\s*[0-9０-９]/, /[0-9０-９]+\s*[%％]/, /[0-9０-９]+\s*点/];

for (const id of [...scoring, ...fieldScoring]) {
  const def = abilityDef(id);
  const label = def.scoreFxLabel;
  const name = def.name || id;
  ok(`${name}: 和了画面の一行がある`, !!label && (typeof label.up === "string" || typeof label.down === "string"));
  if (!label) continue;
  for (const dir of ["up", "down"]) {
    const text = label[dir];
    if (!text) continue;
    ok(`${name}(${dir}): 倍率や点数の数字を出さない（§11-1 の禁じ手）`, !BANNED.some((re) => re.test(text)));
    const head = text.split("——")[0];
    ok(`${name}(${dir}): 大ラベルが12文字以内（${[...head].length}文字）`, [...head].length <= 12);
    ok(`${name}(${dir}): 「——」は多くても1つ`, text.split("——").length <= 2);
    if (text.includes("{name}")) {
      ok(`${name}(${dir}): {name} を使うのは場能力だけ`, fieldScoring.includes(id));
    }
  }
}

// ラベルを持たない能力は従来どおり無指定でよい（フォールバックが効く）。
ok("ラベル未設定の能力は null で返る（UI側が 増加!/減少! に落ちる）", abilityDef("lucky-draw").scoreFxLabel === null);
ok("未知IDでも落ちない", abilityDef("no-such-ability").scoreFxLabel === null);

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
