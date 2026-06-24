// 楼光の館・ボス記憶（提案B／Hadesドリップの核「ボスが"覚えている"」）。
//
// ねらい（docs/roguelite-proposal-b-handoff.md §3.2-1）：
//   ボス＝プレイアブルキャラ。そのキャラ相手の通算勝敗をプロフィールに記録し、
//   対局前の口上を「初遭遇／再戦／雪辱」で出し分ける。これだけでHadesの核が立つ。
//
// データ形（最小・スライス1）：
//   profile.roguelite.bossTally = { [charId]: { w, l } }
//     w = そのボスに弟子（プレイヤー側）が勝った回数（＝ボスを撃破して踏破した回数）
//     l = そのボスに敗れた回数（＝そのボス階で全滅した回数）
//
// すべて純関数（入力を破壊しない）。回帰: test/roguelite.mjs。

// 1件の通算記録から段階（tier）を導く。語彙は voiceLines.js の cond.bossMemoryTier と一致。
//   first   … まだ一度も対峙していない（初遭遇）
//   revenge … 過去にこのボスへ敗れている（雪辱戦＝負け越し有無は問わない）
//   rematch … 対峙済みだが一度も負けていない（再戦＝こちらが押している）
// 「敗北の記憶」を最優先（l>0 なら常に revenge）＝物語の重みは「負けた相手」に宿る。
export function bossMemoryTier(rec) {
  const w = Math.max(0, Number(rec?.w) || 0);
  const l = Math.max(0, Number(rec?.l) || 0);
  if (w + l === 0) return "first";
  if (l > 0) return "revenge";
  return "rematch";
}

// profile から bossTally を安全に取り出す（無ければ空オブジェクト）。常に新しい浅いコピー。
export function readBossTally(profile) {
  const t = profile?.roguelite?.bossTally;
  if (!t || typeof t !== "object") return {};
  const out = {};
  for (const [id, rec] of Object.entries(t)) {
    out[id] = { w: Math.max(0, Number(rec?.w) || 0), l: Math.max(0, Number(rec?.l) || 0) };
  }
  return out;
}

// 1ボスの勝敗を記録した新しい tally を返す（入力は破壊しない）。
//   won=true … プレイヤー勝利（ボス撃破）→ w+1
//   won=false… プレイヤー敗北（全滅）   → l+1
export function recordBossOutcome(tally, charId, won) {
  if (!charId) return { ...(tally || {}) };
  const next = { ...(tally || {}) };
  const prev = next[charId] || { w: 0, l: 0 };
  next[charId] = won
    ? { w: (prev.w || 0) + 1, l: prev.l || 0 }
    : { w: prev.w || 0, l: (prev.l || 0) + 1 };
  return next;
}

// profile に bossTally をマージした新しい profile を返す（永続用・入力は破壊しない）。
// roguelite の他フィールド（bestFloor/runs/carry）は保全する。
export function withBossTally(profile, tally) {
  const base = profile || {};
  return { ...base, roguelite: { ...(base.roguelite || {}), bossTally: { ...(tally || {}) } } };
}
