// 画面での動作の記録（表 activity_log）。管理の画面の「動作」に日時つきで出す。
// 書けなくても（表がまだないなど）画面の動きは止めない。
import type { SupabaseClient } from "@supabase/supabase-js";

let disabled = false;

function deviceName() {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "ブラウザ";
  const os = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "";
  return [os, browser].filter(Boolean).join(" / ");
}

export function logActivity(supabase: SupabaseClient, kind: string, detail = "") {
  if (disabled) return;
  supabase
    .from("activity_log")
    .insert({ kind, detail: detail.slice(0, 2000), device: deviceName() })
    .then(({ error }) => {
      if (error && /activity_log|relation|schema cache/.test(error.message)) disabled = true;
    });
}

/** 動作の種類を日本語にする */
export const ACTIVITY_LABEL: Record<string, string> = {
  voice: "話しかけた",
  open_app: "アプリを開いた",
  open_chrome: "Chrome で開いた",
  search: "検索した",
  open_session: "セッションを開いた",
  move_pins: "ウィンドウを移した",
  stop: "強制停止",
  restart: "再起動",
  wake: "呼びかけ",
  hotkey: "右 Ctrl 2 回",
  error: "エラー",
};
