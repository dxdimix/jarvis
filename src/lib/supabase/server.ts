// サーバー側（Route Handler）で、ログインしている利用者として Supabase を使う。
// 画面からの fetch は Authorization: Bearer の鍵で、ページの移動（Google のログインなど）は Cookie で利用者を確かめる。
// publishable キーだけを使う（secret キーは Vercel に置かない決まり）。データの保護は RLS。
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { normalizeSupabaseUrl } from "@/lib/auth-error";

export async function userClient(request: Request): Promise<{ supabase: SupabaseClient; user: User } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  let supabase: SupabaseClient;
  if (bearer) {
    supabase = createClient(normalizeSupabaseUrl(url), key.trim(), {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await supabase.auth.getUser(bearer);
    return data.user ? { supabase, user: data.user } : null;
  }
  const store = await cookies();
  supabase = createServerClient(normalizeSupabaseUrl(url), key.trim(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {}
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, user: data.user } : null;
}

/** Google の鍵（Vercel の環境変数）。なければ null */
export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}
