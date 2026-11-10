import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "J.A.R.V.I.S.",
  description: "PC に常駐する個人用 AI エージェント",
  appleWebApp: { capable: true, title: "ジャービス", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: "#020617",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full bg-slate-950 text-slate-100">{children}</body>
    </html>
  );
}
