"use client";

// メイン画面の飾りと計器（オリジナルのデザイン）。中央の球体の周りと画面の縁に、動き続ける計器を置いて、画面を「生きている」感じにする。
// - 画面の四隅の枠と目盛り
// - 上中央: 時刻の目盛り（秒で流れる）
// - 球体の周り: 角度の目盛りのリング（ゆっくり逆回転）と、走査する光の線
// - 右: システムの計器（PC との接続・返事までの時間・今日の会話数・固定ウィンドウの数・状態）
// - 右下寄り: 最近の出来事の記録（発言と返事の時刻と頭の数文字）
// - 下: 細い帯の上を流れる光
// - 全体: 走査線と周辺の暗がり
// 操作はしない（クリックは下に通す）。動きを減らす設定の人には、動きを止める（globals.css）。

import type { Message } from "@/lib/types";
import type { RingMode } from "./Ring";

const C = 300;

function polar(r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  // サーバーとブラウザで小数の端が変わらないよう、丸める
  return { x: Math.round((C + r * Math.cos(rad)) * 100) / 100, y: Math.round((C + r * Math.sin(rad)) * 100) / 100 };
}

/** 球体の外側の、角度の目盛りのリング */
function Gauge({ mode }: { mode: RingMode }) {
  const ticks = [];
  for (let d = 0; d < 360; d += 5) {
    const major = d % 30 === 0;
    const a = polar(major ? 268 : 274, d);
    const b = polar(282, d);
    ticks.push(<line key={d} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={major ? 1.4 : 0.7} />);
    if (major) {
      const t = polar(256, d);
      ticks.push(
        <text key={`t${d}`} x={t.x} y={t.y} fontSize="9" textAnchor="middle" dominantBaseline="middle" fill="currentColor" stroke="none" opacity="0.55">
          {String(d).padStart(3, "0")}
        </text>,
      );
    }
  }
  const busy = mode === "thinking";
  return (
    <svg viewBox="0 0 600 600" className="h-full w-full text-cyan-300" aria-hidden>
      <g className="dimy-spin-reverse" style={{ transformOrigin: "300px 300px", animationDuration: busy ? "30s" : "140s" }} stroke="currentColor" opacity="0.5">
        {ticks}
      </g>
      {/* 外側の細い円と、回る括弧 */}
      <circle cx={C} cy={C} r={292} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeDasharray="2 6" />
      <g className="dimy-spin" style={{ transformOrigin: "300px 300px", animationDuration: busy ? "6s" : "24s" }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d={`M ${polar(292, -14).x} ${polar(292, -14).y} A 292 292 0 0 1 ${polar(292, 14).x} ${polar(292, 14).y}`} opacity="0.8" />
        <path d={`M ${polar(292, 166).x} ${polar(292, 166).y} A 292 292 0 0 1 ${polar(292, 194).x} ${polar(292, 194).y}`} opacity="0.8" />
      </g>
      {/* 走査する光の線 */}
      <g className="dimy-spin" style={{ transformOrigin: "300px 300px", animationDuration: "9s" }}>
        <defs>
          <linearGradient id="dimy-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="currentColor" stopOpacity="0" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        <path d={`M ${C} ${C} L ${polar(285, -24).x} ${polar(285, -24).y} A 285 285 0 0 1 ${polar(285, 0).x} ${polar(285, 0).y} Z`} fill="url(#dimy-sweep)" opacity="0.35" />
      </g>
    </svg>
  );
}

/** 画面の角の枠（L 字と目盛り） */
function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const flip = { tl: "", tr: "-scale-x-100", bl: "-scale-y-100", br: "-scale-100" }[pos];
  const place = { tl: "left-2 top-2", tr: "right-2 top-2", bl: "left-2 bottom-2", br: "right-2 bottom-2" }[pos];
  return (
    <svg viewBox="0 0 120 120" className={`absolute h-24 w-24 text-cyan-400/45 ${place} ${flip}`} aria-hidden>
      <path d="M2 60V8a6 6 0 0 1 6-6h52" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 70v14M70 2h14" stroke="currentColor" strokeWidth="1.5" />
      {[16, 24, 32, 40].map((v) => (
        <line key={v} x1={v} y1="7" x2={v} y2="11" stroke="currentColor" strokeWidth="1" />
      ))}
      <rect x="7" y="16" width="3" height="3" fill="currentColor" className="dimy-blink" />
    </svg>
  );
}

/** 上中央の時刻の目盛り（1 秒ごとに流れる） */
function TimeTape({ now }: { now: Date | null }) {
  const sec = now ? now.getSeconds() : 0;
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 hidden w-[min(46vw,560px)] -translate-x-1/2 md:block" aria-hidden>
      <div className="relative h-9 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_20%,black_80%,transparent)]">
        <div className={"absolute inset-y-0 left-1/2 flex items-start " + (sec === 0 ? "" : "transition-transform duration-700 ease-out")} style={{ transform: `translateX(${-sec * 8 - 4}px)` }}>
          {Array.from({ length: 120 }, (_, i) => (
            <div key={i} className="relative w-2 shrink-0">
              <div className={"mx-auto w-px bg-cyan-300/60 " + (i % 5 === 0 ? "h-3" : "h-1.5")} />
              {i % 15 === 0 && <span className="absolute left-1/2 top-4 -translate-x-1/2 font-mono text-[8px] text-cyan-300/50">{String(i % 60).padStart(2, "0")}</span>}
            </div>
          ))}
        </div>
        <div className="absolute left-1/2 top-0 h-5 w-px -translate-x-1/2 bg-cyan-100 shadow-[0_0_6px_#a5f3fc]" />
      </div>
    </div>
  );
}

