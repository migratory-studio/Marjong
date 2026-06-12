// 師匠ボイス ⇄ 表（CSV）パイプラインの回帰テスト（DOM不要）。
// (1) 往復が壊れない: マスタ→行→CSV→行→マスタ用データ が元のデータと一致する。
// (2) 検証が機能する: 不正な行（語彙ミス・必須欄欠落・テンプレ残置）を errors として拾う。
import {
  rowsFromMaster, masterDataFromRows, validateRows, toCsv, fromCsv, COLUMNS,
} from "../tools/voiceSheet.mjs";
import {
  MENTOR_GREETINGS, MENTOR_REST_TALKS, MENTOR_PRAISE,
  MENTOR_BATTLE_QUIPS, MENTOR_PARLOR_COMMENTS,
} from "../src/data/mentorVoiceMaster.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };
const eq = (label, got, want) => ok(`${label} (got=${JSON.stringify(got)}, want=${JSON.stringify(want)})`, got === want);

// cond のキー順に依存せず比較するための正規化。
const norm = (v) => JSON.stringify(v, (k, val) =>
  (val && typeof val === "object" && !Array.isArray(val))
    ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
    : val);

// ---- (1) 往復: shiyue（全部 explicit）でデータが保存される ----
{
  const rows = rowsFromMaster("shiyue");
  ok("shiyue の行が生成される", rows.length > 30);
  // CSV を経由しても行が一致（引用符・改行・カンマの取り回し）。
  const round = fromCsv(toCsv(rows));
  eq("CSV往復で行数不変", round.length, rows.length);
  ok("CSV往復で全セル一致", round.every((r, i) => COLUMNS.every((c) => (r[c] ?? "") === (rows[i][c] ?? ""))));

  // 行 → マスタ用データ が元の explicit 配列と一致。
  const data = masterDataFromRows(round);
  const srcGreet = (MENTOR_GREETINGS.shiyue || []).map((g) => ({ cond: g.cond, text: g.text }));
  eq("greet 往復一致", norm(data.greet), norm(srcGreet));
  const srcPraise = (MENTOR_PRAISE.shiyue || []).map((p) => ({ cond: p.cond, text: p.text }));
  eq("praise 往復一致", norm(data.praise), norm(srcPraise));
  const srcBattle = (MENTOR_BATTLE_QUIPS.shiyue || []).map((q) => ({ event: q.event, cond: q.cond, text: q.text }));
  eq("battle 往復一致", norm(data.battle), norm(srcBattle));
  const srcParlor = (MENTOR_PARLOR_COMMENTS.shiyue || []).map((p) => ({ tier: p.tier, cond: p.cond, text: p.text }));
  eq("parlor 往復一致", norm(data.parlor), norm(srcParlor));
  // rest は choices の key=memory に正規化して比較。
  const srcRest = (MENTOR_REST_TALKS.shiyue || []).map((rt) => ({
    cond: rt.cond, prompt: rt.prompt,
    choices: rt.choices.map((c) => ({ key: c.memory, label: c.label, reply: c.reply, memory: c.memory })),
  }));
  eq("rest 往復一致（2択＋cond）", norm(data.rest), norm(srcRest));
}

// ---- (2) 検証: 正しい行は errors 0 ----
{
  const rows = rowsFromMaster("shiyue");
  const { ok: valid, errors } = validateRows(rows, { toneMarkers: ["我", "ダヨ", "ネ", "ヨ"] });
  ok(`shiyue 現行データは検証エラー 0（実際 ${errors.length}）`, valid && errors.length === 0);
}

// ---- (2) 検証: 不正行を確実に捕まえる ----
{
  const bad = [
    { type: "greet", text: "", phase: "", condTier: "", bondMin: "", time: "", lastOutcome: "", afterChoice: "", cleared: "", treasuresMin: "", key: "", a_label: "", a_reply: "", a_memory: "", b_label: "", b_reply: "", b_memory: "" }, // text 空
    { type: "greet", text: "やあ", condTier: "saikou", phase: "", bondMin: "", time: "", lastOutcome: "", afterChoice: "", cleared: "", treasuresMin: "", key: "", a_label: "", a_reply: "", a_memory: "", b_label: "", b_reply: "", b_memory: "" }, // 語彙ミス
    { type: "battle", text: "おっ", key: "superWin", phase: "", condTier: "", bondMin: "", time: "", lastOutcome: "", afterChoice: "", cleared: "", treasuresMin: "", a_label: "", a_reply: "", a_memory: "", b_label: "", b_reply: "", b_memory: "" }, // event 不正
    { type: "rest", text: "ねえ？", a_label: "はい", a_reply: "", a_memory: "yes", b_label: "", b_reply: "", b_memory: "", phase: "", condTier: "", bondMin: "", time: "", lastOutcome: "", afterChoice: "", cleared: "", treasuresMin: "", key: "" }, // 2択欠落
    { type: "greet", text: "［テンプレ］未記入", phase: "", condTier: "", bondMin: "", time: "", lastOutcome: "", afterChoice: "", cleared: "", treasuresMin: "", key: "", a_label: "", a_reply: "", a_memory: "", b_label: "", b_reply: "", b_memory: "" }, // テンプレ残置
  ];
  const { ok: valid, errors } = validateRows(bad);
  ok("不正データは検証 NG", valid === false);
  ok(`5種の不正をすべて検出（実際 ${errors.length} 件）`, errors.length >= 5);
  // 行番号がついている（スプシの行に対応）。
  ok("エラーに行番号が付く", errors.every((e) => typeof e.row === "number"));
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
