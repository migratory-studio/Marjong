// 賭けの落とし前（"betLost"）の回帰テスト（DOM不要）。
// Run: node test/betlost.mjs
//
// 設計は docs/character-ingame-fx-plan.md §11-3-3。ギャンブラーは構造上、半分は外れる。
// 外れた局が無演出だと「点棒を損しただけ」で終わるので、張った局が実らなかったときだけ
// 次の局の頭で一度返す。ここでは次を守る:
//   - 賭けるキャラ（ルイナ／ドラニエル／焔）は、どの結末（放銃・被ツモ・流局）でも言葉を持つ
//   - 賭けないキャラは betLost を持たない（＝通常の局頭セリフにフォールバックする）
//   - アガった局は呼ばれない（main.js 側の契約）ので "agari" 用の行は作らない
//   - テンプレ未記入（［テンプレ］）が混ざっていない
import { pickVoiceLine } from "../src/data/voiceLines.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };

const GAMBLERS = ["kakeha_ruina", "doranie", "homura"];
const RESULTS = ["dealIn", "tsumoLoss", "draw"];

for (const id of GAMBLERS) {
  for (const result of RESULTS) {
    // 絆下限つきの行に依存しない＝既定（Lv1相当）でも必ず返ること。
    const line = pickVoiceLine(id, "betLost", { lastHandResult: result });
    ok(`${id}/${result}: 言葉がある`, typeof line === "string" && line.length > 0);
    ok(`${id}/${result}: テンプレ未記入でない`, !String(line).includes("［テンプレ］"));
  }
  // 絆が上がっても壊れない（上位帯の行が混ざっても必ず1つ返る）。
  const bonded = pickVoiceLine(id, "betLost", { lastHandResult: "draw", companionBondLevel: 5 });
  ok(`${id}: 高絆でも返る`, typeof bonded === "string" && bonded.length > 0);
}

// 賭けないキャラは持たない＝局頭セリフに落ちる（main.js の fireBetLostTalk が false を返す）。
for (const id of ["shiyue", "ren", "bibi", "mamori"]) {
  ok(`${id}: betLost を持たない（フォールバックする）`, pickVoiceLine(id, "betLost", { lastHandResult: "draw" }) === null);
}
// 結末で出し分けている（同じ一言を使い回していない）。ランダム選択があるので複数回引いて集合で見る。
for (const id of GAMBLERS) {
  const seen = new Set();
  for (const result of RESULTS) for (let i = 0; i < 12; i++) seen.add(pickVoiceLine(id, "betLost", { lastHandResult: result }));
  ok(`${id}: 放銃・被ツモ・流局で言葉が違う（${seen.size}種）`, seen.size >= RESULTS.length);
}

// ── 焔「火が細い」聴牌の警告（§11-2-1 #2）と、蓮「安手が咲いた」勝ち名乗り（§11-2-3 #4#5）──
// どちらも main.js が状況（燃料が少ない聴牌／3ハン以下の和了）を判定し、文言はマスタから引く。
{
  const weak = pickVoiceLine("homura", "flameWeak", {});
  ok("焔: 火が細い聴牌の一言がある", typeof weak === "string" && weak.length > 0 && !weak.includes("［テンプレ］"));
  ok("焔以外は flameWeak を持たない", pickVoiceLine("shiyue", "flameWeak", {}) === null);

  const bloom = pickVoiceLine("ren", "lotusBloom", {});
  ok("蓮: 安手が咲いた勝ち名乗りがある", typeof bloom === "string" && bloom.length > 0 && !bloom.includes("［テンプレ］"));
  ok("蓮以外は lotusBloom を持たない", pickVoiceLine("kakeha_ruina", "lotusBloom", {}) === null);
  const seen = new Set();
  for (let i = 0; i < 24; i++) seen.add(pickVoiceLine("ren", "lotusBloom", { companionBondLevel: 5 }));
  ok(`蓮: 高絆で選択肢が増える（${seen.size}種）`, seen.size >= 3);
}

// ── 第3弾後半＝アビス（§14）のセリフ ──
// ネビュラ「痛みが倍になった」／カリュブディス「呑まれた和了牌」「蒐集した流局」。
{
  for (const [id, ev] of [["nebula", "curseHit"], ["charybdis", "abyssDeny"], ["charybdis", "abyssCollect"]]) {
    const line = pickVoiceLine(id, ev, {});
    ok(`${id}/${ev}: 言葉がある`, typeof line === "string" && line.length > 0 && !line.includes("［テンプレ］"));
  }
  ok("他キャラは curseHit を持たない", pickVoiceLine("shiyue", "curseHit", {}) === null);
  ok("他キャラは abyssDeny を持たない", pickVoiceLine("janedoe", "abyssDeny", {}) === null);
  const seen = new Set();
  for (let i = 0; i < 24; i++) seen.add(pickVoiceLine("charybdis", "abyssCollect", { companionBondLevel: 5 }));
  ok(`カリュブディス: 高絆で選択肢が増える（${seen.size}種）`, seen.size >= 3);
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
