// オンライン段位（アカウント本人のランク）の純ロジック。UI/保存/通信に非依存＝ヘッドレステスト可。
//
// 思想（memory: online-rank-season-design）:
//  - 段位は永続ラチェット（絶対に下がらない・季跨ぎでも不可侵）。
//  - RP は「現段位のバー」で、1局ごとに着順で上下するが下限0＝降格しない。満タンで昇段し0から再スタート。
//  - 実力より「プレイ回数」が支配的（均すと必ず増える額にする）。
//  - シーズン＝クオーター制。シーズンは段位を触らず、順位表用の seasonScore だけリセット（案A）。
//
// 段位状態 state = { dan:1..9, tierRp:現段位バー進捗(>=0), seasonId:"2026-Q2"|null, seasonScore:当季活動量 }。
// 永続化は profile.onlineRank（profiles.misc.onlineRank へ）。online_results を正として再計算もできる
// （computeRankFromResults）。

// 段位テーブル（九蓮宝燈/宝士モチーフ・称号に数字を混ぜない＝段数とのズレで混乱しないため）。
// next = 次段位までに必要な現段位バー満タン量（最高位 宝士 は null）。閾値は上ほど広げて長い登りに。
export const DAN_TABLE = [
  { dan: 1, title: "萌芽", kana: "ほうが", next: 200 },
  { dan: 2, title: "蓮蕾", kana: "れんらい", next: 300 },
  { dan: 3, title: "開華", kana: "かいか", next: 450 },
  { dan: 4, title: "白蓮", kana: "びゃくれん", next: 650 },
  { dan: 5, title: "瑞蓮", kana: "ずいれん", next: 900 },
  { dan: 6, title: "金蓮", kana: "きんれん", next: 1200 },
  { dan: 7, title: "昇雲", kana: "しょううん", next: 1600 },
  { dan: 8, title: "凌霄", kana: "りょうしょう", next: 2200 },
  { dan: 9, title: "宝士", kana: "ほうし", next: null }, // 最高位
];
export const MAX_DAN = DAN_TABLE.length;

// 1局の RP 増減（着順依存）。均すと net プラス＝回数が支配的、着順は登るテンポにだけ効かせる。
// 下位はマイナスもあり得るが、適用側で tierRp が 0 を割らない（降格しない）。数値は調整前提。
const RP_TABLES = {
  4: { 1: 60, 2: 20, 3: 0, 4: -30 },
  3: { 1: 50, 2: 10, 3: -30 },
};

export function deltaRp(placement, numPlayers = 4) {
  const table = RP_TABLES[numPlayers] || RP_TABLES[4];
  return table[placement] ?? 0;
}

export function defaultRankState() {
  return { dan: 1, tierRp: 0, seasonId: null, seasonScore: 0 };
}

const clampDan = (n) => Math.min(MAX_DAN, Math.max(1, Math.floor(n) || 1));

function normalizeState(s) {
  if (!s || typeof s !== "object") return defaultRankState();
  return {
    dan: clampDan(s.dan ?? 1),
    tierRp: Math.max(0, Math.floor(s.tierRp) || 0),
    seasonId: s.seasonId ?? null,
    seasonScore: Math.max(0, Math.floor(s.seasonScore) || 0),
  };
}

// finishedAt(Date|ISO文字列|ms) → シーズンID "YYYY-Qn"（クオーター制・UTC基準）。
export function seasonIdFromDate(input) {
  const date = input instanceof Date ? input : new Date(input);
  const y = date.getUTCFullYear();
  const q = Math.floor(date.getUTCMonth() / 3) + 1; // 0-2→Q1, 3-5→Q2, ...
  return `${y}-Q${q}`;
}

// 1局の結果を段位状態へ適用。戻り値 { state, delta, promotedTo }。
//   - tierRp は下限0（降格なし）。満タンで昇段し tierRp=0 から再スタート（各段位は新しい登り）。
//   - 最高位(宝士)では昇段せず tierRp が貯まり続ける（フレックス表示用・実害なし）。
//   - シーズンが変わっていれば seasonScore を 0 にしてから当局ぶんを加算（段位/tierRp は不可侵）。
export function applyMatchToRank(state, { placement, numPlayers = 4, finishedAt }) {
  const s = normalizeState(state);
  const sid = seasonIdFromDate(finishedAt);
  const sameSeason = s.seasonId === sid;
  let seasonScore = sameSeason ? s.seasonScore : 0;

  const d = deltaRp(placement, numPlayers);
  let dan = s.dan;
  let tierRp = Math.max(0, s.tierRp + d); // 降格しない＝0で止める

  let promotedTo = null;
  while (dan < MAX_DAN) {
    const need = DAN_TABLE[dan - 1].next;
    if (need != null && tierRp >= need) {
      dan += 1;
      tierRp = 0; // 昇段時は0から再スタート（オーバーフローは持ち越さない＝設計どおり）
      promotedTo = dan;
    } else break;
  }

  seasonScore += Math.max(0, d); // 当季の活動量（順位表用・回数が効く）

  return { state: { dan, tierRp, seasonId: sid, seasonScore }, delta: d, promotedTo };
}

// online_results 等の対局列から段位状態を再計算（整合性の正・rebuild 用）。
// results: [{ placement, numPlayers, finishedAt }]。finishedAt 昇順に畳み込む。
export function computeRankFromResults(results) {
  const sorted = [...(results || [])].sort(
    (a, b) => new Date(a.finishedAt).getTime() - new Date(b.finishedAt).getTime()
  );
  let state = defaultRankState();
  for (const r of sorted) state = applyMatchToRank(state, r).state;
  return state;
}

// 表示用に段位状態を展開。numbers を見せてよい競技ランク側なので RP/進捗も返す。
export function describeRank(state) {
  const s = normalizeState(state);
  const row = DAN_TABLE[s.dan - 1];
  const atMax = row.next == null;
  return {
    dan: s.dan,
    title: row.title,
    kana: row.kana,
    tierRp: s.tierRp,
    next: row.next, // null=最高位
    atMax,
    progressPct: atMax ? 100 : Math.min(100, Math.round((s.tierRp / row.next) * 100)),
    seasonId: s.seasonId,
    seasonScore: s.seasonScore,
  };
}
