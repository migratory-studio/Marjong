// 楼光の館・チューニング行動ログ。
//
// 実プレイの詳細（フロア/バイオーム/和了/被ダメ/与ダメ/回復/バフ・道具状況など）を時系列で記録し、
// localStorage に蓄積する。後から JSONL / CSV でダウンロードして balance 調整に使う（"どこかのDB"の代替）。
// 解析の主戦場はオフライン：DLしたログを表計算やスクリプトに食わせて、自陣HPと敵HPの乖離・
// バフ取得傾向・アガリ分布などを見る。クラッシュしない・無ければ無害（保存失敗は握りつぶす）。
//
// 公開リポジトリに個人情報は載らない（弟子名＝プレイヤー入力名のみ。気になれば clear() で消せる）。

const KEY = "mahjong-rpg.rogueliteTuningLog";
const CAP = 8000; // 直近イベント上限（古いものから捨てるリングバッファ）

let buf = null;
function load() {
  if (buf) return buf;
  try { buf = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { buf = []; }
  if (!Array.isArray(buf)) buf = [];
  return buf;
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(buf)); } catch { /* 容量超過等は無視 */ } }

let seq = 0;

// ---- Supabase シンク（任意・main.js が設定）。localStorage は常に正本、Supabase はベストエフォート集約。 ----
let sink = null;          // (rows[]) => Promise … バッチINSERT
let pending = [];         // 未送信イベント
const BATCH = 20;         // この件数たまったら送る
const PENDING_CAP = 400;  // 送信失敗が続いても無制限に貯めない
let sessionId = null;
function sid() {
  if (sessionId) return sessionId;
  try { sessionId = crypto.randomUUID(); }
  catch { try { sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; } catch { sessionId = "session"; } }
  return sessionId;
}
// Supabase への送信口を登録（行＝{session_id, seq, type, floor, biome, data}）。
export function setRlLogSink(fn) { sink = fn; }
// 溜まったイベントを送る（失敗分は捨てる＝localStorage が全量を保持）。
export async function flushRlLog() {
  if (!sink || !pending.length) return;
  const rows = pending; pending = [];
  try { await sink(rows); } catch { /* ベストエフォート：再送しない（localStorageに残る） */ }
}

// 1イベント追記。type＝種別（run_start / floor / hand / clear / buff / item / heal / run_end …）。
export function rlLog(type, data = {}) {
  const b = load();
  let ts = 0; try { ts = Date.now(); } catch { ts = 0; }
  const ev = { seq: seq++, ts, type, ...data };
  b.push(ev);
  if (b.length > CAP) b.splice(0, b.length - CAP);
  persist();
  // Supabase 行（主要列を昇格＋全文を data へ）。シンク未設定なら貯めない。
  if (sink) {
    pending.push({ session_id: sid(), seq: ev.seq, type, floor: data.floor ?? null, biome: data.biome ?? null, data: ev });
    if (pending.length > PENDING_CAP) pending.splice(0, pending.length - PENDING_CAP);
    // 節目（フロア/踏破/バフ/開始/終了…）は即フラッシュ＝ラン中もSupabaseが追従。
    // 連発する hand だけはバッチ（BATCH件）にまとめて送る。
    if (pending.length >= BATCH || FLUSH_TYPES.has(type)) flushRlLog();
  }
}
// 即フラッシュする節目イベント（hand は連発するのでバッチに任せる）。
const FLUSH_TYPES = new Set(["run_start", "floor", "clear", "buff", "item", "heal", "biome_reroll", "run_end"]);

export function rlLogClear() { buf = []; persist(); }
export function rlLogAll() { return load().slice(); }
export function rlLogJSONL() { return load().map((e) => JSON.stringify(e)).join("\n"); }

// CSV（主要列を平坦化）。ネストは JSON 文字列で1セルに収める。
export function rlLogCSV() {
  const rows = load();
  const cols = ["seq", "ts", "type", "floor", "biome", "winner", "han", "score", "yakuman",
    "dealt", "taken", "heal", "hpSelf", "hpAlly", "hpEnemy", "card", "rarity", "item",
    "hpMulEff", "dealMul", "takeMul", "skillLevel", "coins", "depth", "result", "note"];
  const esc = (v) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.join(",");
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n");
  return `${head}\n${body}`;
}

// ブラウザでDL（a要素クリック）。kind="jsonl"|"csv"。
export function rlLogDownload(kind = "jsonl") {
  const text = kind === "csv" ? rlLogCSV() : rlLogJSONL();
  const mime = kind === "csv" ? "text/csv" : "application/x-ndjson";
  let stamp = "log"; try { stamp = new Date().toISOString().replace(/[:.]/g, "-"); } catch { /* noop */ }
  try {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rogueliteLog_${stamp}.${kind === "csv" ? "csv" : "jsonl"}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch { /* 非ブラウザ環境では何もしない */ }
  return text;
}
