// 通信対戦の対局結果を Supabase に記録する（ログイン中のみ）。
//
// テーブル online_results（RLS：本人のみ insert/select）。未ログインは記録しない（RLS で弾かれる）。
// クライアントが自分の順位を申告する形なので、テスト中の戦績用途（正式なランキングは将来サーバ集計）。
// テーブル作成 SQL は docs/online-deploy-setup.md / 下記コメント参照。
import { supabase } from "../config/supabase.js";
import { getUser } from "../auth/authService.js";

// 戻り値: "recorded"（記録した） / "skipped"（未ログイン） / "error"（失敗）。
export async function recordOnlineResult({ charId, rank, numPlayers, finalPoints, opponents }) {
  try {
    const user = await getUser();
    if (!user) return "skipped";
    const { error } = await supabase.from("online_results").insert({
      user_id: user.id,
      char_id: charId,
      rank,
      num_players: numPlayers,
      final_points: finalPoints,
      opponents: opponents || [],
      mode: "online",
    });
    if (error) { console.warn("online_results 記録失敗:", error.message); return "error"; }
    return "recorded";
  } catch (e) {
    console.warn("online_results 記録エラー:", e);
    return "error";
  }
}

// 自分のオンライン戦績を集計して返す（ログイン中のみ）。online_results を全件読んで畳む。
// 戻り値: { games, firsts, firstRate, avgRank, lasts, lastRate } / 未ログインは null。
export async function fetchMyOnlineStats() {
  const user = await getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("online_results")
    .select("rank, num_players")
    .eq("user_id", user.id);
  if (error) throw error;
  const rows = data || [];
  const games = rows.length;
  if (!games) return { games: 0, firsts: 0, firstRate: 0, avgRank: 0, lasts: 0, lastRate: 0 };
  let firsts = 0, lasts = 0, rankSum = 0;
  for (const r of rows) {
    if (r.rank === 1) firsts++;
    if (r.num_players && r.rank === r.num_players) lasts++; // 最下位＝ラス
    rankSum += r.rank;
  }
  return { games, firsts, firstRate: firsts / games, avgRank: rankSum / games, lasts, lastRate: lasts / games };
}

/* ---- Supabase 側のテーブル作成 SQL（一度だけ実行）----
create table if not exists public.online_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  finished_at timestamptz not null default now(),
  char_id text not null,
  rank int not null,
  num_players int not null,
  final_points int not null,
  opponents text[] not null default '{}',
  mode text not null default 'online'
);
alter table public.online_results enable row level security;
create policy "own results insert" on public.online_results
  for insert with check (auth.uid() = user_id);
create policy "own results read" on public.online_results
  for select using (auth.uid() = user_id);
----------------------------------------------------------- */
