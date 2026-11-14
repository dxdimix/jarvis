// 固定ウィンドウで開こうとしているページが、ディミの中への表示を許しているかを調べる。
// ブラウザからは他のサイトの応答の見出しを読めないため、ここ（Vercel）で代わりに取りに行く。
// 返すのは「表示できるか」だけ。ページの中身は返さない。ログインしている利用者だけが使える。
import { createClient } from "@supabase/supabase-js";
import { frameAllowed } from "@/lib/frame";
import { normalizeSupabaseUrl } from "@/lib/auth-error";

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await createClient(normalizeSupabaseUrl(url), key.trim()).auth.getUser(token);
  if (error || !data.user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const target = params.get("url") ?? "";
  const host = params.get("host") ?? "dimy.dxdimix.com";
  let parsed: URL;
  try {
    parsed = new URL(target);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
  } catch {
    return Response.json({ error: "bad url" }, { status: 400 });
  }
  try {
    const res = await fetch(parsed, {
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
      headers: { "user-agent": "Mozilla/5.0 (DIMY frame check)" },
    });
    res.body?.cancel().catch(() => {});
    const allowed = frameAllowed(
      { xfo: res.headers.get("x-frame-options"), csp: res.headers.get("content-security-policy") },
      res.url || parsed.toString(),
      host,
    );
    return Response.json({ allowed });
  } catch {
    // 調べられなかったときは、表示を試してみる
    return Response.json({ allowed: true, unknown: true });
  }
}
