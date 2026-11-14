// Google カレンダー（Google Calendar API。Google Cloud で作った OAuth の鍵を使う。費用はかからない）。
// 画面（Vercel のサーバー側 /api/google/*）と、PC のディミ（MCP の道具）の両方から使う。
// - 利用者のマスターアカウントでつなぎ、更新用の鍵（refresh token）を表 google_tokens に保存する
// - DIMY が登録する予定は、Google カレンダーの中の「DIMY」という別のカレンダーに入れる（なければ作る）
// - 予定の説明の最後に「DIMY から登録」と書く

export const SCOPE = "https://www.googleapis.com/auth/calendar";
export const DIMY_CALENDAR = "DIMY";
const API = "https://www.googleapis.com/calendar/v3";

/** Google のログイン画面の URL */
export function authUrl({ clientId, redirectUri, state }) {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // 更新用の鍵をもらう（ずっとつながったままにするため）
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function token(body) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google の鍵を取得できませんでした（${json.error_description || json.error || res.status}）`);
  return json;
}

/** ログイン後に戻ってきた code を、鍵に替える */
export function exchangeCode({ clientId, clientSecret, code, redirectUri }) {
  return token({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: "authorization_code" });
}

/** 更新用の鍵から、1 時間使える鍵を作る */
export async function accessToken({ clientId, clientSecret, refreshToken }) {
  const j = await token({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" });
  return j.access_token;
}

async function api(tok, path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${tok}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google カレンダーのエラー（${json.error?.message || res.status}）`);
  return json;
}

/** カレンダーの一覧 */
export async function listCalendars(tok) {
  const j = await api(tok, "/users/me/calendarList?maxResults=250");
  return j.items ?? [];
}

/** マスターアカウントのメールアドレス（いつものカレンダーの id） */
export async function primaryEmail(tok) {
  const j = await api(tok, "/calendars/primary");
  return j.id;
}

/** 「DIMY」カレンダーの id（なければ作る）。knownId が使えればそれを使う */
export async function ensureDimyCalendar(tok, knownId) {
  const cals = await listCalendars(tok);
  const found = cals.find((c) => c.id === knownId) ?? cals.find((c) => c.summary === DIMY_CALENDAR);
  if (found) return found.id;
  const created = await api(tok, "/calendars", {
    method: "POST",
    body: JSON.stringify({ summary: DIMY_CALENDAR, description: "DIMY（ディミ）から登録した予定", timeZone: "Asia/Tokyo" }),
  });
  return created.id;
}

/**
 * 予定の一覧（表示しているカレンダーすべて。from〜to は ISO の日時）。
 * @returns {Promise<{ id: string, calendarId: string, calendar: string, color: string, title: string, start: string, end: string, allDay: boolean, location: string, dimy: boolean, holiday: boolean, link: string }[]>}
 */
export async function listEvents(tok, { from, to }) {
  const cals = (await listCalendars(tok)).filter((c) => c.selected !== false || c.primary || c.summary === DIMY_CALENDAR);
  const q = new URLSearchParams({ timeMin: from, timeMax: to, singleEvents: "true", orderBy: "startTime", maxResults: "250", timeZone: "Asia/Tokyo" });
  const lists = await Promise.all(
    cals.map(async (c) => {
      try {
        const j = await api(tok, `/calendars/${encodeURIComponent(c.id)}/events?${q}`);
        return (j.items ?? [])
          .filter((e) => e.status !== "cancelled")
          .map((e) => ({
            id: e.id,
            calendarId: c.id,
            calendar: c.primary ? "いつものカレンダー" : c.summaryOverride || c.summary,
            color: c.backgroundColor || "#22d3ee",
            title: e.summary || "（名前なし）",
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date,
            allDay: Boolean(e.start?.date),
            location: e.location || "",
            dimy: c.summary === DIMY_CALENDAR,
            // 祝日のカレンダー（「日本の祝日」など）。画面では予定の一覧に出さず、日付を赤くする
            holiday: String(c.id).includes("#holiday@"),
            link: e.htmlLink || "",
          }));
      } catch {
        return [];
      }
    }),
  );
  return lists.flat().sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

/**
 * 「DIMY」カレンダーに予定を入れる。
 * start / end: 終日なら "2026-11-20"、時刻ありなら "2026-11-20T10:00:00+09:00"（end を省くと 1 時間）
 */
export async function addEvent(tok, calendarId, { title, start, end, allDay, description, location }) {
  if (!title || !start) throw new Error("予定の名前と開始日時が必要です。");
  const isAllDay = allDay ?? /^\d{4}-\d{2}-\d{2}$/.test(start);
  let s;
  let e;
  if (isAllDay) {
    const day = start.slice(0, 10);
    const next = new Date(`${(end || day).slice(0, 10)}T00:00:00Z`);
    if (!end || end.slice(0, 10) === day) next.setUTCDate(next.getUTCDate() + 1);
    s = { date: day };
    e = { date: next.toISOString().slice(0, 10) };
  } else {
    const startDate = new Date(start);
    if (Number.isNaN(startDate.getTime())) throw new Error("開始日時の形が違います。");
    const endDate = end ? new Date(end) : new Date(startDate.getTime() + 60 * 60_000);
    s = { dateTime: startDate.toISOString(), timeZone: "Asia/Tokyo" };
    e = { dateTime: endDate.toISOString(), timeZone: "Asia/Tokyo" };
  }
  const body = {
    summary: title,
    start: s,
    end: e,
    location: location || undefined,
    description: [description, "DIMY から登録"].filter(Boolean).join("\n\n"),
  };
  return api(tok, `/calendars/${encodeURIComponent(calendarId)}/events`, { method: "POST", body: JSON.stringify(body) });
}
