// Chrome のブックマークを、Supabase の bookmarks 表に写す（声や一覧から開くため）。
// - Chrome の「Local State」から、利用者のメールアドレスでログインしているプロフィールを探す。
// - そのプロフィールの「Bookmarks」ファイル（JSON）を読む。Chrome は書き換え中でも、このファイルは普通に読める。
// - ファイルが変わったときだけ、表の中身を入れ替える。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Chrome の「User Data」フォルダ（Windows の既定の場所。DIMY_CHROME_USER_DATA で変えられる） */
export function chromeUserDataDir(env = process.env) {
  if (env.DIMY_CHROME_USER_DATA) return env.DIMY_CHROME_USER_DATA;
  const local = env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  return path.join(local, "Google", "Chrome", "User Data");
}

/**
 * Local State（JSON）から、メールアドレスに合うプロフィールのフォルダ名を探す（例: "Default", "Profile 1"）。
 * @param {any} localState
 * @param {string} email
 */
export function findProfileDir(localState, email) {
  const cache = localState?.profile?.info_cache ?? {};
  const want = email.trim().toLowerCase();
  for (const [dir, info] of Object.entries(cache)) {
    if (String(info?.user_name ?? "").toLowerCase() === want) return dir;
  }
  return null;
}

/**
 * Bookmarks（JSON）を、開ける URL だけの平たい一覧にする。
 * @param {any} json
 * @returns {{ title: string, url: string, folder: string, sort: number }[]}
 */
export function flattenBookmarks(json) {
  const out = [];
  const ROOT_NAMES = { bookmark_bar: "ブックマークバー", other: "その他のブックマーク", synced: "モバイルのブックマーク" };
  function walk(node, folder) {
    if (!node) return;
    if (node.type === "url") {
      if (/^https?:\/\//i.test(node.url ?? "")) out.push({ title: (node.name || node.url).slice(0, 300), url: node.url, folder, sort: out.length });
      return;
    }
    const name = node.name ? (folder ? `${folder} / ${node.name}` : node.name) : folder;
    for (const child of node.children ?? []) walk(child, name);
  }
  for (const [key, root] of Object.entries(json?.roots ?? {})) {
    if (!root || typeof root !== "object" || !("children" in root)) continue;
    for (const child of root.children ?? []) walk(child, ROOT_NAMES[key] ?? root.name ?? "");
  }
  return out;
}

/**
 * ブックマークを見張って、変わったら表に写す。Chrome が見つからなければ何もしない。
 * @param {{ supabase: any, userId: string, email: string, log: (m: string) => void, intervalMs?: number }} o
 */
export function startBookmarkSync(o) {
  const dir = chromeUserDataDir();
  const stateFile = path.join(dir, "Local State");
  if (!fs.existsSync(stateFile)) return false;
  let lastMtime = 0;
  let busy = false;

  async function sync() {
    if (busy) return;
    busy = true;
    try {
      const profile = findProfileDir(JSON.parse(fs.readFileSync(stateFile, "utf8")), o.email);
      if (!profile) {
        o.log(`Chrome に ${o.email} のプロフィールが見つかりません。ブックマークは写しません。`);
        return;
      }
      const file = path.join(dir, profile, "Bookmarks");
      if (!fs.existsSync(file)) return;
      const mtime = fs.statSync(file).mtimeMs;
      if (mtime === lastMtime) return;
      const items = flattenBookmarks(JSON.parse(fs.readFileSync(file, "utf8")));
      const { error: delError } = await o.supabase.from("bookmarks").delete().eq("user_id", o.userId);
      if (delError) throw delError;
      for (let i = 0; i < items.length; i += 500) {
        const { error } = await o.supabase.from("bookmarks").insert(items.slice(i, i + 500).map((b) => ({ ...b, user_id: o.userId })));
        if (error) throw error;
      }
      lastMtime = mtime;
      o.log(`Chrome のブックマークを写しました（${items.length} 件）。`);
    } catch (e) {
      o.log(`ブックマークを写せませんでした（${e.message ?? e}）。`);
    } finally {
      busy = false;
    }
  }

  sync();
  setInterval(sync, o.intervalMs ?? 5 * 60 * 1000).unref();
  return true;
}
