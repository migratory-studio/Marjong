// 師匠ボイス（mentorVoiceMaster）⇄ 表（スプシ/CSV）の相互変換＋検証ライブラリ。
//
// 目的: 文言マスタを「人がスプシで編集 → 検証つきで取り込み → .js を生成」できるようにする土台。
// スプシ側にマクロを積むのではなく、検証はここ（リポジトリのコード）に置く＝テストで守れる・
// git 履歴に残る・口調 lint まで掛けられる。Sheets/Excel どちらを入口にしても通る。
//
// 表は「1行＝1セリフ」のフラット構造。9種のセリフを type 列で見分け、
//   - 単純な行（greet/praise/battle/parlor/…）: text を使う
//   - 2択（rest/leagueloss）: text=問いかけ ＋ a_*/b_* に選択肢2つ
// で吸収する。cond_* 列は空欄＝無条件。
//
// このファイルは Node 専用（DOM 非依存）。本体に副作用を与えない（読むだけ／生成は呼び出し側）。
import {
  MENTOR_GREETINGS, MENTOR_REST_TALKS, MENTOR_PRAISE,
  MENTOR_BATTLE_QUIPS, MENTOR_PARLOR_COMMENTS,
} from "../src/data/mentorVoiceMaster.js";

// ---- 列定義（スプシのヘッダ。並びを変えたら CSV も合わせる）----
export const COLUMNS = [
  "type", "key",
  "phase", "condTier", "bondMin", "time", "lastOutcome", "afterChoice", "cleared", "treasuresMin",
  "text",
  "a_label", "a_reply", "a_memory",
  "b_label", "b_reply", "b_memory",
];

// ---- 語彙（検証の正典。増やすときはここに足す）----
export const VOCAB = {
  type: ["greet", "rest", "praise", "battle", "parlor"],
  phase: ["", "shitei", "hadou"],
  condTier: ["", "vbad", "bad", "ok", "good", "vgood"],
  time: ["", "asa", "hiru", "yoru"],
  lastOutcome: ["", "daiseikou", "shippai"],
  battleEvent: [
    "matchStart", "bigWin", "bigLoss", "pinch", "tobi", "bustWin",
    "abilityUse", "readWin", "complete", "retreat", "rareGuest",
    "riichiSelf", "riichiOpp",
  ],
  parlorTier: ["bigWin", "win", "rough"],
};

// type ごとの「2択を持つか」。
const IS_TWO_CHOICE = (type) => type === "rest" || type === "leagueloss";

// ---- cond オブジェクト ⇄ 行 ----
function condToRow(cond = {}, row) {
  if (cond.phase) row.phase = cond.phase;
  if (cond.condTier) row.condTier = cond.condTier;
  if (cond.bondMin != null) row.bondMin = String(cond.bondMin);
  if (cond.time) row.time = cond.time;
  if (cond.lastOutcome) row.lastOutcome = cond.lastOutcome;
  if (cond.afterChoice) row.afterChoice = cond.afterChoice;
  if (cond.cleared) row.cleared = "TRUE";
  if (cond.treasuresMin != null) row.treasuresMin = String(cond.treasuresMin);
}
function condFromRow(row) {
  const c = {};
  if (row.phase) c.phase = row.phase;
  if (row.condTier) c.condTier = row.condTier;
  if (row.bondMin !== "" && row.bondMin != null) c.bondMin = Number(row.bondMin);
  if (row.time) c.time = row.time;
  if (row.lastOutcome) c.lastOutcome = row.lastOutcome;
  if (row.afterChoice) c.afterChoice = row.afterChoice;
  if (truthy(row.cleared)) c.cleared = true;
  if (row.treasuresMin !== "" && row.treasuresMin != null) c.treasuresMin = Number(row.treasuresMin);
  return c;
}
const truthy = (v) => v === true || v === "TRUE" || v === "true" || v === "1";

// 空行テンプレ（全列空）。
const blankRow = () => Object.fromEntries(COLUMNS.map((k) => [k, ""]));

// ---- マスタ（charId）→ 行配列 ----
// 現状エクスポート済みの 5 種（greet/rest/praise/battle/parlor）を表へ。テンプレ行は除外。
export function rowsFromMaster(charId) {
  const rows = [];
  const isTemplate = (s) => typeof s === "string" && s.includes("［テンプレ］");

  for (const g of MENTOR_GREETINGS[charId] || []) {
    if (isTemplate(g.text)) continue;
    const r = blankRow(); r.type = "greet"; condToRow(g.cond, r); r.text = g.text; rows.push(r);
  }
  for (const rt of MENTOR_REST_TALKS[charId] || []) {
    if (isTemplate(rt.prompt)) continue;
    const r = blankRow(); r.type = "rest"; condToRow(rt.cond, r); r.text = rt.prompt;
    const [a, b] = rt.choices || [];
    if (a) { r.a_label = a.label; r.a_reply = a.reply; r.a_memory = a.memory; }
    if (b) { r.b_label = b.label; r.b_reply = b.reply; r.b_memory = b.memory; }
    rows.push(r);
  }
  for (const p of MENTOR_PRAISE[charId] || []) {
    if (isTemplate(p.text)) continue;
    const r = blankRow(); r.type = "praise"; condToRow(p.cond, r); r.text = p.text; rows.push(r);
  }
  for (const q of MENTOR_BATTLE_QUIPS[charId] || []) {
    if (isTemplate(q.text)) continue;
    const r = blankRow(); r.type = "battle"; r.key = q.event; condToRow(q.cond, r); r.text = q.text; rows.push(r);
  }
  for (const p of MENTOR_PARLOR_COMMENTS[charId] || []) {
    if (isTemplate(p.text)) continue;
    const r = blankRow(); r.type = "parlor"; r.key = p.tier; condToRow(p.cond, r); r.text = p.text; rows.push(r);
  }
  return rows;
}

