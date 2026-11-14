"use client";

// 開いた小さな画面（カレンダー・天気・ブックマークなど）を、外をクリックしたとき・Esc を押したときに閉じる。
// 開くボタン自身（data-panel-toggle を付けたもの）を押したときは閉じない（ボタンの方で開け閉めするため）。

import { useEffect, useRef } from "react";

export function useDismiss<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const cb = useRef(onClose);
  useEffect(() => {
    cb.current = onClose;
  });
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || ref.current?.contains(t) || t.closest("[data-panel-toggle]")) return;
      cb.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") cb.current();
    };
    // 開いたときのクリックそのもので閉じないよう、少し遅らせて見張り始める
    const t = setTimeout(() => {
      document.addEventListener("pointerdown", down, true);
      document.addEventListener("keydown", key);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key);
    };
  }, []);
  return ref;
}
