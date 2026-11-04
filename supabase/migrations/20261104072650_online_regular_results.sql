create table public.online_regular_results (
  match_id uuid not null, bot_id text not null, username text not null, char_id text not null,
  finished_at timestamptz not null, placement smallint not null check (placement between 1 and 4),
  final_points integer not null, games integer not null check (games > 0),
  human_played boolean not null, ranking_eligible boolean not null,
  season_id text not null, season_score integer not null check (season_score >= 0),
  dan smallint not null check (dan between 1 and 9), tier_rp integer not null check (tier_rp >= 0),
  primary key (match_id, bot_id), unique (bot_id, games),
  check (not ranking_eligible or human_played)
);
alter table public.online_regular_results enable row level security;
revoke all on public.online_regular_results from public, anon, authenticated;
grant insert, select on public.online_regular_results to service_role;
grant select on public.online_regular_results to authenticated;
create policy read_regular_results on public.online_regular_results for select to authenticated using (true);
create index regular_season_latest on public.online_regular_results (season_id, bot_id, games desc)
  where season_score > 0;
create view public.online_season_standings with (security_invoker = true) as
  select season_id, user_id::text, username, season_score, dan, tier_rp, updated_at, false as is_bot
    from public.online_rankings
  union all
  select season_id, bot_id, username, season_score, dan, tier_rp, finished_at, true
    from (select distinct on (season_id, bot_id) *
          from public.online_regular_results where season_score > 0
          order by season_id, bot_id, games desc) as latest;
revoke all on public.online_season_standings from public, anon, authenticated;
grant select on public.online_season_standings to authenticated;
