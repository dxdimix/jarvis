// 「Google カレンダーとつなぐ」: Google のログイン画面へ送る（マスターアカウントを選んでもらう）。
import { authUrl } from "../../../../../agent/lib/gcal.mjs";
import { googleConfig, userClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const cfg = googleConfig();
  if (!cfg) return new Response("Google の鍵（GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET）が Vercel に設定されていません。", { status: 500 });
  const who = await userClient(request);
  if (!who) return new Response("ディミにログインしてから、もう一度押してください。", { status: 401 });
  const origin = new URL(request.url).origin;
  const state = crypto.randomUUID();
  const res = Response.redirect(authUrl({ clientId: cfg.clientId, redirectUri: `${origin}/api/google/callback`, state }), 302);
  const headers = new Headers(res.headers);
  // なりすまし防止の合言葉（戻ってきたときに同じか確かめる）
  headers.append("set-cookie", `dimy_google_state=${state}; Path=/api/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  return new Response(null, { status: 302, headers });
}