function Meter({ label, value, ratio, warn }: { label: string; value: string; ratio: number; warn?: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="tracking-[0.25em] text-cyan-400/60">{label}</span>
        <span className={warn ? "text-amber-300" : "text-cyan-100"}>{value}</span>
      </div>
      <div className="mt-1 h-[3px] bg-cyan-400/10">
        <div className={"h-full transition-[width] duration-700 " + (warn ? "bg-amber-300/80" : "bg-cyan-300/80 shadow-[0_0_6px_#22d3ee]")} style={{ width: `${Math.max(2, Math.min(100, ratio * 100))}%` }} />
      </div>
    </div>
  );
}

const MODE_LABEL: Record<RingMode, string> = { idle: "STANDBY", listening: "LISTEN", thinking: "PROCESS", speaking: "VOICE" };

export function HudChrome(o: {
  now: Date | null;
  mode: RingMode;
  online: boolean | null;
  messages: Message[];
  todayCount: number | null;
  pinCount: number;
}) {
  // 直近の返事までの時間（発言から返事の行ができるまで）
  let latency: number | null = null;
  for (let i = o.messages.length - 1; i > 0; i--) {
    const m = o.messages[i];
    if (m.role !== "assistant") continue;
    const q = o.messages.slice(0, i).reverse().find((x) => x.role === "user");
    if (q) latency = (new Date(m.created_at).getTime() - new Date(q.created_at).getTime()) / 1000;
    break;
  }
  const log = o.messages.slice(-5).reverse();
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false });

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {/* 球体の周りの目盛り */}
      <div className="absolute inset-0 grid place-items-center">
        <div className="aspect-square w-[min(92vmin,940px)] opacity-80">
          <Gauge mode={o.mode} />
        </div>
      </div>

      <Corner pos="tl" />
      <Corner pos="tr" />
      <Corner pos="bl" />
      <Corner pos="br" />
      <TimeTape now={o.now} />

      {/* 右: システムの計器 */}
      <div className="absolute right-6 top-1/2 hidden w-44 -translate-y-1/2 space-y-3 font-mono text-[10px] lg:block">
        <div className="mb-1 flex items-center gap-2 text-cyan-300/70">
          <span className="h-px flex-1 bg-cyan-400/30" />
          <span className="tracking-[0.35em]">SYSTEM</span>
        </div>
        <Meter label="LINK" value={o.online ? "ONLINE" : o.online === false ? "OFFLINE" : "···"} ratio={o.online ? 1 : 0.05} warn={o.online === false} />
        <Meter label="RESP" value={latency === null ? "--" : `${latency.toFixed(1)}s`} ratio={latency === null ? 0 : 1 - Math.min(latency, 10) / 10} warn={latency !== null && latency > 8} />
        <Meter label="TODAY" value={o.todayCount === null ? "--" : String(o.todayCount)} ratio={(o.todayCount ?? 0) / 50} />
        <Meter label="PINS" value={String(o.pinCount)} ratio={o.pinCount / 8} />
        <Meter label="MODE" value={MODE_LABEL[o.mode]} ratio={o.mode === "idle" ? 0.15 : 1} />
      </div>

      {/* 右下寄り: 最近の出来事 */}
      <div className="absolute bottom-24 right-6 hidden w-56 space-y-1 font-mono text-[10px] lg:block">
        <div className="mb-1 flex items-center gap-2 text-cyan-300/70">
          <span className="h-px flex-1 bg-cyan-400/30" />
          <span className="tracking-[0.35em]">LOG</span>
        </div>
        {log.map((m, i) => (
          <div key={m.id} className="flex gap-2 truncate" style={{ opacity: 1 - i * 0.17 }}>
            <span className="text-cyan-400/60">{fmt(m.created_at)}</span>
            <span className={m.role === "user" ? "text-cyan-200/80" : "text-cyan-100/60"}>{m.role === "user" ? "▸" : "◂"}</span>
            <span className="truncate text-cyan-100/70">{m.content.replace(/\s+/g, " ").slice(0, 22)}</span>
          </div>
        ))}
      </div>

      {/* 下: 光が流れる帯 */}
      <div className="absolute inset-x-[22%] bottom-3 hidden h-px overflow-hidden bg-cyan-400/15 md:block">
        <div className="dimy-rail h-full w-1/4 bg-gradient-to-r from-transparent via-cyan-200 to-transparent" />
      </div>

      {/* 走査線と周辺の暗がり */}
      <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(34,211,238,0.035)_0_1px,transparent_1px_3px)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(2,6,23,0.75)_100%)]" />
    </div>
  );
}
