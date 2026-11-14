-- ディミが利用者に合わせて成長するための保存庫。
-- feedback: 返事ごとの評価（よい / よくない）とひとこと。
-- kymis_notes: ディミが覚えていること（話し方の好み、利用者についての事実、決まりごと）。
--   利用者が画面で書いたもの（source = 'user'）と、ディミが会話から気づいて書き留めたもの（source = 'kymis'。以前の名前のまま）がある。

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  unique (message_id)
);

create table public.kymis_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- style: 話し方・答え方の好み / fact: 利用者についての事実 / rule: 守ってほしい決まり
  kind text not null default 'style' check (kind in ('style', 'fact', 'rule')),
  content text not null check (char_length(content) between 1 and 500),
  source text not null default 'user' check (source in ('user', 'kymis')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index feedback_user_created_idx on public.feedback (user_id, created_at desc);
create index kymis_notes_user_idx on public.kymis_notes (user_id, active);

alter table public.feedback enable row level security;
alter table public.kymis_notes enable row level security;

-- 画面からは、ログインした本人の行だけを読み書きできる。
create policy "own feedback" on public.feedback
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own notes" on public.kymis_notes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 画面で変えたら、すぐ反映されるようにする。
alter publication supabase_realtime add table public.feedback;
alter publication supabase_realtime add table public.kymis_notes;
