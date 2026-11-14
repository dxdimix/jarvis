"use client";

// 固定ウィンドウ（ピン）。ディミの画面の好きな場所に、ページや映像を置いておく。
// - Chrome / Edge のアドレス欄の左のアイコンやリンクを、ディミの画面にドラッグして離すと、そのページを置く。
// - 中への表示を禁止しているページや、Chrome / Edge 以外のアプリは「映像で映す」（画面の共有の仕組み。見るだけで操作はできない）。
// - 上の帯をつかんで動かす。四辺と四隅をつかんで、大きさを自由に変える。鍵で位置を固定。
// - 位置と大きさは置き場所（メイン画面 / パレット）ごとに覚えておく（src/lib/pins.ts）。映像は画面を開き直したら選び直す。

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  boardKey,
  boardLabel,
  DEFAULT_VIEW,
  knownBoards,
  loadPins,
  loadView,
  newPinId,
  savePins,
  saveView,
  sendPin,
  slotAt,
  titleFromUrl,
  wheelZoom,
  zoomAt,
  type BoardView,
  type Pin,
  type Rect,
} from "@/lib/pins";
import { droppedUrl } from "@/lib/frame";
import { Bracket } from "@/components/hud/AppWindows";
import { CaptureIcon, CloseIcon, ExternalIcon, LockIcon, PinIcon, ReloadIcon, SendIcon } from "@/components/hud/Icons";

const MIN_W = 200;
const MIN_H = 120;
const btn = "grid h-6 w-6 place-items-center rounded-sm text-cyan-300/80 transition hover:bg-cyan-400/15 hover:text-cyan-50";

