-- 開発用のセッション（クラウドの Claude Code）から、DIMY の記録を読み、PC の DIMY に「再起動して最新にして」と頼むための窓口。
-- - 合言葉（maintenance_keys に、そのまま保存せず sha256 の値だけを保存）を、要求の見出し dimy-maint-key で受け取る
-- - できるのは「読む」と「再起動を頼む」だけ。書き換え・消す・ほかの命令はできない
-- - 合言葉は SQL Editor で select public.dimy_maint_new_key('メモ'); を実行して作る（画面などの API からは作れない）
-- - 使わなくなったら delete from public.maintenance_keys; で合言葉を無効にできる

create table public.maintenance_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  label text not null default '',
  created_at timestamptz not null default now()
);
-- 方針（policy）を作らないので、画面や API からは読めない・書けない
alter table public.maintenance_keys enable row level security;

-- 要求の見出しの合言葉が正しいか
create or replace function public.dimy_maint_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.maintenance_keys
    where key_hash = encode(sha256(convert_to(coalesce(current_setting('request.headers', true)::json ->> 'dimy-maint-key', ''), 'UTF8')), 'hex')
      and coalesce(current_setting('request.headers', true)::json ->> 'dimy-maint-key', '') <> ''
  );
$$;
revoke all on function public.dimy_maint_ok() from public, anon, authenticated;

-- 記録を読む（p_what: messages / agent_logs / activity_log / pc_commands / pc_state）。新しいものから p_limit 件を、古い順に返す
create or replace function public.dimy_maint_read(p_what text, p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  n int := least(greatest(coalesce(p_limit, 100), 1), 1000);
  out jsonb;
begin
  if not public.dimy_maint_ok() then
    raise exception '合言葉が違います' using errcode = '42501';
  end if;
  if p_what = 'messages' then
    select coalesce(jsonb_agg(t order by t.created_at), '[]') into out
    from (select id, role, status, content, error, created_at from public.messages order by created_at desc limit n) t;
  elsif p_what = 'agent_logs' then
    select coalesce(jsonb_agg(t order by t.created_at), '[]') into out
    from (select level, message, created_at from public.agent_logs order by created_at desc limit n) t;
  elsif p_what = 'activity_log' then
    select coalesce(jsonb_agg(t order by t.created_at), '[]') into out
    from (select kind, detail, device, created_at from public.activity_log order by created_at desc limit n) t;
  elsif p_what = 'pc_commands' then
    select coalesce(jsonb_agg(t order by t.created_at), '[]') into out
    from (select id, kind, payload, status, result, created_at from public.pc_commands order by created_at desc limit n) t;
  elsif p_what = 'pc_state' then
    select coalesce(jsonb_agg(t), '[]') into out
    from (select chrome_profiles, claude_sessions, updated_at from public.pc_state) t;
  else
    raise exception '読めるのは messages / agent_logs / activity_log / pc_commands / pc_state です';
  end if;
  return out;
end;
$$;
grant execute on function public.dimy_maint_read(text, int) to anon, authenticated;

-- PC の DIMY に頼む（今は restart だけ）。頼んだ命令の id を返す
create or replace function public.dimy_maint_command(p_kind text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
  new_id uuid;
begin
  if not public.dimy_maint_ok() then
    raise exception '合言葉が違います' using errcode = '42501';
  end if;
  if p_kind not in ('restart') then
    raise exception '頼めるのは restart だけです';
  end if;
  select id into owner from auth.users order by created_at limit 1;
  insert into public.pc_commands (user_id, kind, payload) values (owner, p_kind, '{"from":"maintenance"}') returning id into new_id;
  return new_id;
end;
$$;
grant execute on function public.dimy_maint_command(text) to anon, authenticated;

-- 合言葉を作る（SQL Editor でだけ使う。作った合言葉はこのときにしか表示されない）
create or replace function public.dimy_maint_new_key(p_label text default '') returns text
language plpgsql security definer set search_path = public as $$
declare
  token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.maintenance_keys (key_hash, label) values (encode(sha256(convert_to(token, 'UTF8')), 'hex'), coalesce(p_label, ''));
  return token;
end;
$$;
revoke all on function public.dimy_maint_new_key(text) from public, anon, authenticated;

notify pgrst, 'reload schema';
