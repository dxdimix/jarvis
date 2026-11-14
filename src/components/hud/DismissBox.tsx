"use client";

// 外をクリック・Esc で閉じる箱（ブックマークの一覧など）。
import { useDismiss } from "@/hooks/useDismiss";

export function DismissBox({ onClose, className, children }: { onClose: () => void; className?: string; children: React.ReactNode }) {
  const ref = useDismiss<HTMLDivElement>(onClose);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
