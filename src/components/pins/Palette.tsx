"use client";

// パレット: 2 枚目以降のモニターに置く、固定ウィンドウだけを並べる画面（/palette?n=モニターの番号）。
// 並べ方はモニターの番号ごとに覚えておく。開いたら、右上のボタンで全画面にする。
// - 背景で Ctrl + ホイール: パレット全体の縮尺を変える。背景をドラッグ: 全体を動かす。右上の % で元に戻す
// - ウィンドウの上で Ctrl + ホイール: そのウィンドウの中身の縮尺だけを変える
// - 画面分割（右上のボタン。左右 2 分割・上下 2 分割・4 分割）: 枠を出し、ウィンドウをドラッグして離すと、その枠いっぱいになる

import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ExpandIcon, PinIcon, ShrinkIcon } from "@/components/hud/Icons";
import { BoardZoomBadge, DropOverlay, PinBoard, usePinBoard, usePinDrop } from "./PinBoard";
import { splitSlots, type SplitLayout } from "@/lib/pins";

const LAYOUTS: { id: SplitLayout; label: string }[] = [
  { id: "free", label: "分割なし" },
  { id: "cols2", label: "左右 2 分割" },
  { id: "rows2", label: "上下 2 分割" },
  { id: "grid4", label: "4 分割" },
];

/** 画面分割のアイコン */
function LayoutIcon({ id, className }: { id: SplitLayout; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" {...p} strokeDasharray={id === "free" ? "2.5 2.5" : undefined} />
      {(id === "cols2" || id === "grid4") && <path d="M12 4v16" {...p} />}
      {(id === "rows2" || id === "grid4") && <path d="M3 12h18" {...p} />}
    </svg>
  );
}
import { PinAdd } from "./PinAdd";

const iconBtn =
  "grid h-10 w-10 place-items-center rounded-full border border-cyan-400/25 bg-slate-950/60 text-cyan-300 backdrop-blur transition hover:border-cyan-300/70 hover:text-cyan-100";

export function Palette({ session, n }: { session: Session; n: number }) {
  const board = usePinBoard(`palette-${n}`, session);
  const dragging = usePinDrop((url, at) => board.addWeb(url, at));
  const [adding, setAdding] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // 画面分割（モニターごとに覚えておく）
  const layoutKey = `dimy.paletteLayout.${n}`;
  const [layout, setLayout] = useState<SplitLayout>("free");
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    try {
      const l = localStorage.getItem(layoutKey) as SplitLayout | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (l && LAYOUTS.some((x) => x.id === l)) setLayout(l);
    } catch {}
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [layoutKey]);
  const chooseLayout = (l: SplitLayout) => {
    setLayout(l);
    try {
      localStorage.setItem(layoutKey, l);
    } catch {}
  };
  // 上の帯（ボタン）の分だけ、枠を下げる
  const slots = size.w ? splitSlots(layout, size.w, size.h, 8, 56) : [];
  const { setSlots } = board;
  useEffect(() => {
    setSlots(slots);
  });
  // 背景のドラッグで、パレット全体を動かす
  const pan = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const onBgDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest("[data-pin-id], nav, [data-no-board-zoom]")) return;
    pan.current = { sx: e.clientX, sy: e.clientY, ox: board.view.x, oy: board.view.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onBgMove = (e: React.PointerEvent) => {
    const p = pan.current;
    if (p) board.setView({ ...board.view, x: p.ox + e.clientX - p.sx, y: p.oy + e.clientY - p.sy });
  };

  useEffect(() => {
    document.title = `DIMY パレット ${n}`;
    const on = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, [n]);

  return (
    <div
      className="dimy-grid relative h-dvh w-full cursor-grab overflow-hidden text-cyan-100 active:cursor-grabbing"
      onPointerDown={onBgDown}
      onPointerMove={onBgMove}
      onPointerUp={() => (pan.current = null)}
    >
      {/* 四隅の枠 */}
      <div className="pointer-events-none absolute inset-3 border border-cyan-400/10" />
      <span className="pointer-events-none absolute left-5 top-4 font-mono text-[10px] tracking-[0.4em] text-cyan-400/60">DIMY · PALETTE {n}</span>

      {board.pins.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
          <div className="max-w-md space-y-3 text-sm text-slate-400">
            <PinIcon className="mx-auto h-10 w-10 text-cyan-400/50" />
            <p>Chrome / Edge のアドレス欄の左端のアイコンをつかんで、ここにドラッグすると、そのページを置けます。</p>
            <p>右上の「＋」から、URL を入れる・ほかのアプリの画面を映すこともできます。</p>
            <p>Ctrl + ホイールで、背景の上ならパレット全体、ウィンドウの上ならその中身の縮尺を変えられます。</p>
          </div>
        </div>
      )}

      <PinBoard state={board} zoomable slots={slots} />

      <nav className="absolute right-4 top-3 z-[900] flex cursor-default gap-2">
        {/* 画面分割 */}
        <div className="flex gap-1 rounded-full border border-cyan-400/25 bg-slate-950/60 p-1 backdrop-blur">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              onClick={() => chooseLayout(l.id)}
              title={l.label}
              aria-label={l.label}
              aria-pressed={layout === l.id}
              className={
                "grid h-8 w-8 place-items-center rounded-full transition " +
                (layout === l.id ? "bg-cyan-400/20 text-cyan-100 shadow-[0_0_10px_rgba(34,211,238,0.4)]" : "text-cyan-300/70 hover:text-cyan-100")
              }
            >
              <LayoutIcon id={l.id} className="h-5 w-5" />
            </button>
          ))}
        </div>
        <BoardZoomBadge state={board} />
        <button onClick={() => setAdding(!adding)} className={iconBtn} title="固定ウィンドウを足す" aria-label="固定ウィンドウを足す">
          <span className="text-xl leading-none">＋</span>
        </button>
        <button
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
          className={iconBtn}
          title="全画面"
          aria-label="全画面の切り替え"
        >
          {fullscreen ? <ShrinkIcon className="h-5 w-5" /> : <ExpandIcon className="h-5 w-5" />}
        </button>
      </nav>
      {adding && (
        <div data-no-board-zoom className="absolute right-4 top-16 z-[950] cursor-default">
          <PinAdd state={board} onClose={() => setAdding(false)} />
        </div>
      )}
      <DropOverlay show={dragging} />
    </div>
  );
}
