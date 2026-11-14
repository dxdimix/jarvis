-- Chrome のブックマーク（デスクトップ PC のディミが、Chrome のブックマークのファイルを読んで写す）。
-- 画面では、声や一覧から開くために読むだけ。書き込みは PC のディミ（service_role）だけが行う。

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  url text not null,
  -- 入っているフォルダ（例: ブックマークバー / 仕事）
  folder text not null default '',
  -- Chrome での並び順
  sort integer not null default 0,
  synced_at timestamptz not null default now()
);

create index bookmarks_user_sort_idx on public.bookmarks (user_id, sort);

alter table public.bookmarks enable row level security;

-- 画面からは、ログインした本人の行を読むだけ（書き換えは PC のディミだけ）。
create policy "read own bookmarks" on public.bookmarks
  for select to authenticated
  using (user_id = (select auth.uid()));
