create or replace view public.online_season_standings with (security_invoker = true) as
  with bot_seasons as (
    -- Each result already contains the running subtotal from eligible mixed matches.
    -- Take that subtotal from the newest game, and count each autonomous result once.
    select distinct on (season_id, bot_id)
      season_id, bot_id, username, dan, tier_rp, finished_at,
      least(60, season_score + sum(case
        when human_played then 0
        when placement = 1 then 3
        when placement = 2 then 1
        else 0
      end) over (partition by season_id, bot_id))::integer as public_points
    from public.online_regular_results
    order by season_id, bot_id, games desc
  )
  select season_id, user_id::text, username, season_score, dan, tier_rp, updated_at, false as is_bot
    from public.online_rankings
  union all
  select season_id, bot_id, username, public_points, dan, tier_rp, finished_at, true
    from bot_seasons where public_points > 0;
