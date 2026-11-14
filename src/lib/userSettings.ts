// 端末をまたいで使う設定（表 user_settings）。
import type { SupabaseClient } from "@supabase/supabase-js";

/** Chrome のアカウントの呼び名（{ プロフィールのフォルダ名: 呼び名 }） */
export const NICKNAMES_KEY = "account_nicknames";

export async function loadUserSetting<T>(supabase: SupabaseClient, key: string): Promise<{ value: T | null; error?: string }> {
  const { data, error } = await supabase.from("user_settings").select("value").eq("key", key).maybeSingle();
  if (error) return { value: null, error: error.message };
  return { value: (data?.value as T) ?? null };
}

export async function saveUserSetting(supabase: SupabaseClient, key: string, value: unknown): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return "ログインしていません。";
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: u.user.id, key, value, updated_at: new Date().toISOString() });
  return error ? error.message : null;
}
