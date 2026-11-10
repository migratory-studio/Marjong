-- Security hardening (2026-11-10).
--
-- 1. roguelite_logs stays open to anonymous telemetry, but:
--      * a row may only carry the caller's own user_id (or none), so nobody can file logs as someone else;
--      * each row is size-capped (largest real row so far: ~1 KB of JSON);
--      * inserts draw from a budget, so a script that only knows the public anon key cannot fill the
--        shared database (a full free-tier database turns read-only and breaks every player's cloud save):
--          - each signed-in player: 1000 rows per rolling hour   (observed peak: 144)
--          - all anonymous players together: 2000 rows per rolling day (observed peak: 23)
--        created_at is always the server clock, so back-dated rows cannot dodge the budget.
--        Over budget the API answers HTTP 429; the game already drops failed log batches silently.
-- 2. online_rankings / online_results are written by the game client itself. Range checks keep a
--    modified client from storing values the game never produces (oversized names, negative scores,
--    impossible placements), which every player's leaderboard and the owner's dashboard read.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.roguelite_logs
  add constraint roguelite_logs_row_size check (
    octet_length(data::text) <= 4096
    and coalesce(char_length(session_id), 0) <= 64
    and coalesce(char_length(client_id), 0) <= 64
    and coalesce(char_length(run_id), 0) <= 64
    and coalesce(char_length(type), 0) <= 32
    and coalesce(char_length(biome), 0) <= 32
  );

drop policy if exists roguelite_logs_insert on public.roguelite_logs;
create policy roguelite_logs_insert on public.roguelite_logs
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

create index if not exists roguelite_logs_user_recent on public.roguelite_logs (user_id, created_at);
create index if not exists roguelite_logs_anon_recent on public.roguelite_logs (created_at) where user_id is null;

-- SECURITY DEFINER: the budget must count every row, including rows the caller cannot read under RLS.
-- Lives in the non-exposed "private" schema, so it cannot be called through the REST API.
create or replace function private.roguelite_logs_budget() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now();
  if new.user_id is null then
    if (select count(*) from public.roguelite_logs
        where user_id is null and created_at > now() - interval '1 day') >= 2000 then
      raise exception 'roguelite_logs: anonymous insert budget exhausted' using errcode = 'PT429';
    end if;
  elsif (select count(*) from public.roguelite_logs
         where user_id = new.user_id and created_at > now() - interval '1 hour') >= 1000 then
    raise exception 'roguelite_logs: per-player insert budget exhausted' using errcode = 'PT429';
  end if;
  return new;
end $$;
revoke all on function private.roguelite_logs_budget() from public, anon, authenticated;

drop trigger if exists roguelite_logs_budget on public.roguelite_logs;
create trigger roguelite_logs_budget before insert on public.roguelite_logs
  for each row execute function private.roguelite_logs_budget();

-- Usernames come from the in-game name dialog (12 characters max); seasons are "YYYY-Qn".
alter table public.online_rankings
  add constraint online_rankings_sane check (
    char_length(username) between 1 and 24
    and season_id ~ '^[0-9]{4}-Q[1-4]$'
    and season_score >= 0
    and dan between 1 and 9
    and tier_rp >= 0
  );

-- Online tables seat 2-4 players; opponents holds the other players' character IDs.
alter table public.online_results
  add constraint online_results_sane check (
    num_players between 2 and 4
    and rank between 1 and num_players
    and char_length(char_id) <= 64
    and char_length(mode) <= 32
    and cardinality(opponents) <= 3
    and octet_length(array_to_string(opponents, '')) <= 256
  );
