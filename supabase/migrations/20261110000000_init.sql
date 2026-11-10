-- ジャービスの会話を保存するテーブル。
-- 画面（Vercel）が利用者の発言を status = 'pending' で追加し、
-- PC 常駐プログラム（agent/）が Realtime で受け取って Claude Code に答えさせ、返事を追加する。

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 20000),
  -- pending: PC の返事待ち / processing: PC が処理中 / done: 完了 / error: 失敗
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'error')),
  -- 返事の場合、どの発言への返事か
  reply_to uuid references public.messages (id) on delete cascade,
  error text,
  created_at timestamptz not null default now()
);

create index messages_user_created_idx on public.messages (user_id, created_at);
create index messages_pending_idx on public.messages (created_at) where status = 'pending';

alter table public.messages enable row level security;

-- 画面からは、ログインした本人の行だけ読める。
create policy "read own messages" on public.messages
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 画面から追加できるのは、本人の「発言」で返事待ちのものだけ。
-- 返事（assistant）は PC 常駐プログラムが service_role キーで追加する（RLS の対象外）。
create policy "insert own user messages" on public.messages
  for insert to authenticated
  with check (user_id = (select auth.uid()) and role = 'user' and status = 'pending');

-- 画面から履歴を消せるようにする。
create policy "delete own messages" on public.messages
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- 画面と PC 常駐プログラムが変更を即時に受け取れるようにする。
alter publication supabase_realtime add table public.messages;
