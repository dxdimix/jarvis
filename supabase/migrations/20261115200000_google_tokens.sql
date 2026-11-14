-- Google カレンダーとのつながり（マスターアカウントの更新用の鍵）。
-- 画面の「Google カレンダーとつなぐ」で保存し、画面のサーバー側（/api/google/*）と PC のディミが予定の読み書きに使う。
-- 利用者本人の行だけを読み書きできる。

create table public.google_tokens (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  refresh_token text not null,
  -- つないだ Google アカウント（マスターアカウント）
  email text not null default '',
  -- Google カレンダーの中の「DIMY」カレンダーの id（DIMY が登録する予定を入れる）
  dimy_calendar_id text,
  updated_at timestamptz not null default now()
);

alter table public.google_tokens enable row level security;

create policy "read own google token" on public.google_tokens
  for select to authenticated using (user_id = (select auth.uid()));
create policy "insert own google token" on public.google_tokens
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own google token" on public.google_tokens
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own google token" on public.google_tokens
  for delete to authenticated using (user_id = (select auth.uid()));
