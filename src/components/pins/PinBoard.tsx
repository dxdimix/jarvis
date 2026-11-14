"use client";

// 固定ウィンドウ（ピン）。ディミの画面の好きな場所に、ページや映像を置いておく。
// - Chrome / Edge のアドレス欄の左のアイコンやリンクを、ディミの画面にドラッグして離すと、そのページを置く。
// - 中への表示を禁止しているページや、Chrome / Edge 以外のアプリは「映像で映す」（画面の共有の仕組み。見るだけで操作はできない）。
// - 上の帯をつかんで動かす。四辺と四隅をつかんで、大きさを自由に変える。鍵で位置を固定。
// - 位置と大きさは置き場所（メイン画面 / パレット）ごとに覚えておく（src/lib/pins.ts）。映像は画面を開き直したら選び直す。

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { boardKey, boardLabel, knownBoards, loadPins, newPinId, savePins, sendPin, titleFromUrl, type Pin } from "@/lib/pins";
import { droppedUrl } from "@/lib/frame";
import { Bracket } from "@/components/hud/AppWindows";
import { CaptureIcon, CloseIcon, ExternalIcon, LockIcon, PinIcon, ReloadIcon, SendIcon } from "@/components/hud/Icons";

const MIN_W = 200;
const MIN_H = 120;
const btn = "grid h-6 w-6 place-items-center rounded-sm text-cyan-300/80 transition hover:bg-cyan-400/15 hover:text-cyan-50";

type Dir = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** 同じサイト（dxdimix.com）なら、調べなくても中に表示できる（DIMY と連携する決まりのアプリ） */
function sameSite(url: string) {
  try {
    const site = (h: string) => h.split(".").slice(-2).join(".");
    const own = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "dxdimix.com" : site(location.hostname);
    return site(new URL(url).hostname) === own;
  } catch {
    return false;
  }
}

