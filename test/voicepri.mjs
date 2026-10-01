// 局中セリフの「状況の言い分け」回帰テスト（DOM不要）。インゲーム改善（2026-09-30）。
//  (1) pri: 一致した候補のうち優先度の最も高いものだけから選ぶ（状況限定の台詞が汎用に埋もれない）
//  (2) 新しい条件キー firstHand / allLast / hpPinch / selfTenpai の評価
//  (3) pri を持たない既存イベントは従来どおり（全候補から選ぶ）
import { pickVoiceLine } from "../src/data/voiceLines.js";
import { CHARACTER_VOICE_MASTER } from "../src/data/characterVoiceMaster.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };

const SY = CHARACTER_VOICE_MASTER.shiyue;
const textsOf = (event, pred) => new Set(SY.filter((e) => e.event === event && pred(e)).map((e) => e.text));
// 何度も引いて、出た台詞がすべて期待集合に入っているか（ランダム選択なので複数回試す）。
const allIn = (event, ctx, set, n = 40) => {
  for (let i = 0; i < n; i++) {
    const t = pickVoiceLine("shiyue", event, ctx);
    if (!set.has(t)) return false;
  }
  return true;
};

// ---- (1)(2) handStart の優先度 ----
{
  const first = textsOf("handStart", (e) => e.cond?.firstHand === true);
  const allLast = textsOf("handStart", (e) => e.cond?.allLast === true);
  const pinchLv1 = textsOf("handStart", (e) => e.cond?.hpPinch === true && !e.cond?.companionBondMin);
  const pinchAll = textsOf("handStart", (e) => e.cond?.hpPinch === true);
  const afterWin = textsOf("handStart", (e) => e.cond?.lastHandResult === "agari");
  const generic = textsOf("handStart", (e) => !e.pri);

  ok("詩玥に一局目の局頭台詞がある", first.size >= 1);
  ok("一局目は一局目の台詞だけから選ぶ", allIn("handStart", { firstHand: true }, first));
  ok("オーラスはオーラスの台詞だけから選ぶ", allIn("handStart", { allLast: true }, allLast));
  ok("ピンチはオーラスより優先（pri 3 > 2）", allIn("handStart", { allLast: true, hpPinch: true }, pinchLv1));
  ok("ピンチ×絆Lv3で絆つきのピンチ台詞も候補に入る", allIn("handStart", { hpPinch: true, companionBondLevel: 3 }, pinchAll));
  ok("前局で和了した次の局は、その台詞だけから選ぶ", allIn("handStart", { lastHandResult: "agari" }, afterWin));
  ok("状況が無い局は汎用の台詞（pri なし）から選ぶ", allIn("handStart", {}, generic));
}

// ---- (2) 他家リーチ：自分も聴牌か ----
{
  const push = textsOf("oppRiichi", (e) => e.cond?.selfTenpai === true);
  const fold = textsOf("oppRiichi", (e) => e.cond?.selfTenpai === false && !e.cond?.companionBondMin);
  ok("他家リーチ×自分も聴牌 → めくり合いの台詞", allIn("oppRiichi", { selfTenpai: true }, push));
  ok("他家リーチ×自分は未聴牌 → 慎重の台詞", allIn("oppRiichi", { selfTenpai: false }, fold));
}

// ---- (3) pri を持たない既存イベントは従来どおり ----
{
  const small = textsOf("damage", (e) => e.cond?.dmgTier === "small" && !e.cond?.voiceSet);
  ok("被ダメ（小）は従来どおり小の台詞から", allIn("damage", { dmgAmount: 1000, hpFrac: 0.9 }, small));
  const matchStartLv1 = textsOf("matchStart", (e) => !e.cond?.companionBondMin && !e.cond?.voiceSet);
  ok("対局開始（絆Lv1）は絆つきの台詞を出さない", allIn("matchStart", { companionBondLevel: 1 }, matchStartLv1));
  const matchStartLv5 = textsOf("matchStart", (e) => !e.cond?.voiceSet);
  ok("対局開始（絆Lv5）は絆つきの台詞も候補に入る", allIn("matchStart", { companionBondLevel: 5 }, matchStartLv5));
}

// ---- 未実装キャラは新イベントで黙る（［テンプレ］を画面に出さない） ----
{
  let leaked = false;
  for (const [id, lines] of Object.entries(CHARACTER_VOICE_MASTER)) {
    for (const ev of ["oppRiichi", "selfRiichi", "oppBigWin"]) {
      const t = pickVoiceLine(id, ev, {});
      if (t && t.startsWith("［テンプレ］")) leaked = true;
    }
    void lines;
  }
  ok("新イベントでテンプレ文言が出ない", !leaked);
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
