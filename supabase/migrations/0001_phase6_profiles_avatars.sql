-- Phase 6 縦串スライス: profiles + user_avatars（RLS つき）
-- major_update_specification.md §19.5 / §Phase 6
--
-- 実行方法: Supabase ダッシュボード → SQL Editor にこの全文を貼って Run。
-- 何度流しても安全（idempotent）。policy は再実行でこけないよう drop してから create する。
--
-- 設計の要:
--   * user_avatars は「弟子1体＝1行」。複数保存はこのスキーマで自然に成立する。
--     name / avatar_level は弟子セレクト一覧の“薄い読み出し”用サマリ列（state を全部
--     引かなくても一覧が出せる＝egress 節約）。
--   * 残りの小さめ状態は当面 profiles.misc(jsonb) にまとめる。後で §19.5 の各テーブルへ
--     段階的に切り出していく（このスライスでは2枚だけ）。

-- ───────────────────────────────────────── profiles（1ユーザー1行）
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  schema_version int not null default 1,
  active_avatar_id text,
  wallet jsonb not null default '{"soul":0}'::jsonb,
  misc jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────────────────────── user_avatars（弟子1体1行）
create table if not exists public.user_avatars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  avatar_id text not null,            -- アプリ内 avatarId（"avatar-..."）
  name text,                          -- 一覧用サマリ
  avatar_level int,                   -- 一覧用サマリ
  state jsonb not null,               -- 弟子の完全状態
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, avatar_id)
);

create index if not exists user_avatars_user_id_idx on public.user_avatars (user_id);

-- ───────────────────────────────────────── RLS（自分の行だけ）
alter table public.profiles enable row level security;
alter table public.user_avatars enable row level security;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (auth.uid() = id);
create policy profiles_insert_own on public.profiles for insert with check (auth.uid() = id);
create policy profiles_update_own on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists avatars_select_own on public.user_avatars;
drop policy if exists avatars_insert_own on public.user_avatars;
drop policy if exists avatars_update_own on public.user_avatars;
drop policy if exists avatars_delete_own on public.user_avatars;
create policy avatars_select_own on public.user_avatars for select using (auth.uid() = user_id);
create policy avatars_insert_own on public.user_avatars for insert with check (auth.uid() = user_id);
create policy avatars_update_own on public.user_avatars for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy avatars_delete_own on public.user_avatars for delete using (auth.uid() = user_id);
