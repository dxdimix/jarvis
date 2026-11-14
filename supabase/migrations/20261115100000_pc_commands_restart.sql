-- 画面の設定（「再起動」タブ）から、PC のディミを再起動する命令を足す。
alter table public.pc_commands drop constraint if exists pc_commands_kind_check;
alter table public.pc_commands
  add constraint pc_commands_kind_check check (kind in ('open_url', 'open_session', 'restart'));
