-- 画面から PC のディミへの命令（Chrome で開く・Claude Code のセッションを開く）と、PC の情報。
-- 命令は本人だけが追加できる。PC のディミ（service_role）は、利用者本人の命令だけを実行する。

create table public.pc_commands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- open_url: Chrome で開く（payload: { url, account }）
  -- open_session: PC の Claude Code のセッションを開く（payload: { id }）
  kind text not null check (kind in ('open_url', 'open_session')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'done', 'error')),
  result text,
  created_at timestamptz not null default now()
);

create index pc_commands_pending_idx on public.pc_commands (created_at) where status = 'pending';

alter table public.pc_commands enable row level security;

create policy "insert own pc commands" on public.pc_commands
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');

create policy "read own pc commands" on public.pc_commands
  for select to authenticated
  using (user_id = (select auth.uid()));

-- PC の情報（Chrome のプロフィールの一覧、PC の Claude Code のセッションの一覧）。PC のディミが書き、画面は読むだけ。
create table public.pc_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- [{ dir, name, email }]（Chrome の「Local State」から）
  chrome_profiles jsonb not null default '[]'::jsonb,
  -- [{ id, title, project, updated_at }]（~/.claude/projects の中の会話の記録から。新しい順）
  claude_sessions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.pc_state enable row level security;

create policy "read own pc state" on public.pc_state
  for select to authenticated
  using (user_id = (select auth.uid()));
