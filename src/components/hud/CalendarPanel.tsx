"use client";

// カレンダー（左下の日時を押すと開く）。Google カレンダー（マスターアカウント）の予定を出す。
// - 月のカレンダー（予定のある日に印）と、選んだ日の予定、これからの予定
// - 予定を足すと、Google カレンダーの中の「DIMY」カレンダーに入る（DIMY から登録した予定だと分かるように）
// - 開いている間は 2 分ごとに読み直す（Google カレンダー側の変更も反映する）

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { CloseIcon, ExternalIcon } from "./Icons";

type Ev = { id: string; calendar: string; color: string; title: string; start: string; end: string; allDay: boolean; location: string; dimy: boolean; link: string };
type State = { configured: boolean; connected: boolean; email?: string; events?: Ev[]; error?: string };

const TZ = "Asia/Tokyo";
const dayKey = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: TZ });
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

/** 予定がかかっている日（終日の予定は終わりの日を含まない） */
function eventDays(e: Ev): string[] {
  const s = e.allDay ? e.start : dayKey(new Date(e.start));
  let endKey = e.allDay ? e.end : dayKey(new Date(new Date(e.end).getTime() - 1));
  if (e.allDay) {
    const d = new Date(`${e.end}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    endKey = d.toISOString().slice(0, 10);
  }
  const out: string[] = [];
  const cur = new Date(`${s}T00:00:00Z`);
  for (let i = 0; i < 62 && cur.toISOString().slice(0, 10) <= endKey; i++) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out.length ? out : [s];
}

function timeLabel(e: Ev) {
  if (e.allDay) return "終日";
  const f = (iso: string) => new Date(iso).toLocaleTimeString("ja-JP", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  return `${f(e.start)}〜${f(e.end)}`;
}

export function CalendarPanel({ session, onClose }: { session: Session; onClose: () => void }) {
  const today = dayKey(new Date());
  const [month, setMonth] = useState(today.slice(0, 7)); // 例: 2026-11
  const [selected, setSelected] = useState(today);
  const [state, setState] = useState<State | null>(null);
  const [adding, setAdding] = useState(false);
  // 今の時刻（読み直すたびに更新。表示のたびに時刻を取らないため）
  const [now, setNow] = useState(() => Date.now());

  // 表示している月の前後 1 週間ずつと、これから 30 日を読む
  const range = useMemo(() => {
    const first = new Date(`${month}-01T00:00:00+09:00`);
    const from = new Date(first.getTime() - 7 * 86_400_000);
    const lastOfMonth = new Date(first);
    lastOfMonth.setMonth(lastOfMonth.getMonth() + 1);
    const to = new Date(Math.max(lastOfMonth.getTime() + 7 * 86_400_000, now + 31 * 86_400_000));
    return { from: from.toISOString(), to: to.toISOString() };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 今の時刻が変わるたびに読み直さない
  }, [month]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/google/events?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`, {
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      setState((await res.json()) as State);
      setNow(Date.now());
    } catch (e) {
      setState({ configured: true, connected: true, events: [], error: e instanceof Error ? e.message : String(e) });
    }
  }, [range, session.access_token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = setInterval(load, 2 * 60_000);
    return () => clearInterval(t);
  }, [load]);

  const events = useMemo(() => state?.events ?? [], [state]);
  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const e of events) for (const d of eventDays(e)) m.set(d, [...(m.get(d) ?? []), e]);
    return m;
  }, [events]);
  const upcoming = events.filter((e) => new Date(e.allDay ? `${e.end}T00:00:00+09:00` : e.end).getTime() > now).slice(0, 6);

  // 月のマス（日曜はじまり・6 週）
  const cells = useMemo(() => {
    const first = new Date(`${month}-01T00:00:00Z`);
    const start = new Date(first);
    start.setUTCDate(1 - first.getUTCDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }, [month]);
  const shiftMonth = (n: number) => {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  const selEvents = byDay.get(selected) ?? [];
  const selLabel = new Date(`${selected}T00:00:00+09:00`).toLocaleDateString("ja-JP", { timeZone: TZ, month: "long", day: "numeric", weekday: "short" });

  return (
    <div className="dimy-fade-in absolute bottom-24 left-[76px] z-[860] flex max-h-[calc(100dvh-8rem)] w-[460px] max-w-[calc(100vw-2.5rem)] flex-col rounded-lg border border-cyan-400/30 bg-slate-950/[0.97] p-4 text-sm backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <div className="min-w-0">
          <span className="font-mono text-xs tracking-[0.3em] text-cyan-300">CALENDAR</span>
          {state?.email && <span className="ml-3 truncate text-xs text-slate-400">{state.email}</span>}
        </div>
        <button onClick={onClose} aria-label="閉じる" className="text-cyan-400 hover:text-cyan-100">
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      {/* 月のカレンダー */}
      <div className="mb-2 flex items-center justify-between">
        <button onClick={() => shiftMonth(-1)} className="rounded px-2 text-cyan-300 hover:bg-cyan-400/10" aria-label="前の月">
          ‹
        </button>
        <button onClick={() => (setMonth(today.slice(0, 7)), setSelected(today))} className="font-mono text-cyan-100 hover:text-cyan-50" title="今日に戻る">
          {month.replace("-", " / ")}
        </button>
        <button onClick={() => shiftMonth(1)} className="rounded px-2 text-cyan-300 hover:bg-cyan-400/10" aria-label="次の月">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center font-mono text-xs">
        {WEEK.map((w, i) => (
          <div key={w} className={"pb-1 text-[10px] " + (i === 0 ? "text-rose-300/70" : i === 6 ? "text-sky-300/70" : "text-slate-500")}>
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          const inMonth = d.startsWith(month);
          const evs = byDay.get(d) ?? [];
          return (
            <button
              key={d}
              onClick={() => setSelected(d)}
              className={
                "relative h-9 rounded transition " +
                (d === selected ? "bg-cyan-400/20 text-cyan-50 " : "hover:bg-cyan-400/10 ") +
                (d === today ? "ring-1 ring-cyan-300/80 " : "") +
                (inMonth ? (i % 7 === 0 ? "text-rose-200" : i % 7 === 6 ? "text-sky-200" : "text-cyan-100") : "text-slate-600")
              }
            >
              {Number(d.slice(8))}
              {evs.length > 0 && (
                <span className="absolute inset-x-0 bottom-1 flex justify-center gap-0.5">
                  {evs.slice(0, 3).map((e) => (
                    <span key={e.id + d} className="h-1 w-1 rounded-full" style={{ background: e.dimy ? "#22d3ee" : e.color }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="dimy-caption mt-3 min-h-0 flex-1 overflow-y-auto">
        {!state && <p className="text-xs text-slate-400">読み込んでいます…</p>}
        {state && !state.configured && (
          <p className="text-xs leading-relaxed text-slate-400">Google の鍵がまだ設定されていません（Vercel の GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET）。</p>
        )}
        {state?.configured && !state.connected && (
          <div className="space-y-2 text-xs leading-relaxed text-slate-300">
            <p>Google カレンダーとまだつながっていません。マスターアカウントでログインしてください。</p>
            {state.error && <p className="text-rose-300">{state.error}</p>}
            <a href="/api/google/login" className="inline-block rounded border border-cyan-500/60 px-4 py-1.5 text-cyan-100 hover:bg-cyan-400/10">
              Google カレンダーとつなぐ
            </a>
          </div>
        )}
        {state?.connected && (
          <>
            {state.error && <p className="mb-2 text-xs text-rose-300">{state.error}</p>}
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-cyan-300">{selLabel}</span>
              <button onClick={() => setAdding(!adding)} className="rounded border border-cyan-500/40 px-2 py-0.5 text-xs text-cyan-200 hover:bg-cyan-400/10">
                ＋ 予定を足す
              </button>
            </div>
            {adding && <AddForm date={selected} session={session} onDone={() => (setAdding(false), load())} />}
            {selEvents.length === 0 ? <p className="mb-3 text-xs text-slate-500">予定はありません。</p> : <List events={selEvents} />}
            <div className="mb-1 mt-3 text-xs text-cyan-300">これからの予定</div>
            {upcoming.length === 0 ? <p className="text-xs text-slate-500">予定はありません。</p> : <List events={upcoming} withDate />}
          </>
        )}
      </div>
    </div>
  );
}

function List({ events, withDate }: { events: Ev[]; withDate?: boolean }) {
  return (
    <ul className="space-y-1">
      {events.map((e) => (
        <li key={e.id + e.start} className="flex items-start gap-2 rounded px-1 py-1 hover:bg-cyan-400/5">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: e.dimy ? "#22d3ee" : e.color }} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-cyan-50">
              {e.dimy && <span className="mr-1 rounded bg-cyan-400/15 px-1 font-mono text-[9px] text-cyan-200">DIMY</span>}
              {e.title}
            </div>
            <div className="truncate font-mono text-[10px] text-slate-400">
              {withDate && new Date(e.allDay ? `${e.start}T00:00:00+09:00` : e.start).toLocaleDateString("ja-JP", { timeZone: TZ, month: "numeric", day: "numeric", weekday: "short" }) + " "}
              {timeLabel(e)}
              {e.location && ` ・${e.location}`}
              {` ・${e.calendar}`}
            </div>
          </div>
          {e.link && (
            <a href={e.link} target="_blank" rel="noopener" title="Google カレンダーで開く" className="mt-0.5 text-cyan-400/70 hover:text-cyan-100">
              <ExternalIcon className="h-3.5 w-3.5" />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

/** 予定を足す（「DIMY」カレンダーに入る） */
function AddForm({ date, session, onDone }: { date: string; session: Session; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("11:00");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const body = allDay
      ? { title: title.trim(), start: date, allDay: true }
      : { title: title.trim(), start: `${date}T${start}:00+09:00`, end: `${date}T${end}:00+09:00` };
    const res = await fetch("/api/google/events", {
      method: "POST",
      headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setBusy(false);
    if (j.ok) onDone();
    else setMsg(j.error || "登録できませんでした。");
  }
  return (
    <form onSubmit={submit} className="mb-3 space-y-2 rounded border border-cyan-400/20 p-2 text-xs">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="予定の名前" className="w-full rounded border border-cyan-700/60 bg-slate-900 px-2 py-1.5" autoFocus />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-slate-300">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="accent-cyan-400" />
          終日
        </label>
        {!allDay && (
          <>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="rounded border border-cyan-700/60 bg-slate-900 px-1 py-1" />
            〜
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded border border-cyan-700/60 bg-slate-900 px-1 py-1" />
          </>
        )}
        <button disabled={busy} className="ml-auto rounded bg-cyan-700 px-3 py-1 text-white disabled:opacity-50">
          {busy ? "登録中…" : "登録"}
        </button>
      </div>
      <p className="text-slate-500">Google カレンダーの「DIMY」カレンダーに入ります。</p>
      {msg && <p className="text-rose-300">{msg}</p>}
    </form>
  );
}