// この画面の表示部分の左上の、モニター上の座標。マウスが動くたびに正確な値に直す
const viewportOrigin = { x: 0, y: 0 };
if (typeof window !== "undefined") {
  viewportOrigin.x = window.screenX + (window.outerWidth - window.innerWidth) / 2;
  viewportOrigin.y = window.screenY + (window.outerHeight - window.innerHeight);
  window.addEventListener("pointermove", (e) => {
    viewportOrigin.x = e.screenX - e.clientX;
    viewportOrigin.y = e.screenY - e.clientY;
  });
}

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
  // 置き場所全体の縮尺と位置（パレットだけで使う。メイン画面はいつも 100%）
  const [view, setViewRaw] = useState<BoardView>(DEFAULT_VIEW);
  const viewRef = useRef(view);
  const setView = useCallback(
    (v: BoardView) => {
      viewRef.current = v;
      setViewRaw(v);
      saveView(board, v);
    },
    [board],
  );
  // 映像（画面の共有）。保存はできないので、開いている間だけ持つ
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const streamsRef = useRef(streams);
  useEffect(() => {
    streamsRef.current = streams;
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPins(loadPins(board));
    const v = loadView(board);
    viewRef.current = v;
    setViewRaw(v);
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

  // 画面分割の枠（画面の座標）。枠があるときは、新しく来たウィンドウを空いている枠にぴったり入れる
  const slotsRef = useRef<Rect[]>([]);
  const setSlots = useCallback((slots: Rect[]) => {
    slotsRef.current = slots;
  }, []);
  /** 画面の座標の枠を、置き場所の座標（縮尺と位置を戻したもの）にする */
  const toBoard = useCallback((r: Rect) => {
    const v = viewRef.current;
    return { x: (r.x - v.x) / v.z, y: (r.y - v.y) / v.z, w: r.w / v.z, h: r.h / v.z };
  }, []);
  /** 空いている枠（どのウィンドウも入っていない枠）。なければ最後の枠 */
  const freeSlot = useCallback((list: Pin[], exceptId?: string): Rect | null => {
    const slots = slotsRef.current;
    if (!slots.length) return null;
    const near = (a: number, b: number) => Math.abs(a - b) < 2;
    for (const r of slots) {
      const b = toBoard(r);
      if (!list.some((p) => p.id !== exceptId && near(p.x, b.x) && near(p.y, b.y))) return b;
    }
    return toBoard(slots[slots.length - 1]);
  }, [toBoard]);

  // 画面の座標（at）を、置き場所の座標（縮尺と位置を戻したもの）にして、置く場所と大きさを決める
  const place = (at?: { x: number; y: number }, w = 640, h = 420) => {
    const v = viewRef.current;
    const vw = window.innerWidth / v.z;
    const vh = window.innerHeight / v.z;
    const left = -v.x / v.z;
    const top = -v.y / v.z;
    w = Math.min(w, vw - 40);
    h = Math.min(h, vh - 40);
    const cx = at ? (at.x - v.x) / v.z : left + vw / 2;
    const cy = at ? (at.y - v.y) / v.z : top + vh / 2;
    return { x: Math.max(left, Math.min(left + vw - w, cx - w / 2)), y: Math.max(top, Math.min(top + vh - h, cy - 16)), w, h };
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
        return [...prev, { id, kind: "web", url, title: title ?? titleFromUrl(url), z, ...(freeSlot(prev) ?? place(at)) }];
      });
      checkFrame(id, url);
    },
    [checkFrame, freeSlot],
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

  /** 保存から読み直す（ほかの置き場所から、この画面で送り込んだとき） */
  const reload = useCallback(() => setPins(loadPins(board)), [board]);

  // ほかのディミの画面（パレットなど）との間で、ウィンドウをドラッグで移す（同じブラウザの中だけ）
  // - 開いている画面は 1 秒ごとに、自分の画面の位置（モニター上の座標）を知らせ合う
  // - ドラッグして自分の画面の外で離したら、その場所にある画面へ送る
  const others = useRef(new Map<string, { x: number; y: number; w: number; h: number; at: number }>());
  const chanRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("dimy-boards");
    chanRef.current = ch;
    const here = () =>
      ch.postMessage({ type: "here", board, rect: { x: viewportOrigin.x, y: viewportOrigin.y, w: window.innerWidth, h: window.innerHeight } });
    ch.onmessage = (ev) => {
      const m = ev.data;
      if (m?.type === "here" && m.board !== board) others.current.set(m.board, { ...m.rect, at: Date.now() });
      if (m?.type === "drop" && m.to === board) {
        const v = viewRef.current;
        const pin = m.pin as Pin;
        const x = (m.clientX - v.x) / v.z - m.grab.x / v.z;
        const y = (m.clientY - v.y) / v.z - m.grab.y / v.z;
        setPins((prev) => {
          const z = Math.max(10, ...prev.map((p) => p.z)) + 1;
          // 画面分割のときは、離した場所の枠（なければ空いている枠）にぴったり入れる
          const slots = slotsRef.current;
          const i = slotAt(slots, m.clientX, m.clientY);
          const slot = i >= 0 ? toBoard(slots[i]) : freeSlot(prev, pin.id);
          const placed = slot ? { ...pin, ...slot, z } : { ...pin, x, y: Math.max(0, y), z };
          return [...prev.filter((p) => p.id !== pin.id), placed];
        });
        if (pin.kind === "web" && pin.url) checkFrame(pin.id, pin.url);
      }
    };
    here();
    const t = setInterval(here, 1000);
    return () => {
      clearInterval(t);
      ch.close();
      chanRef.current = null;
    };
  }, [board, checkFrame, toBoard, freeSlot]);

  /** モニター上の点（screenX, screenY）にある、ほかのディミの画面へ送る。送れたら true */
  const dropTo = useCallback(
    (pin: Pin, screenX: number, screenY: number, grab: { x: number; y: number }) => {
      if (pin.kind !== "web") return false;
      for (const [b, r] of others.current) {
        if (Date.now() - r.at > 3000) continue;
        if (screenX >= r.x && screenX < r.x + r.w && screenY >= r.y && screenY < r.y + r.h) {
          chanRef.current?.postMessage({ type: "drop", to: b, pin, clientX: screenX - r.x, clientY: screenY - r.y, grab });
          setPins((prev) => prev.filter((p) => p.id !== pin.id));
          return true;
        }
      }
      return false;
    },
    [],
  );

  return { board, pins, streams, update, front, remove, addWeb, addCapture, send, view, setView, reload, dropTo, setSlots, toBoard };
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

