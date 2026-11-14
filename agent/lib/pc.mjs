// 画面からの命令で、PC で Chrome やセッションを開く（ディミの中では開かないもの）。
// - open_url: 指定の Chrome のプロフィール（アカウント 1, 2, …）で URL を開く
// - open_session: PC の Claude Code のセッションを、新しいターミナルで開き直す（claude --resume）
// あわせて、Chrome のプロフィールの一覧と、PC の Claude Code のセッションの一覧を表 pc_state に写す（画面の設定と声の命令に使う）。
// 命令は表 pc_commands で受け取る（本人しか追加できない。ここでも本人の命令かを確かめる）。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromeUserDataDir } from "./bookmarks.mjs";

/** Chrome の本体（chrome.exe）を探す。DIMY_CHROME_EXE で指定もできる */
export function findChromeExe(env = process.env) {
  if (env.DIMY_CHROME_EXE) return env.DIMY_CHROME_EXE;
  const bases = [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter(Boolean);
  for (const b of bases) {
    const p = path.join(b, "Google", "Chrome", "Application", "chrome.exe");
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Local State から、Chrome のプロフィールの一覧を作る（Chrome の並び順。アカウント 1 = 最初のプロフィール）。
 * @returns {{ dir: string, name: string, email: string }[]}
 */
export function listChromeProfiles(localState) {
  const cache = localState?.profile?.info_cache ?? {};
  const order = Array.isArray(localState?.profile?.profiles_order) ? localState.profile.profiles_order : [];
  const dirs = [...new Set([...order.filter((d) => d in cache), ...Object.keys(cache)])];
  // 並び順の指定がなければ Default、Profile 1、Profile 2… の順
  if (!order.length) dirs.sort((a, b) => (a === "Default" ? -1 : b === "Default" ? 1 : a.localeCompare(b, "en", { numeric: true })));
  return dirs.map((dir) => ({ dir, name: String(cache[dir]?.name ?? dir), email: String(cache[dir]?.user_name ?? "") }));
}

/** 会話の記録（jsonl）の頭の部分から、題名と作業フォルダを取り出す */
export function readSessionHead(text) {
  let title = "";
  let summary = "";
  let cwd = "";
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (ev.type === "summary" && ev.summary && !summary) summary = String(ev.summary);
    if (!cwd && ev.cwd) cwd = String(ev.cwd);
    if (!title && ev.type === "user" && ev.message?.role === "user") {
      const c = ev.message.content;
      const t = typeof c === "string" ? c : Array.isArray(c) ? c.filter((x) => x?.type === "text").map((x) => x.text).join(" ") : "";
      // 道具の結果や、命令の形のもの（<command-name> など）は題名にしない
      if (t && !t.startsWith("<")) title = t.replace(/\s+/g, " ").trim();
    }
    if (summary && cwd && title) break;
  }
  return { title: (summary || title).slice(0, 80), cwd };
}

/**
 * PC の Claude Code のセッションの一覧（新しい順）。
 * @returns {{ id: string, title: string, project: string, cwd: string, updated_at: string }[]}
 */
export function listClaudeSessions(root = path.join(os.homedir(), ".claude", "projects"), limit = 60) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const proj of fs.readdirSync(root, { withFileTypes: true })) {
    if (!proj.isDirectory()) continue;
    const dir = path.join(root, proj.name);
    for (const f of fs.readdirSync(dir)) {
      if (!/^[0-9a-f-]{36}\.jsonl$/.test(f)) continue;
      const file = path.join(dir, f);
      try {
        files.push({ file, id: f.slice(0, 36), mtime: fs.statSync(file).mtimeMs });
      } catch {}
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  const out = [];
  for (const f of files.slice(0, limit)) {
    let head = "";
    try {
      const fd = fs.openSync(f.file, "r");
      const buf = Buffer.alloc(128 * 1024);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      head = buf.subarray(0, n).toString("utf8");
    } catch {
      continue;
    }
    const { title, cwd } = readSessionHead(head);
    if (!title) continue;
    out.push({ id: f.id, title, cwd, project: cwd ? path.basename(cwd) : "", updated_at: new Date(f.mtime).toISOString() });
  }
  return out;
}

export function profilesNow() {
  try {
    return listChromeProfiles(JSON.parse(fs.readFileSync(path.join(chromeUserDataDir(), "Local State"), "utf8")));
  } catch {
    return [];
  }
}

/**
 * 開く Chrome のプロフィールを決める。
 * profile（フォルダ名）の指定 → account（番号）の指定 → マスターアカウント（利用者のメールアドレスのプロフィール）→ 1 番目
 */
export function pickProfile(profiles, { profile, account }, masterEmail = process.env.DIMY_OWNER_EMAIL || "") {
  if (!profiles.length) throw new Error("Chrome のプロフィールが見つかりません。");
  const label = (p) => `${p.name}${p.email ? `（${p.email}）` : ""}`;
  if (profile) {
    const found = profiles.find((p) => p.dir === profile);
    if (found) return { ...found, label: label(found) };
  }
  if (account) {
    const n = Number(account);
    const found = profiles[n - 1];
    if (!found) throw new Error(`アカウント ${n} の Chrome のプロフィールがありません（Chrome のプロフィールは ${profiles.length} 個です）。`);
    return { ...found, label: `アカウント ${n}：${label(found)}` };
  }
  const want = masterEmail.trim().toLowerCase();
  const master = want && profiles.find((p) => p.email.toLowerCase() === want);
  const chosen = master || profiles[0];
  return { ...chosen, label: `${master ? "マスターアカウント" : "アカウント 1"}：${label(chosen)}` };
}

/** 命令を 1 件実行する。結果の文（画面に出す）を返す。失敗したら例外 */
export async function runCommand(cmd, { log }) {
  if (cmd.kind === "open_url") {
    const url = String(cmd.payload?.url ?? "");
    let u;
    try {
      u = new URL(url);
    } catch {
      throw new Error("URL の形になっていません。");
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("http / https の URL だけを開けます。");
    const exe = findChromeExe();
    if (!exe) throw new Error("この PC に Chrome が見つかりません。");
    const profile = pickProfile(profilesNow(), cmd.payload ?? {});
    spawn(exe, [`--profile-directory=${profile.dir}`, u.toString()], { detached: true, stdio: "ignore", windowsHide: false }).unref();
    log(`Chrome（${profile.label}）で開きました: ${u.hostname}`);
    return `${profile.label}で開きました`;
  }
  if (cmd.kind === "open_session") {
    const id = String(cmd.payload?.id ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("セッションの番号の形が違います。");
    // 作業フォルダは、命令に書かれたものではなく、PC の記録から決める
    const s = listClaudeSessions(undefined, 500).find((x) => x.id === id);
    if (!s) throw new Error("そのセッションが PC に見つかりません。");
    const cwd = s.cwd && fs.existsSync(s.cwd) ? s.cwd : os.homedir();
    if (process.platform === "win32") {
      // 新しいコマンドプロンプトの画面で、そのセッションを開き直す
      spawn("cmd.exe", ["/c", "start", "DIMY", "/D", cwd, "cmd.exe", "/k", "claude", "--resume", id], {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      }).unref();
    } else {
      throw new Error("セッションを開けるのは Windows の PC だけです。");
    }
    log(`Claude Code のセッションを開きました: ${s.title}`);
    return `「${s.title}」を開きました`;
  }
  throw new Error(`知らない命令です（${cmd.kind}）。`);
}

/**
 * PC の情報（Chrome のプロフィール・Claude Code のセッション）を、変わったときだけ表に写す。
 */
export function startPcStateSync({ supabase, userId, log, intervalMs = 5 * 60_000 }) {
  let last = "";
  let warned = false;
  async function sync() {
    const chrome_profiles = profilesNow();
    const claude_sessions = listClaudeSessions().map(({ id, title, project, updated_at }) => ({ id, title, project, updated_at }));
    const json = JSON.stringify({ chrome_profiles, claude_sessions });
    if (json === last) return;
    const { error } = await supabase
      .from("pc_state")
      .upsert({ user_id: userId, chrome_profiles, claude_sessions, updated_at: new Date().toISOString() });
    if (error) {
      if (!warned) log(`PC の情報を書き込めませんでした（${error.message}）。データベースの更新（pc_commands のマイグレーション）がまだかもしれません。`);
      warned = true;
      return;
    }
    last = json;
  }
  sync();
  const t = setInterval(sync, intervalMs);
  t.unref?.();
  return sync;
}
