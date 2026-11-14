"use client";

// パレット（固定ウィンドウだけを並べる画面）を、選んだモニターに開くメニュー。
// Chrome / Edge の「ウィンドウの配置」の機能（getScreenDetails）でモニターの一覧と位置を知り、その位置に開く。
// 初めて使うときは、ブラウザが「ウィンドウの管理」の許可を求める。

import { useEffect, useState } from "react";
import { CloseIcon, PaletteIcon } from "@/components/hud/Icons";
import { getScreens, openPalette, type ScreenInfo } from "@/lib/screens";
import { useDismiss } from "@/hooks/useDismiss";

export { openPalette };

export function ScreenPicker({ onClose, className = "" }: { onClose: () => void; className?: string }) {
  const [screens, setScreens] = useState<ScreenInfo[] | null>(null);
  const [current, setCurrent] = useState<ScreenInfo | null>(null);
  const [msg, setMsg] = useState("");
  const ref = useDismiss<HTMLDivElement>(onClose); // 外をクリック・Esc で閉じる
  const supported = typeof window !== "undefined" && "getScreenDetails" in window;

  useEffect(() => {
    if (!supported) return;
    getScreens(true)
      .then((list) => {
        if (!list) throw new Error();
        setScreens(list);
        // この画面があるモニター（ウィンドウの真ん中の点で探す）
        const cx = window.screenX + window.outerWidth / 2;
        const cy = window.screenY + window.outerHeight / 2;
        setCurrent(list.find((s) => cx >= s.availLeft && cx < s.availLeft + s.availWidth && cy >= s.availTop && cy < s.availTop + s.availHeight) ?? null);
      })
      .catch(() => setMsg("モニターの一覧を読めませんでした。アドレス欄の左のアイコンから「ウィンドウの管理」を許可してください。"));
  }, [supported]);

  const open = (n: number, s?: ScreenInfo) => {
    if (!openPalette(n, s)) setMsg("ブラウザに止められました。アドレス欄の右のアイコンから、ポップアップを許可してください。");
    else onClose();
  };

  return (
    <div ref={ref} className={"w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-cyan-400/30 bg-slate-950/95 p-4 text-sm backdrop-blur " + className}>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-xs tracking-[0.3em] text-cyan-300">PALETTE</span>
        <button onClick={onClose} aria-label="閉じる" className="text-cyan-400 hover:text-cyan-100">
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-slate-400">固定ウィンドウだけを並べる画面を、ほかのモニターに開きます。並べ方はモニターごとに覚えておきます。</p>
      {screens && (
        <div className="grid grid-cols-2 gap-2">
          {screens.map((s, i) => {
            const here = current && s.availLeft === current.availLeft && s.availTop === current.availTop;
            return (
              <button
                key={i}
                onClick={() => open(i + 1, s)}
                className="flex flex-col items-start gap-1 rounded border border-cyan-400/30 p-2.5 text-left hover:border-cyan-300/70 hover:bg-cyan-400/10"
              >
                <span className="flex items-center gap-1.5 text-cyan-100">
                  <PaletteIcon className="h-4 w-4 text-cyan-300" />
                  モニター {i + 1}
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  {s.availWidth}×{s.availHeight}
                  {s.isPrimary ? " ・メイン" : ""}
                  {here ? " ・この画面" : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {!supported && (
        <button onClick={() => open(1)} className="w-full rounded border border-cyan-500/50 px-3 py-2 text-cyan-200 hover:bg-cyan-400/10">
          新しいウィンドウで開く（開いたら、置きたいモニターへ動かしてください）
        </button>
      )}
      {msg && <p className="mt-2 text-xs text-rose-300">{msg}</p>}
    </div>
  );
}