/**
 * zoomable: 置き場所全体の縮尺を変えられる（パレット）。Ctrl + ホイールで縮尺、背景のドラッグで動かす（背景のドラッグは Palette.tsx）。
 * どの置き場所でも、ウィンドウの上で Ctrl + ホイールをすると、そのウィンドウの中身の縮尺だけが変わる。
 */
export function PinBoard({
  state,
  className = "",
  zoomable = false,
  slots = [],
}: {
  state: PinBoardState;
  className?: string;
  zoomable?: boolean;
  /** 画面分割の枠（画面の座標）。ドラッグして離すと、その枠いっぱいの大きさになる */
  slots?: Rect[];
}) {
  const { pins, streams, update, front, remove, addCapture, send, board, view, setView, dropTo, toBoard } = state;
  const [hoverSlot, setHoverSlot] = useState(-1);
  const v = zoomable ? view : DEFAULT_VIEW;

  // Ctrl を押している間は、ページの上に透明な板を置いて、ホイールをディミが受け取る
  // （ページの中（iframe）にホイールが届くと、ブラウザが画面全体を拡大してしまうため）
  const [ctrl, setCtrl] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => e.key === "Control" && setCtrl(true);
    const up = (e: KeyboardEvent) => e.key === "Control" && setCtrl(false);
    const off = () => setCtrl(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", off);
    };
  }, []);

  // Ctrl + ホイール: ウィンドウの上ならその中身、パレットの背景なら全体の縮尺を変える
  const latest = useRef({ pins, view, zoomable, update, setView });
  useEffect(() => {
    latest.current = { pins, view, zoomable, update, setView };
  });
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      const L = latest.current;
      const target = e.target as Element | null;
      const el = target?.closest?.("[data-pin-id]") as HTMLElement | null;
      if (el) {
        const pin = L.pins.find((p) => p.id === el.dataset.pinId);
        if (!pin) return;
        e.preventDefault();
        const z = wheelZoom(pin.zoom ?? 1, e.deltaY);
        const patch: Partial<Pin> = { zoom: z };
        // 映像はカーソルの位置を中心に拡大する
        const content = el.querySelector("[data-pin-content]");
        if (pin.kind === "capture" && content && (pin.zoom ?? 1) <= 1.001) {
          const r = content.getBoundingClientRect();
          patch.zoomOrigin = { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
        }
        L.update(pin.id, patch);
        return;
      }
      if (!L.zoomable) return; // メイン画面の背景では、ブラウザのいつもの動き
      if (target?.closest?.("nav, [role=dialog], [data-no-board-zoom]")) return;
      e.preventDefault();
      L.setView(zoomAt(L.view, wheelZoom(L.view.z, e.deltaY), e.clientX, e.clientY));
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);
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
    // 置き場所の縮尺を変えているときは、マウスの動きをその縮尺で割る
    const dx = (e.clientX - a.sx) / v.z;
    const dy = (e.clientY - a.sy) / v.z;
    const { o } = a;
    if (a.dir === "move") {
      if (slots.length) setHoverSlot(slotAt(slots, e.clientX, e.clientY));
      return update(a.id, { x: o.x + dx, y: o.y + dy });
    }
    let { x, y, w, h } = o;
    if (a.dir.includes("e")) w = Math.max(MIN_W, o.w + dx);
    if (a.dir.includes("s")) h = Math.max(MIN_H, o.h + dy);
    if (a.dir.includes("w")) {
      w = Math.max(MIN_W, o.w - dx);
      x = o.x + (o.w - w);
    }
    if (a.dir.includes("n")) {
      h = Math.max(MIN_H, o.h - dy);
      y = o.y + (o.h - h);
    }
    update(a.id, { x, y, w, h });
  }
  function end(e: React.PointerEvent) {
    const a = action.current;
    action.current = null;
    setBusy(false);
    setHoverSlot(-1);
    if (!a || a.dir !== "move") return;
    const pin = pins.find((p) => p.id === a.id);
    if (!pin) return;
    // 画面分割のとき: 離した枠いっぱいの大きさにする
    const si = slotAt(slots, e.clientX, e.clientY);
    if (si >= 0) return update(a.id, toBoard(slots[si]));
    const outside = e.clientX < 0 || e.clientY < 0 || e.clientX > window.innerWidth || e.clientY > window.innerHeight;
    if (outside) {
      // 画面の外で離した: そこにあるディミの画面（パレットなど）へ送る。なければ元の場所に戻す
      const grab = { x: (a.sx - (a.o.x * v.z + v.x)), y: (a.sy - (a.o.y * v.z + v.y)) };
      if (!dropTo(pin, e.screenX, e.screenY, grab)) update(a.id, { x: a.o.x, y: a.o.y });
      return;
    }
    // 帯が画面の上にはみ出したら戻す（つかめなくなるため）
    if (pin.y * v.z + v.y < 0) update(a.id, { y: -v.y / v.z });
  }

  const edge = (pin: Pin, dir: Dir, cls: string) =>
    !pin.locked && <div onPointerDown={(e) => start(e, pin, dir)} onPointerMove={move} onPointerUp={end} className={"absolute " + cls} />;

  return (
    <div className={"pointer-events-none fixed inset-0 overflow-hidden " + className}>
      {/* 画面分割の枠 */}
      {slots.map((r, i) => (
        <div
          key={i}
          style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
          className={
            "absolute rounded-sm border transition-colors " +
            (hoverSlot === i ? "border-cyan-200/90 bg-cyan-300/10 shadow-[inset_0_0_30px_rgba(34,211,238,0.25)]" : "border-dashed border-cyan-400/30")
          }
        />
      ))}
      <div className="absolute left-0 top-0" style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.z})`, transformOrigin: "0 0" }}>
      {pins.map((pin) => {
        const stream = streams[pin.id];
        const zoom = pin.zoom ?? 1;
        return (
          <div
            key={pin.id}
            data-pin-id={pin.id}
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
                {zoom !== 1 && (
                  <button
                    onClick={() => update(pin.id, { zoom: 1, zoomOrigin: undefined })}
                    className="rounded-sm px-1 font-mono text-[10px] text-cyan-200 hover:bg-cyan-400/15"
                    title="中身の縮尺を 100% に戻す"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                )}
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
              <div data-pin-content className="relative min-h-0 flex-1 overflow-hidden">
                {pin.kind === "web" && !pin.blocked && (
                  <iframe
                    key={`${pin.url}#${pin.rev ?? 0}`}
                    src={pin.url}
                    title={pin.title}
                    // 中身の縮尺: 大きさを縮尺で割ったページを、縮尺の分だけ拡大・縮小して見せる
                    style={{ width: `${100 / zoom}%`, height: `${100 / zoom}%`, transform: `scale(${zoom})`, transformOrigin: "0 0" }}
                    className={"block bg-white " + (busy ? "pointer-events-none" : "")}
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
                    <div
                      className="h-full w-full transition-transform duration-75"
                      style={{ transform: `scale(${Math.max(1, zoom)})`, transformOrigin: `${pin.zoomOrigin?.x ?? 50}% ${pin.zoomOrigin?.y ?? 50}%` }}
                    >
                      <Video stream={stream} />
                    </div>
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
                {/* Ctrl を押している間だけ、ホイールを受け取る透明な板 */}
                {ctrl && <div className="absolute inset-0 z-10 cursor-zoom-in" />}
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
    </div>
  );
}

/** パレットの縮尺の表示と、100% に戻すボタン */
export function BoardZoomBadge({ state }: { state: PinBoardState }) {
  const { view, setView } = state;
  if (view.z === 1 && view.x === 0 && view.y === 0) return null;
  return (
    <button
      onClick={() => setView(DEFAULT_VIEW)}
      className="h-10 rounded-full border border-cyan-400/25 bg-slate-950/60 px-3 font-mono text-xs text-cyan-200 backdrop-blur hover:border-cyan-300/70"
      title="縮尺と位置を元に戻す"
    >
      {Math.round(view.z * 100)}%
    </button>
  );
}
