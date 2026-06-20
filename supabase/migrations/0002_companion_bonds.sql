-- 相棒絆を専用テーブルへ分離（旧: profiles.misc.companionBonds → 新: companion_bonds）
-- major_update_specification.md §19.5 の「misc から段階的に切り出す」方針に沿う第2スライス。
--
-- 実行方法: Supabase ダッシュボード → SQL Editor にこの全文を貼って Run（何度流しても安全＝idempotent）。
--
-- 設計の要:
--   * キャラ1体＝1行（user_id, char_id 複合主キー）。一覧/集計しやすい正規化形。
--   * level/exp は companionLevelFromExp と同義（exp は現Lv内の進捗）。matches＝一緒に打った局数。
--   * 旧データは profiles.misc.companionBonds に残っているが、アプリ側 loadProfile が
--     このテーブルと misc をマージ（テーブル優先）して読み、次の saveProfile で当テーブルへ移送する。

create table if not exists public.companion_bonds (
  user_id uuid not null references auth.users (id) on delete cascade,
  char_id text not null,                 -- アプリ内キャラ id（"shiyue" 等）
  level int not null default 1,
  exp int not null default 0,            -- 現 Lv 内の進捗（次 Lv = 40 * level）
  matches int not null default 0,        -- そのキャラと一緒に打った局数
  updated_at timestamptz not null default now(),
  primary key (user_id, char_id)
);

create index if not exists companion_bonds_user_id_idx on public.companion_bonds (user_id);

-- ───────────────────────────────────────── RLS（自分の行だけ）
alter table public.companion_bonds enable row level security;

drop policy if exists companion_bonds_select_own on public.companion_bonds;
drop policy if exists companion_bonds_insert_own on public.companion_bonds;
drop policy if exists companion_bonds_update_own on public.companion_bonds;
drop policy if exists companion_bonds_delete_own on public.companion_bonds;
create policy companion_bonds_select_own on public.companion_bonds for select using (auth.uid() = user_id);
create policy companion_bonds_insert_own on public.companion_bonds for insert with check (auth.uid() = user_id);
create policy companion_bonds_update_own on public.companion_bonds for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy companion_bonds_delete_own on public.companion_bonds for delete using (auth.uid() = user_id);
