// Google カレンダーとのつながりを外す（保存した鍵を消し、Google 側でも鍵を取り消す）。
import { userClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const who = await userClient(request);
  if (!who) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { data: row } = await who.supabase.from("google_tokens").select("refresh_token").maybeSingle();
  if (row?.refresh_token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(row.refresh_token)}`, { method: "POST" }).catch(() => {});
  await who.supabase.from("google_tokens").delete().eq("user_id", who.user.id);
  return Response.json({ ok: true });
}
