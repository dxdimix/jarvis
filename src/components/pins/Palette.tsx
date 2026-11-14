"use client";

// パレット: 2 枚目以降のモニターに置く、固定ウィンドウだけを並べる画面（/palette?n=モニターの番号）。
// 並べ方はモニターの番号ごとに覚えておく。開いたら、右上のボタンで全画面にする。
// - 背景で Ctrl + ホイール: パレット全体の縮尺を変える。背景をドラッグ: 全体を動かす。右上の % で元に戻す
// - ウィンドウの上で Ctrl + ホイール: そのウィンドウの中身の縮尺だけを変える

import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ExpandIcon, PinIcon, ShrinkIcon } from "@/components/hud/Icons";
import { BoardZoomBadge, DropOverlay, PinBoard, usePinBoard, usePinDrop } from "./PinBoard";
import { PinAdd } from "./PinAdd";

const iconBtn =
  "grid h-10 w-10 place-items-center rounded-full border border-cyan-400/25 bg-slate-950/60 text-cyan-300 backdrop-blur transition hover:border-cyan-300/70 hover:text-cyan-100";

export function Palette({ session, n }: { session: Session; n: number }) {
  const board = usePinBoard(`palette-${n}`, session);
  const dragging = usePinDrop((url, at) => board.addWeb(url, at));
  const [adding, setAdding] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
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

      <PinBoard state={board} zoomable />

      <nav className="absolute right-4 top-3 z-[900] flex cursor-default gap-2">
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
