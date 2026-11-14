"use client";

// 天気の詳細（右下の天気を押すと開く）。これから 36 時間の 1 時間ごとと、おととい〜7 日後の日ごと。

import { useEffect, useState } from "react";
import { fetchForecast, weatherLabel, type Forecast, type Place } from "@/lib/weather";
import { CloseIcon, WeatherIcon } from "./Icons";
import { useDismiss } from "@/hooks/useDismiss";

const todayKey = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

function dayLabel(date: string) {
  const today = todayKey();
  const d = new Date(`${date}T00:00:00+09:00`);
  const diff = Math.round((d.getTime() - new Date(`${today}T00:00:00+09:00`).getTime()) / 86_400_000);
  const names: Record<number, string> = { [-2]: "おととい", [-1]: "昨日", 0: "今日", 1: "明日", 2: "あさって" };
  const md = d.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short" });
  return { name: names[diff] ?? "", md, past: diff < 0, today: diff === 0 };
}

export function WeatherPanel({ place, onClose }: { place: Place; onClose: () => void }) {
  const [data, setData] = useState<Forecast | null>(null);
  const [error, setError] = useState("");
  const ref = useDismiss<HTMLDivElement>(onClose); // 外をクリック・Esc で閉じる
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchForecast(place)
        .then((f) => alive && setData(f))
        .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    load();
    const t = setInterval(load, 15 * 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [place]);

  const temps = data?.days.flatMap((d) => [d.max, d.min]) ?? [];
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const pct = (v: number) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);

  return (
    <div ref={ref} className="dimy-fade-in absolute bottom-24 right-5 z-[860] w-[460px] max-w-[calc(100vw-2.5rem)] rounded-lg border border-cyan-400/30 bg-slate-950/[0.97] p-4 text-sm backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <span className="font-mono text-xs tracking-[0.3em] text-cyan-300">WEATHER</span>
          <span className="ml-3 text-xs text-slate-400">{place.name}</span>
        </div>
        <button onClick={onClose} aria-label="閉じる" className="text-cyan-400 hover:text-cyan-100">
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {!data && !error && <p className="text-xs text-slate-400">読み込んでいます…</p>}
      {data && (
        <>
          {/* 1 時間ごと（横にスクロール） */}
          <div className="dimy-caption -mx-1 flex gap-1 overflow-x-auto pb-2">
            {data.hours.map((h, i) => {
              const hour = Number(h.time.slice(11, 13));
              return (
                <div key={h.time} className={"flex w-12 shrink-0 flex-col items-center rounded py-1.5 " + (i === 0 ? "bg-cyan-400/10" : "")}>
                  <span className="font-mono text-[10px] text-slate-400">{i === 0 ? "今" : hour === 0 ? `${Number(h.time.slice(8, 10))}日` : `${hour}時`}</span>
                  <WeatherIcon code={h.code} className="my-1 h-5 w-5 text-cyan-300" />
                  <span className="font-mono text-xs text-cyan-100">{Math.round(h.temperature)}°</span>
                  <span className="font-mono text-[10px] text-sky-300/80">{h.rain ?? "-"}%</span>
                </div>
              );
            })}
          </div>
          {/* 日ごと */}
          <div className="mt-2 space-y-0.5">
            {data.days.map((d) => {
              const l = dayLabel(d.date);
              return (
                <div
                  key={d.date}
                  title={`${weatherLabel(d.code)} 日の出 ${d.sunrise.slice(11)} 日の入り ${d.sunset.slice(11)}`}
                  className={"grid grid-cols-[6.5rem_1.5rem_1fr_2.5rem] items-center gap-2 rounded px-2 py-1 " + (l.today ? "bg-cyan-400/10" : "") + (l.past ? " opacity-55" : "")}
                >
                  <span className="truncate text-xs">
                    <span className="text-cyan-100">{l.md}</span>
                    {l.name && <span className="ml-1 text-slate-400">{l.name}</span>}
                  </span>
                  <WeatherIcon code={d.code} className="h-5 w-5 text-cyan-300" />
                  {/* 最低〜最高の幅を、期間全体の気温の中で見せる */}
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="w-7 text-right text-sky-300">{Math.round(d.min)}°</span>
                    <div className="relative h-1 flex-1 rounded bg-slate-800">
                      <div
                        className="absolute h-1 rounded bg-gradient-to-r from-sky-400 to-amber-300"
                        style={{ left: `${pct(d.min)}%`, width: `${Math.max(2, pct(d.max) - pct(d.min))}%` }}
                      />
                    </div>
                    <span className="w-7 text-amber-200">{Math.round(d.max)}°</span>
                  </div>
                  <span className="text-right font-mono text-[11px] text-sky-300/80">{d.rain ?? "-"}%</span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">気温の下の % は降水確率。行にマウスを乗せると、天気と日の出・日の入りが出ます。</p>
        </>
      )}
    </div>
  );
}
