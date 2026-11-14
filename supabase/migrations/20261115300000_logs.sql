-- 管理の画面で見る記録。
-- agent_logs: PC の DIMY（常駐プログラム）の記録。PC の DIMY（service_role）だけが書き、画面は本人の行を読むだけ。30 日で消す。
-- activity_log: 画面での動作の記録（アプリを開いた・検索した・止めた など）。画面が本人の行として書き、本人だけ読める。

create table public.agent_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- info / error
  level text not null default 'info' check (level in ('info', 'error')),
  message text not null,
  created_at timestamptz not null default now()
);
create index agent_logs_user_time_idx on public.agent_logs (user_id, created_at desc);
alter table public.agent_logs enable row level security;
create policy "read own agent logs" on public.agent_logs
  for select to authenticated using (user_id = (select auth.uid()));

create table public.activity_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- 動作の種類（例: open_app, open_chrome, search, stop, restart, move_pins, wake）
  kind text not null,
  detail text not null default '',
  -- どの端末の画面か（ブラウザの名前など）
  device text not null default '',
  created_at timestamptz not null default now()
);
create index activity_log_user_time_idx on public.activity_log (user_id, created_at desc);
alter table public.activity_log enable row level security;
create policy "insert own activity" on public.activity_log
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "read own activity" on public.activity_log
  for select to authenticated using (user_id = (select auth.uid()));
