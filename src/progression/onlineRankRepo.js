// オンライン順位表（シーズンランキング）の読み書き。Supabase テーブル online_rankings。
//
// online_results（対局ログ・本人のみ）とは別に、順位表は「全ログインユーザーが読める」表が要る。
// そこで user×season で1行の集計行を本人が upsert し、表示は全員が select できる RLS にする。
// （テーブル作成 SQL は docs/online-rank-season.md / 下記コメント参照。）
import { supabase } from "../config/supabase.js";
import { getUser } from "../auth/authService.js";

// 自分のシーズン集計行を upsert（未ログインは何もしない）。対局後に呼ぶ。
export async function pushRanking({ seasonId, username, seasonScore, dan, tierRp }) {
  try {
    const user = await getUser();
    if (!user) return "skipped";
    const { error } = await supabase.from("online_rankings").upsert(
      {
        user_id: user.id,
        season_id: seasonId,
        username: username || "名無し",
        season_score: seasonScore,
        dan,
        tier_rp: tierRp,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,season_id" }
    );
    if (error) { console.warn("online_rankings upsert 失敗:", error.message); return "error"; }
    return "ok";
  } catch (e) {
    console.warn("online_rankings upsert エラー:", e);
    return "error";
  }
}

// シーズンの上位 limit 件（season_score 降順・同点は段位→更新が新しい順）。
export async function fetchLeaderboard(seasonId, limit = 20) {
  const { data, error } = await supabase
    .from("online_rankings")
    .select("user_id, username, season_score, dan, tier_rp, updated_at")
    .eq("season_id", seasonId)
    .order("season_score", { ascending: false })
    .order("dan", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// 自分の順位（同シーズンで自分より上のスコア件数+1）と自分の行を返す。
export async function fetchMyStanding(seasonId) {
  const user = await getUser();
  if (!user) return null;
  const { data: mine, error: e1 } = await supabase
    .from("online_rankings")
    .select("user_id, username, season_score, dan, tier_rp")
    .eq("season_id", seasonId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (e1) throw e1;
  if (!mine) return { row: null, position: null };
  // 自分より高スコアの人数 → 順位。
  const { count, error: e2 } = await supabase
    .from("online_rankings")
    .select("user_id", { count: "exact", head: true })
    .eq("season_id", seasonId)
    .gt("season_score", mine.season_score);
  if (e2) throw e2;
  return { row: mine, position: (count || 0) + 1 };
}

/* ---- Supabase 側のテーブル作成 SQL（一度だけ実行）----
create table if not exists public.online_rankings (
  user_id uuid not null references auth.users(id) on delete cascade,
  season_id text not null,
  username text not null,
  season_score int not null default 0,
  dan int not null default 1,
  tier_rp int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, season_id)
);
alter table public.online_rankings enable row level security;
-- 本人だけ書ける（自分の集計行を upsert）。
create policy "own ranking insert" on public.online_rankings
  for insert with check (auth.uid() = user_id);
create policy "own ranking update" on public.online_rankings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- 順位表はログインユーザー全員が読める（公開情報は username/score/dan のみ）。
create policy "rankings readable by authenticated" on public.online_rankings
  for select to authenticated using (true);
----------------------------------------------------------- */
