// Google のログインから戻ってきたところ。鍵を受け取り、表 google_tokens に保存して、メイン画面へ戻す。
import { DIMY_CALENDAR, ensureDimyCalendar, exchangeCode, primaryEmail } from "../../../../../agent/lib/gcal.mjs";
import { googleConfig, userClient } from "@/lib/supabase/server";

function back(origin: string, result: string) {
  return Response.redirect(`${origin}/?google=${encodeURIComponent(result)}`, 302);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const cfg = googleConfig();
  if (!cfg) return back(origin, "not-configured");
  if (url.searchParams.get("error")) return back(origin, "cancelled");
  const state = request.headers.get("cookie")?.match(/(?:^|;\s*)dimy_google_state=([^;]+)/)?.[1];
  if (!state || state !== url.searchParams.get("state")) return back(origin, "bad-state");
  const who = await userClient(request);
  if (!who) return back(origin, "not-logged-in");
  try {
    const t = await exchangeCode({ ...cfg, code: url.searchParams.get("code") ?? "", redirectUri: `${origin}/api/google/callback` });
    if (!t.refresh_token) return back(origin, "no-refresh-token");
    const email = await primaryEmail(t.access_token);
    const calId = await ensureDimyCalendar(t.access_token, null);
    const { error } = await who.supabase
      .from("google_tokens")
      .upsert({ user_id: who.user.id, refresh_token: t.refresh_token, email, dimy_calendar_id: calId, updated_at: new Date().toISOString() });
    if (error) return back(origin, `db:${error.message}`);
    return back(origin, `connected:${email}:${DIMY_CALENDAR}`);
  } catch (e) {
    return back(origin, `error:${e instanceof Error ? e.message : String(e)}`);
  }
}