// ---- 行配列 → マスタ用データ（type ごとの配列に束ねる）----
export function masterDataFromRows(rows) {
  const out = { greet: [], rest: [], praise: [], battle: [], parlor: [] };
  for (const row of rows) {
    const cond = condFromRow(row);
    if (row.type === "greet") out.greet.push({ cond, text: row.text });
    else if (row.type === "praise") out.praise.push({ cond, text: row.text });
    else if (row.type === "battle") out.battle.push({ event: row.key, cond, text: row.text });
    else if (row.type === "parlor") out.parlor.push({ tier: row.key, cond, text: row.text });
    else if (row.type === "rest") {
      out.rest.push({
        cond, prompt: row.text,
        choices: [
          { key: row.a_memory, label: row.a_label, reply: row.a_reply, memory: row.a_memory },
          { key: row.b_memory, label: row.b_label, reply: row.b_reply, memory: row.b_memory },
        ],
      });
    }
  }
  return out;
}

// ---- 検証（取り込み前のエラーチェック＝スプシのマクロに相当）----
// errors=ブロック（取り込み中止）/ warnings=注意（口調 lint 等・取り込みは可能）。
// toneMarkers: そのキャラらしさの語（例: 詩玥=["我","ダヨ","ネ","ヨ"]）。greet/battle 行で全く無ければ warn。
export function validateRows(rows, { toneMarkers = [] } = {}) {
  const errors = [];
  const warnings = [];
  const add = (arr, i, msg) => arr.push({ row: i + 2, msg }); // +2: ヘッダ行＋1始まり
  rows.forEach((row, i) => {
    if (!VOCAB.type.includes(row.type)) { add(errors, i, `type「${row.type}」は未知（${VOCAB.type.join("/")}）`); return; }
    if (!String(row.text || "").trim()) add(errors, i, `text（セリフ/問いかけ）が空`);
    if (String(row.text || "").includes("［テンプレ］")) add(errors, i, `text にテンプレ未記入が残っている`);
    // enum 検査
    for (const col of ["phase", "condTier", "time", "lastOutcome"]) {
      if (row[col] && !VOCAB[col].includes(row[col])) add(errors, i, `${col}「${row[col]}」は未知の語彙`);
    }
    for (const col of ["bondMin", "treasuresMin"]) {
      if (row[col] !== "" && !Number.isFinite(Number(row[col]))) add(errors, i, `${col}「${row[col]}」は数値でない`);
    }
    // type 固有
    if (row.type === "battle" && !VOCAB.battleEvent.includes(row.key)) add(errors, i, `battle の key（event）「${row.key}」が不正`);
    if (row.type === "parlor" && !VOCAB.parlorTier.includes(row.key)) add(errors, i, `parlor の key（tier）「${row.key}」が不正（${VOCAB.parlorTier.join("/")}）`);
    if (IS_TWO_CHOICE(row.type)) {
      for (const c of ["a_label", "a_reply", "a_memory", "b_label", "b_reply", "b_memory"]) {
        if (!String(row[c] || "").trim()) add(errors, i, `${row.type} は選択肢2つが必須（${c} が空）`);
      }
    }
    // 口調 lint（warning）: 単純発話の行で、らしさの語が一つも無ければ注意。
    if (toneMarkers.length && (row.type === "greet" || row.type === "battle") && row.text) {
      if (!toneMarkers.some((m) => row.text.includes(m))) add(warnings, i, `口調マーカー(${toneMarkers.join("/")})が見当たらない`);
    }
  });
  return { errors, warnings, ok: errors.length === 0 };
}

// ---- CSV 入出力（全フィールド引用符で囲む素朴な RFC4180）----
export function toCsv(rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = COLUMNS.map(esc).join(",");
  const body = rows.map((r) => COLUMNS.map((c) => esc(r[c])).join(",")).join("\n");
  return head + "\n" + body + "\n";
}
export function fromCsv(text) {
  const records = parseCsv(text);
  if (!records.length) return [];
  const header = records[0];
  return records.slice(1)
    .filter((rec) => rec.some((v) => String(v).trim() !== "")) // 空行スキップ
    .map((rec) => {
      const row = blankRow();
      header.forEach((h, i) => { if (COLUMNS.includes(h)) row[h] = rec[i] ?? ""; });
      return row;
    });
}
// 引用符・カンマ・改行に対応した最小 CSV パーサ。
function parseCsv(text) {
  const out = []; let row = []; let field = ""; let q = false;
  const s = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); out.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); out.push(row); }
  return out;
}
