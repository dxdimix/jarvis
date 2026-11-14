import { afterEach, describe, expect, it, vi } from "vitest";
import { addEvent, authUrl, ensureDimyCalendar } from "../agent/lib/gcal.mjs";

afterEach(() => vi.unstubAllGlobals());

function mockFetch(responses) {
  const calls = [];
  vi.stubGlobal("fetch", async (url, init) => {
    calls.push({ url: String(url), init });
    const body = responses.shift() ?? {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
  return calls;
}

describe("Google カレンダー", () => {
  it("ログインの URL に、ずっとつながるための指定が入る", () => {
    const u = new URL(authUrl({ clientId: "c", redirectUri: "https://dimy.dxdimix.com/api/google/callback", state: "s" }));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/calendar");
  });

  it("終日の予定は翌日までにし、説明に「DIMY から登録」を付ける", async () => {
    const calls = mockFetch([{ id: "e1" }]);
    await addEvent("tok", "cal@x", { title: "健康診断", start: "2026-11-20" });
    const body = JSON.parse(calls[0].init.body);
    expect(body.start).toEqual({ date: "2026-11-20" });
    expect(body.end).toEqual({ date: "2026-11-21" });
    expect(body.description).toBe("DIMY から登録");
  });

  it("時刻ありで終わりを省くと 1 時間", async () => {
    const calls = mockFetch([{ id: "e2" }]);
    await addEvent("tok", "cal@x", { title: "打ち合わせ", start: "2026-11-20T10:00:00+09:00", description: "資料を持参" });
    const body = JSON.parse(calls[0].init.body);
    expect(body.start.dateTime).toBe("2026-11-20T01:00:00.000Z");
    expect(body.end.dateTime).toBe("2026-11-20T02:00:00.000Z");
    expect(body.description).toBe("資料を持参\n\nDIMY から登録");
  });

  it("「DIMY」カレンダーがあれば使い、なければ作る", async () => {
    mockFetch([{ items: [{ id: "d@group", summary: "DIMY" }] }]);
    expect(await ensureDimyCalendar("tok", null)).toBe("d@group");
    const calls = mockFetch([{ items: [] }, { id: "new@group" }]);
    expect(await ensureDimyCalendar("tok", null)).toBe("new@group");
    expect(JSON.parse(calls[1].init.body).summary).toBe("DIMY");
  });
});
