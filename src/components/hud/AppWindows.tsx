"use client";

// ディミの画面の中に浮かぶ、アプリの小窓（いくつでも開ける）。
// - 開くとき: 押したアイコン（声のときは中央の球体）の位置の、遠くの小さな点から迫ってきて、上下に開く。
// - 閉じるとき: 上下に閉じて、遠くへ吸い込まれるように消える。
// - 枠: 右上と左下の角を斜めに切り落とし、左上と右下に光る角の印。右下の印をつかむと大きさを変えられる。
// - 上の帯をつかんで動かす。ダブルクリックで大きくする・戻す。
// - ボタン: 読み込み直す / Chrome（別のタブ）で開く / 大きくする・戻す / 閉じる
// - 中で開けないアプリ（apps.ts の canEmbed が false）は、小さな別ウィンドウで開く。

import { useCallback, useRef, useState } from "react";
import { APPS, canEmbed, type AppEntry, type AppId } from "@/lib/apps";
import { AppIcon, CloseIcon, ExternalIcon, MaxIcon, ReloadIcon, RestoreIcon } from "./Icons";

type Point = { x: number; y: number };
type Win = {
  id: AppId;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  max: boolean;
  key: number; // 読み込み直すたびに変える
  from: Point; // 出てきた場所（画面の座標）
  closing: boolean;
};

const MIN_W = 360;
const MIN_H = 240;
const btn = "grid h-7 w-7 place-items-center rounded-sm text-cyan-300/80 transition hover:bg-cyan-400/15 hover:text-cyan-50";

/** 小さな別ウィンドウで開く（中で開けないアプリ用）。ブラウザに止められたら false */
export function openPopup(app: AppEntry): boolean {
  const w = Math.min(1280, window.screen.availWidth - 80);
  const h = Math.min(860, window.screen.availHeight - 80);
  const left = Math.max(0, (window.screen.availWidth - w) / 2);
  const top = Math.max(0, (window.screen.availHeight - h) / 2);
  return window.open(app.url, `dimy-${app.id}`, `popup=yes,width=${w},height=${h},left=${left},top=${top}`) !== null;
}

/** Chrome（いつものブラウザの別のタブ）で開く */
export function openExternal(app: AppEntry) {
  window.open(app.url, "_blank", "noopener");
}

export function useAppWindows() {
  const [wins, setWins] = useState<Win[]>([]);
  const zTopRef = useRef(20);

  /** 開けたら true（別ウィンドウをブラウザに止められたら false）。from は出てくる場所（省略で画面の中央） */
  const open = useCallback((id: AppId, from?: Point): boolean => {
    const app = APPS.find((a) => a.id === id);
    if (!app) return false;
    // 開発中（localhost）は、本番（dimy.dxdimix.com）と同じ判定にする
    const host = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) ? "dimy.dxdimix.com" : window.location.hostname;
    if (!canEmbed(app, host)) return openPopup(app);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const origin = from ?? { x: vw / 2, y: vh / 2 };
    setWins((prev) => {
      const z = ++zTopRef.current;
      const found = prev.find((w) => w.id === id && !w.closing);
      if (found) return prev.map((w) => (w === found ? { ...w, z } : w)); // 開いていれば前に出す
      const small = vw < 768;
      const w = small ? vw : Math.min(1100, vw * 0.62);
      const h = small ? vh : Math.min(760, vh * 0.75);
      const n = prev.filter((p) => !p.closing).length;
      const x = small ? 0 : (vw - w) / 2 + n * 28;
      const y = small ? 0 : (vh - h) / 2 + n * 28;
      return [...prev.filter((p) => p.id !== id), { id, x, y, w, h, z, max: small, key: 0, from: origin, closing: false }];
    });
    return true;
  }, []);

  return { wins, setWins, open, zTopRef };
}

/**
 * 大きくしたときの場所。ディミの画面のボタン（右上のボタン・左端のアプリのアイコン・下のマイク）と重ならないよう、
 * その分を空けて広げる（スマホなど狭い画面では、画面いっぱい）。
 */
