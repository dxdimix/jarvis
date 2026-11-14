// Google カレンダーの予定を読む（GET）・「DIMY」カレンダーに予定を入れる（POST）。
import { accessToken, addEvent, ensureDimyCalendar, listEvents } from "../../../../../agent/lib/gcal.mjs";
import { googleConfig, userClient } from "@/lib/supabase/server";

async function connect(request: Request) {
  const cfg = googleConfig();
  if (!cfg) return { error: Response.json({ configured: false, connected: false }) };
  const who = await userClient(request);
  if (!who) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  const { data: row } = await who.supabase.from("google_tokens").select("refresh_token, email, dimy_calendar_id").maybeSingle();
  if (!row) return { error: Response.json({ configured: true, connected: false }) };
  try {
    const tok = await accessToken({ ...cfg, refreshToken: row.refresh_token });
    return { tok, row, who };
  } catch (e) {
    return { error: Response.json({ configured: true, connected: false, error: e instanceof Error ? e.message : String(e) }) };
  }
}

export async function GET(request: Request) {
  const c = await connect(request);
  if (c.error) return c.error;
  const p = new URL(request.url).searchParams;
  const from = p.get("from");
  const to = p.get("to");
  if (!from || !to) return Response.json({ error: "from と to が必要です" }, { status: 400 });
  try {
    const events = await listEvents(c.tok, { from, to });
    return Response.json({ configured: true, connected: true, email: c.row.email, events });
  } catch (e) {
    return Response.json({ configured: true, connected: true, email: c.row.email, error: e instanceof Error ? e.message : String(e), events: [] });
  }
}

export async function POST(request: Request) {
  const c = await connect(request);
  if (c.error) return c.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const calId = await ensureDimyCalendar(c.tok, c.row.dimy_calendar_id);
    if (calId !== c.row.dimy_calendar_id) await c.who.supabase.from("google_tokens").update({ dimy_calendar_id: calId }).eq("user_id", c.who.user.id);
    const ev = await addEvent(c.tok, calId, {
      title: String(body.title ?? ""),
      start: String(body.start ?? ""),
      end: body.end ? String(body.end) : undefined,
      allDay: typeof body.allDay === "boolean" ? body.allDay : undefined,
      description: body.description ? String(body.description) : undefined,
      location: body.location ? String(body.location) : undefined,
    });
    return Response.json({ ok: true, id: ev?.id });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
