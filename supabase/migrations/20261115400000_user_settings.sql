-- 端末をまたいで使う設定（例: Chrome のアカウントの呼び名）。key ごとに 1 行。本人だけが読み書きできる。
-- PC の DIMY（service_role）も読む（会話の中で「〇〇のアカウントで開いて」に答えるため）。

create table public.user_settings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_settings enable row level security;

create policy "read own settings" on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "insert own settings" on public.user_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own settings" on public.user_settings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own settings" on public.user_settings
  for delete to authenticated using (user_id = (select auth.uid()));