function maxBox() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw < 768) return { left: 0, top: 0, width: vw, height: vh };
  const left = 76; // 左端のアプリのアイコン
  const top = 72; // 右上のボタン
  const bottom = 104; // 下のマイクと強制停止
  return { left, top, width: vw - left - 12, height: vh - top - bottom };
}

/** 光る角の印（L 字）。corner で向きを決める */
export function Bracket({ corner, className = "" }: { corner: "tl" | "br"; className?: string }) {
  const d = corner === "tl" ? "M1.5 22V1.5H22" : "M22.5 2v20.5H2";
  return (
    <svg viewBox="0 0 24 24" className={"pointer-events-none absolute h-7 w-7 text-cyan-200 drop-shadow-[0_0_8px_rgba(34,211,238,1)] " + className}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
    </svg>
  );
}

export function AppWindows({ state }: { state: ReturnType<typeof useAppWindows> }) {
  const { wins, setWins, zTopRef } = state;
  const action = useRef<{ id: AppId; kind: "move" | "resize"; sx: number; sy: number; ox: number; oy: number } | null>(null);
  // 動かしている間は、小窓の中（iframe）がマウスを横取りしないようにする
  const [busy, setBusy] = useState(false);

  const update = (id: AppId, patch: Partial<Win>) =>
    setWins((prev) => prev.map((w) => (w.id === id && !w.closing ? { ...w, ...patch } : w)));
  const front = (id: AppId) => update(id, { z: ++zTopRef.current });
  const close = (id: AppId) => setWins((prev) => prev.map((w) => (w.id === id ? { ...w, closing: true } : w)));
  const remove = (id: AppId) => setWins((prev) => prev.filter((w) => !(w.id === id && w.closing)));

  function start(e: React.PointerEvent, win: Win, kind: "move" | "resize") {
    if (win.max || (e.target as HTMLElement).closest("button")) return;
    e.stopPropagation();
    action.current = {
      id: win.id,
      kind,
      sx: e.clientX,
      sy: e.clientY,
      ox: kind === "move" ? win.x : win.w,
      oy: kind === "move" ? win.y : win.h,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setBusy(true);
    front(win.id);
  }
  function move(e: React.PointerEvent) {
    const a = action.current;
    if (!a) return;
    const dx = e.clientX - a.sx;
    const dy = e.clientY - a.sy;
    if (a.kind === "move") update(a.id, { x: Math.max(-200, a.ox + dx), y: Math.max(0, a.oy + dy) });
    else update(a.id, { w: Math.max(MIN_W, a.ox + dx), h: Math.max(MIN_H, a.oy + dy) });
  }
  function end() {
    action.current = null;
    setBusy(false);
  }

  return (
    <>
      {wins.map((win) => {
        const app = APPS.find((a) => a.id === win.id)!;
        const box = win.max ? maxBox() : { left: win.x, top: win.y, width: win.w, height: win.h };
        // 出てきた場所を、小窓の中の座標で表す（そこを中心に大きくなる）
        const origin = `${win.from.x - box.left}px ${win.from.y - box.top}px`;
        return (
          <div
            key={win.id}
            style={{ ...box, zIndex: win.z, transformOrigin: origin }}
            onPointerDown={() => front(win.id)}
            onAnimationEnd={(e) => {
              if (win.closing && e.animationName === "dimy-win-out") remove(win.id);
            }}
            className={"fixed drop-shadow-[0_0_24px_rgba(34,211,238,0.28)] " + (win.closing ? "dimy-win-out" : "dimy-win-in")}
          >
            {/* 枠（光る線）と中身。角を切り落とした形を 2 枚重ねて、1px の枠線にする */}
            <div className={"absolute inset-0 bg-gradient-to-br from-cyan-300/80 via-cyan-500/30 to-cyan-300/70 " + (win.max ? "" : "dimy-cut")} />
            <div className={"absolute inset-px flex flex-col overflow-hidden bg-slate-950/95 backdrop-blur " + (win.max ? "" : "dimy-cut")}>
              {/* 上の帯 */}
              <div
                onPointerDown={(e) => start(e, win, "move")}
                onPointerMove={move}
                onPointerUp={end}
                onDoubleClick={() => update(win.id, { max: !win.max })}
                className={
                  "relative flex h-9 shrink-0 select-none items-center gap-2 border-b border-cyan-400/30 bg-gradient-to-r from-cyan-500/15 via-transparent to-transparent pl-3 pr-6 " +
                  (win.max ? "" : "cursor-move")
                }
              >
                <AppIcon id={app.id} className="h-4 w-4 text-cyan-300" />
                <span className="truncate font-mono text-[11px] uppercase tracking-[0.3em] text-cyan-200/90">{app.name}</span>
                {/* 帯の飾りの目盛り */}
                <span className="mx-2 hidden h-px flex-1 bg-[repeating-linear-gradient(90deg,rgba(34,211,238,0.5)_0_2px,transparent_2px_8px)] sm:block" />
                <button onClick={() => update(win.id, { key: win.key + 1 })} className={btn} title="読み込み直す" aria-label="読み込み直す">
                  <ReloadIcon className="h-4 w-4" />
                </button>
                <button onClick={() => openExternal(app)} className={btn} title="Chrome で開く" aria-label="Chrome で開く">
                  <ExternalIcon className="h-4 w-4" />
                </button>
                <button onClick={() => update(win.id, { max: !win.max })} className={btn} title={win.max ? "元の大きさ" : "大きくする"} aria-label="大きさの切り替え">
                  {win.max ? <RestoreIcon className="h-4 w-4" /> : <MaxIcon className="h-4 w-4" />}
                </button>
                <button onClick={() => close(win.id)} className={btn} title="閉じる" aria-label="閉じる">
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
              <iframe
                key={win.key}
                src={app.url}
                title={app.name}
                className={"dimy-fade-in min-h-0 w-full flex-1 bg-white " + (busy || win.closing ? "pointer-events-none" : "")}
                allow="clipboard-read; clipboard-write; fullscreen"
              />
              {/* 開いた瞬間に走る光の線 */}
              {!win.closing && (
                <div className="dimy-scan pointer-events-none absolute inset-x-0 h-16 -translate-y-1/2 bg-gradient-to-b from-transparent via-cyan-300/40 to-transparent" />
              )}
            </div>
            {/* 光る角の印。右下はつかむと大きさを変えられる */}
            {!win.max && (
              <>
                <Bracket corner="tl" className="-left-2 -top-2" />
                <div
                  onPointerDown={(e) => start(e, win, "resize")}
                  onPointerMove={move}
                  onPointerUp={end}
                  title="大きさを変える"
                  className="absolute -bottom-2 -right-2 h-8 w-8 cursor-nwse-resize"
                >
                  <Bracket corner="br" className="bottom-0 right-0" />
                </div>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

/** 左端のショートカット（全アプリのアイコン） */
export function AppDock({ onOpen }: { onOpen: (id: AppId, from?: Point) => void }) {
  return (
    <nav className="absolute left-4 top-1/2 z-[900] flex -translate-y-1/2 flex-col gap-2" aria-label="アプリ">
      {APPS.map((app, i) => (
        <button
          key={app.id}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onOpen(app.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
          }}
          title={`${app.name}（Alt + ${i + 1}）`}
          aria-label={`${app.name} を開く`}
          className="group relative grid h-11 w-11 place-items-center rounded-xl border border-cyan-400/25 bg-slate-950/50 text-cyan-300 backdrop-blur transition hover:border-cyan-300/70 hover:text-cyan-100 hover:shadow-[0_0_18px_rgba(34,211,238,0.35)]"
        >
          <AppIcon id={app.id} className="h-5 w-5" />
        </button>
      ))}
    </nav>
  );
}
