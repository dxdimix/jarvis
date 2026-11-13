import { createBrowserClient } from "@supabase/ssr";
import { normalizeSupabaseUrl } from "@/lib/auth-error";

// ブラウザ用の Supabase クライアント。公開してよいキー（publishable / anon）だけを使う。
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY が設定されていません（.env.local を確認）。",
    );
  }
  return createBrowserClient(normalizeSupabaseUrl(url), key.trim());
}
