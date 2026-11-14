// DIMY の道具: Google カレンダー（マスターアカウント）の予定を読む・「DIMY」カレンダーに予定を入れる。
// 画面の「Google カレンダーとつなぐ」で保存した鍵（表 google_tokens）と、.env.local の GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET を使う。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { aliasLegacyEnv } from "../lib/env.mjs";
import { accessToken, addEvent, ensureDimyCalendar, listEvents } from "../lib/gcal.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
loadEnv({ path: path.join(ROOT, ".env.local"), quiet: true });
aliasLegacyEnv();

async function connect() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("PC の .env.local に GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET がありません。");
  const raw = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  const owner = process.env.DIMY_OWNER_ID;
  if (!raw || !key || !owner) throw new Error("DIMY のデータベースの設定がありません。");
  const sb = createClient(new URL(raw).origin, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: row, error } = await sb.from("google_tokens").select("refresh_token, email, dimy_calendar_id").eq("user_id", owner).maybeSingle();
  if (error) throw new Error(`読めませんでした: ${error.message}`);
  if (!row) throw new Error("Google カレンダーとまだつながっていません。画面の左下の日時 →「Google カレンダーとつなぐ」でつないでください。");
  const tok = await accessToken({ clientId, clientSecret, refreshToken: row.refresh_token });
  return { sb, owner, row, tok };
}

const fmt = (e) => {
  const f = (iso) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
  const when = e.allDay ? `${e.start}（終日）` : `${f(e.start)}〜${new Date(e.end).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" })}`;
  return `${when} ${e.title}${e.location ? ` ＠${e.location}` : ""}［${e.dimy ? "DIMY" : e.calendar}］`;
};

/** 予定の一覧（from / to は "2026-11-20" か ISO の日時。省くと今日から 7 日） */
export async function calendarEvents({ from, to } = {}) {
  const { tok } = await connect();
  const start = from ? new Date(from.length === 10 ? `${from}T00:00:00+09:00` : from) : new Date();
  const end = to ? new Date(to.length === 10 ? `${to}T23:59:59+09:00` : to) : new Date(start.getTime() + 7 * 86_400_000);
  const list = await listEvents(tok, { from: start.toISOString(), to: end.toISOString() });
  return list.length ? list.map(fmt).join("\n") : "その期間に予定はありません。";
}

/** 「DIMY」カレンダーに予定を入れる */
export async function calendarAdd(a) {
  const { sb, owner, row, tok } = await connect();
  const calId = await ensureDimyCalendar(tok, row.dimy_calendar_id);
  if (calId !== row.dimy_calendar_id) await sb.from("google_tokens").update({ dimy_calendar_id: calId }).eq("user_id", owner);
  await addEvent(tok, calId, a);
  return `Google カレンダーの「DIMY」カレンダーに「${a.title}」を登録しました。`;
}
