"use client";

// ディミの画面の中に浮かぶ、アプリの小窓（いくつでも開ける）。
// - 上の帯をつかんで動かす。右下の角で大きさを変える。
// - ボタン: 読み込み直す / Chrome（別のタブ）で開く / 大きくする・戻す / 閉じる
// - 中で開けないアプリ（apps.ts の canEmbed が false）は、小さな別ウィンドウで開く。

import { useCallback, useRef, useState } from "react";
import { APPS, canEmbed, type AppEntry, type AppId } from "@/lib/apps";
import { AppIcon, CloseIcon, ExternalIcon, MaxIcon, ReloadIcon, RestoreIcon } from "./Icons";

type Win = { id: AppId; x: number; y: number; w: number; h: number; z: number; max: boolean; key: number };

const btn = "grid h-7 w-7 place-items-center rounded text-cyan-300/80 hover:bg-cyan-400/10 hover:text-cyan-100";

/** 小さな別ウィンドウで開く（中で開けないアプリ用） */
export function openPopup(app: AppEntry): boolean {
  const w = Math.min(1280, window.screen.availWidth - 80);
  const h = Math.min(860, window.screen.availHeight - 80);
  const left = Math.max(0, (window.screen.availWidth - w) / 2);
  const top = Math.max(0, (window.screen.availHeight - h) / 2);
  // 声で開いたときなど、ブラウザが別ウィンドウを止めることがある（そのときは false）
  return window.open(app.url, `dimy-${app.id}`, `popup=yes,width=${w},height=${h},left=${left},top=${top}`) !== null;
}

/** Chrome（いつものブラウザの別のタブ）で開く */
export function openExternal(app: AppEntry) {
  window.open(app.url, "_blank", "noopener");
}

export function useAppWindows() {
  const [wins, setWins] = useState<Win[]>([]);
  const zTopRef = useRef(20);

  /** 開けたら true（別ウィンドウをブラウザに止められたら false） */
  const open = useCallback((id: AppId): boolean => {
    const app = APPS.find((a) => a.id === id);
    if (!app) return false;
    // 開発中（localhost）は、本番（dimy.dxdimix.com）と同じ判定にする
    const host = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) ? "dimy.dxdimix.com" : window.location.hostname;
    if (!canEmbed(app, host)) return openPopup(app);
    setWins((prev) => {
      const z = ++zTopRef.current;
      const found = prev.find((w) => w.id === id);
      if (found) return prev.map((w) => (w.id === id ? { ...w, z } : w)); // 開いていれば前に出す
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const small = vw < 768;
      const w = small ? vw : Math.min(1100, vw * 0.62);
      const h = small ? vh : Math.min(760, vh * 0.75);
      const n = prev.length;
      return [...prev, { id, x: small ? 0 : (vw - w) / 2 + n * 28, y: small ? 0 : (vh - h) / 2 + n * 28, w, h, z, max: small, key: 0 }];
    });
    return true;
  }, []);

  return { wins, setWins, open, zTopRef };
}

export function AppWindows({ state }: { state: ReturnType<typeof useAppWindows> }) {
  const { wins, setWins, zTopRef } = state;
  const drag = useRef<{ id: AppId; dx: number; dy: number } | null>(null);
  // 動かしている間は、小窓の中（iframe）がマウスを横取りしないようにする
  const [dragging, setDragging] = useState(false);

  const update = (id: AppId, patch: Partial<Win>) => setWins((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const front = (id: AppId) => update(id, { z: ++zTopRef.current });

  function onDown(e: React.PointerEvent, win: Win) {
    if (win.max || (e.target as HTMLElement).closest("button")) return;
    drag.current = { id: win.id, dx: e.clientX - win.x, dy: e.clientY - win.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    front(win.id);
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    update(d.id, { x: Math.max(-200, e.clientX - d.dx), y: Math.max(0, e.clientY - d.dy) });
  }
  function onUp() {
    drag.current = null;
    setDragging(false);
  }

  return (
    <>
      {wins.map((win) => {
        const app = APPS.find((a) => a.id === win.id)!;
        const style = win.max
          ? { left: 0, top: 0, width: "100vw", height: "100dvh", zIndex: win.z }
          : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };
        return (
          <div
            key={win.id}
            style={style}
            onPointerDown={() => front(win.id)}
            className={
              "fixed flex flex-col overflow-hidden border border-cyan-400/40 bg-slate-950/95 shadow-[0_0_40px_rgba(34,211,238,0.18)] backdrop-blur " +
              (win.max ? "" : "resize rounded-lg")
            }
          >
            <div
              onPointerDown={(e) => onDown(e, win)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onDoubleClick={() => update(win.id, { max: !win.max })}
              className={"flex h-9 shrink-0 select-none items-center gap-2 border-b border-cyan-400/25 px-2 " + (win.max ? "" : "cursor-move")}
            >
              <AppIcon id={app.id} className="h-4 w-4 text-cyan-300" />
              <span className="flex-1 truncate font-mono text-xs tracking-[0.2em] text-cyan-300/80">{app.name}</span>
              <button onClick={() => update(win.id, { key: win.key + 1 })} className={btn} title="読み込み直す" aria-label="読み込み直す">
                <ReloadIcon className="h-4 w-4" />
              </button>
              <button onClick={() => openExternal(app)} className={btn} title="Chrome で開く" aria-label="Chrome で開く">
                <ExternalIcon className="h-4 w-4" />
              </button>
              <button onClick={() => update(win.id, { max: !win.max })} className={btn} title={win.max ? "元の大きさ" : "大きくする"} aria-label="大きさの切り替え">
                {win.max ? <RestoreIcon className="h-4 w-4" /> : <MaxIcon className="h-4 w-4" />}
              </button>
              <button onClick={() => setWins((prev) => prev.filter((w) => w.id !== win.id))} className={btn} title="閉じる" aria-label="閉じる">
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <iframe
              key={win.key}
              src={app.url}
              title={app.name}
              className={"min-h-0 w-full flex-1 bg-white " + (dragging ? "pointer-events-none" : "")}
              allow="clipboard-read; clipboard-write; fullscreen"
            />
          </div>
        );
      })}
    </>
  );
}

/** 左端のショートカット（全アプリのアイコン） */
export function AppDock({ onOpen }: { onOpen: (id: AppId) => void }) {
  return (
    <nav className="absolute left-4 top-1/2 z-[900] flex -translate-y-1/2 flex-col gap-2" aria-label="アプリ">
      {APPS.map((app, i) => (
        <button
          key={app.id}
          onClick={() => onOpen(app.id)}
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
