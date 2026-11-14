"use client";

// 固定ウィンドウを足すメニュー（URL を入れる / 画面を映す / アプリから選ぶ）。ドラッグで置く方法も案内する。

import { useState } from "react";
import { APPS, canEmbed } from "@/lib/apps";
import { toUrl } from "@/lib/frame";
import { AppIcon, CaptureIcon, CloseIcon } from "@/components/hud/Icons";
import type { PinBoardState } from "./PinBoard";
import { useDismiss } from "@/hooks/useDismiss";

export function PinAdd({ state, onClose, className = "" }: { state: PinBoardState; onClose: () => void; className?: string }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const ref = useDismiss<HTMLDivElement>(onClose); // 外をクリック・Esc で閉じる
  const host = typeof location !== "undefined" && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? location.hostname : "dimy.dxdimix.com";

  return (
    <div ref={ref} className={"w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-cyan-400/30 bg-slate-950/95 p-4 text-sm backdrop-blur " + className}>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-xs tracking-[0.3em] text-cyan-300">PIN</span>
        <button onClick={onClose} aria-label="閉じる" className="text-cyan-400 hover:text-cyan-100">
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const url = toUrl(text);
          if (!url) return setMsg("URL の形になっていません。");
          state.addWeb(url);
          setText("");
          onClose();
        }}
        className="flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ページの URL"
          className="min-w-0 flex-1 rounded border border-cyan-700/60 bg-slate-900 px-2 py-1.5"
        />
        <button className="rounded bg-cyan-700 px-3 text-white">置く</button>
      </form>
      {msg && <p className="mt-1 text-xs text-rose-300">{msg}</p>}

      <button
        onClick={async () => {
          const err = await state.addCapture();
          if (err) setMsg(err);
          else onClose();
        }}
        className="mt-3 flex w-full items-center gap-2 rounded border border-cyan-500/40 px-3 py-2 text-left text-cyan-100 hover:bg-cyan-400/10"
      >
        <CaptureIcon className="h-5 w-5 text-cyan-300" />
        ほかのアプリの画面を映す（見るだけ）
      </button>

      <div className="mt-3 grid grid-cols-6 gap-1.5">
        {APPS.filter((a) => canEmbed(a, host)).map((a) => (
          <button
            key={a.id}
            onClick={() => {
              state.addWeb(a.url, undefined, a.name);
              onClose();
            }}
            title={a.name}
            aria-label={`${a.name} を置く`}
            className="grid h-10 place-items-center rounded border border-cyan-400/25 text-cyan-300 hover:border-cyan-300/70 hover:text-cyan-100"
          >
            <AppIcon id={a.id} className="h-5 w-5" />
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        Chrome / Edge で開いているページは、アドレス欄の左端のアイコンをつかんで、この画面にドラッグして離しても置けます。
      </p>
    </div>
  );
}
