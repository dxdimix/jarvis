import type { MetadataRoute } from "next";

// スマホのホーム画面に追加したとき、アプリのように全画面で開くための設定。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "K.Y.M.I.S（キーミス）",
    short_name: "キーミス",
    description: "PC に常駐する個人用 AI エージェント",
    start_url: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#020617",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