export function usePinBoard(board: string, session: Session) {
  const [pins, setPins] = useState<Pin[]>([]);
  const [loaded, setLoaded] = useState(false);
  // 映像（画面の共有）。保存はできないので、開いている間だけ持つ
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const streamsRef = useRef(streams);
  useEffect(() => {
    streamsRef.current = streams;
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPins(loadPins(board));
    setLoaded(true);
    // ほかの画面（パレットなど）から送られてきたら読み直す
    const onStorage = (e: StorageEvent) => {
      if (e.key === boardKey(board)) setPins(loadPins(board));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [board]);

  useEffect(() => {
    if (loaded) savePins(board, pins);
  }, [board, pins, loaded]);

  // 閉じるときに映像を止める
  useEffect(() => () => Object.values(streamsRef.current).forEach((s) => s.getTracks().forEach((t) => t.stop())), []);

  const update = useCallback((id: string, patch: Partial<Pin>) => setPins((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p))), []);
  const front = useCallback(
    (id: string) =>
      setPins((prev) => {
        const top = Math.max(0, ...prev.map((p) => p.z));
        return prev.map((p) => (p.id === id && p.z !== top ? { ...p, z: top + 1 } : p));
      }),
    [],
  );

  const stopStream = useCallback((id: string) => {
    streamsRef.current[id]?.getTracks().forEach((t) => t.stop());
    setStreams((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const remove = useCallback(
    (id: string) => {
      stopStream(id);
      setPins((prev) => prev.filter((p) => p.id !== id));
    },
    [stopStream],
  );

  const place = (at?: { x: number; y: number }, w = 640, h = 420) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    w = Math.min(w, vw - 40);
    h = Math.min(h, vh - 40);
    const cx = at?.x ?? vw / 2;
    const cy = at?.y ?? vh / 2;
    return { x: Math.max(0, Math.min(vw - w, cx - w / 2)), y: Math.max(0, Math.min(vh - h, cy - 16)), w, h };
  };

  // 中に表示できるページかを調べる（できなければ、映像で映すように案内する）
  const checkFrame = useCallback(
    async (id: string, url: string) => {
      if (sameSite(url)) return;
      try {
        const host = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "dimy.dxdimix.com" : location.hostname;
        const res = await fetch(`/api/frame-check?url=${encodeURIComponent(url)}&host=${encodeURIComponent(host)}`, {
          headers: { authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const { allowed } = (await res.json()) as { allowed: boolean };
        if (!allowed) update(id, { blocked: true });
      } catch {}
    },
    [session.access_token, update],
  );

  const addWeb = useCallback(
    (url: string, at?: { x: number; y: number }, title?: string) => {
      const id = newPinId();
      setPins((prev) => {
        const z = Math.max(10, ...prev.map((p) => p.z)) + 1;
        return [...prev, { id, kind: "web", url, title: title ?? titleFromUrl(url), z, ...place(at) }];
      });
      checkFrame(id, url);
    },
    [checkFrame],
  );

  /** 映像で映す。replaceId を渡すと、そのウィンドウの場所で映す（選び直し・ページからの切り替え） */
  const addCapture = useCallback(
    async (at?: { x: number; y: number }, replaceId?: string): Promise<string | null> => {
      if (!navigator.mediaDevices?.getDisplayMedia) return "このブラウザは画面を映す機能に対応していません。";
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "window" },
          audio: false,
          // ディミ自身のタブは選べないようにする（Chrome）
          selfBrowserSurface: "exclude",
        } as DisplayMediaStreamOptions);
      } catch {
        return null; // 選ぶのをやめた
      }
      const track = stream.getVideoTracks()[0];
      const title = track?.label || "映像";
      const id = replaceId ?? newPinId();
      track?.addEventListener("ended", () =>
        setStreams((prev) => {
          if (prev[id] !== stream) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        }),
      );
      streamsRef.current[id]?.getTracks().forEach((t) => t.stop());
      setStreams((prev) => ({ ...prev, [id]: stream }));
      setPins((prev) => {
        const z = Math.max(10, ...prev.map((p) => p.z)) + 1;
        if (replaceId) return prev.map((p) => (p.id === replaceId ? { ...p, kind: "capture", title, blocked: false, z } : p));
        const s = track?.getSettings();
        const ratio = s?.width && s?.height ? s.width / s.height : 16 / 10;
        return [...prev, { id, kind: "capture", title, z, ...place(at, 640, Math.round(640 / ratio) + 32) }];
      });
      return null;
    },
    [],
  );

  const send = useCallback(
    (id: string, to: string) => {
      const pin = pins.find((p) => p.id === id);
      if (!pin || pin.kind !== "web") return;
      sendPin(pin, to);
      setPins((prev) => prev.filter((p) => p.id !== id));
    },
    [pins],
  );

  return { board, pins, streams, update, front, remove, addWeb, addCapture, send };
}

export type PinBoardState = ReturnType<typeof usePinBoard>;

/** ドラッグで落とされた URL を受け取る。ドラッグ中は「ここに離すと固定」を出す */
export function usePinDrop(onUrl: (url: string, at: { x: number; y: number }) => void) {
  const [dragging, setDragging] = useState(false);
  const cb = useRef(onUrl);
  useEffect(() => {
    cb.current = onUrl;
  });
  useEffect(() => {
    let depth = 0;
    const accepts = (e: DragEvent) => {
      const types = Array.from(e.dataTransfer?.types ?? []);
      return types.includes("text/uri-list") || types.includes("text/plain");
    };
    const enter = (e: DragEvent) => {
      if (!accepts(e)) return;
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "link";
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!e.dataTransfer) return;
      const url = droppedUrl((t) => e.dataTransfer!.getData(t));
      if (!url) return;
      e.preventDefault();
      cb.current(url, { x: e.clientX, y: e.clientY });
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);
  return dragging;
}

/** ドラッグ中に出す案内 */
export function DropOverlay({ show }: { show: boolean }) {
  return (
    <div
      className={
        "pointer-events-none fixed inset-4 z-[980] grid place-items-center rounded-xl border-2 border-dashed border-cyan-300/70 bg-cyan-400/5 transition-opacity " +
        (show ? "opacity-100" : "opacity-0")
      }
    >
      <div className="flex items-center gap-3 font-mono text-sm tracking-[0.3em] text-cyan-200">
        <PinIcon className="h-6 w-6" />
        DROP TO PIN
      </div>
    </div>
  );
}

function Video({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay muted playsInline className="h-full w-full bg-black object-contain" />;
}

export function PinBoard({ state, className = "" }: { state: PinBoardState; className?: string }) {
  const { pins, streams, update, front, remove, addCapture, send, board } = state;
  const action = useRef<{ id: string; dir: Dir; sx: number; sy: number; o: { x: number; y: number; w: number; h: number } } | null>(null);
  const [busy, setBusy] = useState(false); // 動かしている間は、中のページがマウスを横取りしないようにする
  const [sendMenu, setSendMenu] = useState<string | null>(null);

  function start(e: React.PointerEvent, pin: Pin, dir: Dir) {
    if (pin.locked || (e.target as HTMLElement).closest("button")) return;
    e.stopPropagation();
    action.current = { id: pin.id, dir, sx: e.clientX, sy: e.clientY, o: { x: pin.x, y: pin.y, w: pin.w, h: pin.h } };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setBusy(true);
    front(pin.id);
  }
  function move(e: React.PointerEvent) {
    const a = action.current;
    if (!a) return;
    const dx = e.clientX - a.sx;
    const dy = e.clientY - a.sy;
    const { o } = a;
    if (a.dir === "move") return update(a.id, { x: Math.max(-o.w + 80, o.x + dx), y: Math.max(0, o.y + dy) });
    let { x, y, w, h } = o;
    if (a.dir.includes("e")) w = Math.max(MIN_W, o.w + dx);
    if (a.dir.includes("s")) h = Math.max(MIN_H, o.h + dy);
    if (a.dir.includes("w")) {
      w = Math.max(MIN_W, o.w - dx);
      x = o.x + (o.w - w);
    }
    if (a.dir.includes("n")) {
      h = Math.max(MIN_H, o.h - dy);
      y = Math.max(0, o.y + (o.h - h));
    }
    update(a.id, { x, y, w, h });
  }
  function end() {
    action.current = null;
    setBusy(false);
  }

  const edge = (pin: Pin, dir: Dir, cls: string) =>
    !pin.locked && <div onPointerDown={(e) => start(e, pin, dir)} onPointerMove={move} onPointerUp={end} className={"absolute " + cls} />;

  return (
    <div className={"pointer-events-none fixed inset-0 " + className}>
      {pins.map((pin) => {
        const stream = streams[pin.id];
        return (
          <div
            key={pin.id}
            style={{ left: pin.x, top: pin.y, width: pin.w, height: pin.h, zIndex: pin.z }}
            onPointerDown={() => front(pin.id)}
            className="dimy-win-in pointer-events-auto absolute drop-shadow-[0_0_18px_rgba(34,211,238,0.22)]"
          >
            <div className="dimy-cut absolute inset-0 bg-gradient-to-br from-cyan-300/70 via-cyan-500/25 to-cyan-300/60" />
            <div className="dimy-cut absolute inset-px flex flex-col overflow-hidden bg-slate-950/95">
              {/* 上の帯 */}
              <div
                onPointerDown={(e) => start(e, pin, "move")}
                onPointerMove={move}
                onPointerUp={end}
                className={
                  "relative flex h-8 shrink-0 select-none items-center gap-1.5 border-b border-cyan-400/25 bg-gradient-to-r from-cyan-500/15 via-transparent to-transparent pl-2.5 pr-5 " +
                  (pin.locked ? "" : "cursor-move")
                }
              >
                {pin.kind === "capture" ? <CaptureIcon className="h-3.5 w-3.5 shrink-0 text-cyan-300" /> : <PinIcon className="h-3.5 w-3.5 shrink-0 text-cyan-300" />}
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[0.15em] text-cyan-200/90" title={pin.url ?? pin.title}>
                  {pin.title}
                </span>
                <button onClick={() => update(pin.id, { locked: !pin.locked })} className={btn} title={pin.locked ? "固定を外す" : "位置と大きさを固定"} aria-label="固定の切り替え">
                  <LockIcon className={"h-3.5 w-3.5 " + (pin.locked ? "text-cyan-100" : "")} open={!pin.locked} />
                </button>
                {pin.kind === "web" && (
                  <>
                    <button onClick={() => update(pin.id, { rev: (pin.rev ?? 0) + 1 })} className={btn} title="読み込み直す" aria-label="読み込み直す">
                      <ReloadIcon className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => window.open(pin.url, "_blank", "noopener")} className={btn} title="Chrome で開く" aria-label="Chrome で開く">
                      <ExternalIcon className="h-3.5 w-3.5" />
                    </button>
                    <span className="relative">
                      <button onClick={() => setSendMenu(sendMenu === pin.id ? null : pin.id)} className={btn} title="別の画面へ送る" aria-label="別の画面へ送る">
                        <SendIcon className="h-3.5 w-3.5" />
                      </button>
                      {sendMenu === pin.id && (
                        <div className="absolute right-0 top-7 z-10 w-40 rounded border border-cyan-400/40 bg-slate-950/95 py-1 text-xs shadow-lg">
                          {knownBoards()
                            .filter((b) => b !== board)
                            .map((b) => (
                              <button
                                key={b}
                                onClick={() => {
                                  setSendMenu(null);
                                  send(pin.id, b);
                                }}
                                className="block w-full px-3 py-1.5 text-left text-cyan-100 hover:bg-cyan-400/10"
                              >
                                {boardLabel(b)} へ
                              </button>
                            ))}
                        </div>
                      )}
                    </span>
                  </>
                )}
                <button onClick={() => remove(pin.id)} className={btn} title="外す" aria-label="外す">
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* 中身 */}
              <div className="relative min-h-0 flex-1">
                {pin.kind === "web" && !pin.blocked && (
                  <iframe
                    key={`${pin.url}#${pin.rev ?? 0}`}
                    src={pin.url}
                    title={pin.title}
                    className={"h-full w-full bg-white " + (busy ? "pointer-events-none" : "")}
                    allow="clipboard-read; clipboard-write; fullscreen"
                  />
                )}
                {pin.kind === "web" && pin.blocked && (
                  <div className="grid h-full place-items-center p-4 text-center text-xs text-slate-300">
                    <div className="space-y-3">
                      <p>このページは、ほかの画面の中に表示することを禁止しています。</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <button onClick={() => addCapture(undefined, pin.id)} className="rounded border border-cyan-500/50 px-3 py-1.5 text-cyan-200 hover:bg-cyan-400/10">
                          映像で映す
                        </button>
                        <button onClick={() => window.open(pin.url, "_blank", "noopener")} className="rounded border border-slate-600 px-3 py-1.5 hover:bg-slate-800">
                          Chrome で開く
                        </button>
                      </div>
                      <p className="text-slate-500">映像で映すと、見ることはできますが、ここでは操作できません。</p>
                    </div>
                  </div>
                )}
                {pin.kind === "capture" &&
                  (stream ? (
                    <Video stream={stream} />
                  ) : (
                    <div className="grid h-full place-items-center p-4 text-center text-xs text-slate-300">
                      <div className="space-y-3">
                        <p>映していたウィンドウを、選び直してください。</p>
                        <button onClick={() => addCapture(undefined, pin.id)} className="rounded border border-cyan-500/50 px-3 py-1.5 text-cyan-200 hover:bg-cyan-400/10">
                          選び直す
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* 四辺と四隅: つかんで大きさを変える */}
            {edge(pin, "n", "-top-1 left-3 right-3 h-2 cursor-ns-resize")}
            {edge(pin, "s", "-bottom-1 left-3 right-3 h-2 cursor-ns-resize")}
            {edge(pin, "w", "-left-1 top-3 bottom-3 w-2 cursor-ew-resize")}
            {edge(pin, "e", "-right-1 top-3 bottom-3 w-2 cursor-ew-resize")}
            {edge(pin, "nw", "-left-1.5 -top-1.5 h-4 w-4 cursor-nwse-resize")}
            {edge(pin, "ne", "-right-1.5 -top-1.5 h-4 w-4 cursor-nesw-resize")}
            {edge(pin, "sw", "-bottom-1.5 -left-1.5 h-4 w-4 cursor-nesw-resize")}
            {edge(pin, "se", "-bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize")}
            <Bracket corner="tl" className={"-left-1.5 -top-1.5 h-5 w-5 " + (pin.locked ? "opacity-40" : "")} />
            <Bracket corner="br" className={"-bottom-1.5 -right-1.5 h-5 w-5 " + (pin.locked ? "opacity-40" : "")} />
          </div>
        );
      })}
    </div>
  );
}
