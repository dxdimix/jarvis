// Windows: プログラムを探す場所（PATH）を、Windows に保存されている最新のものに合わせる。
// デスクトップのショートカットから起動すると、サインインした時点の古い PATH のまま動くことがある
// （Claude Code を入れたあとにサインインし直していないと、'claude' が見つからない）。
// そこで、利用者と PC 全体の PATH を Windows の設定（レジストリ）から読み直して足し、
// それでも見つからなければ、Claude Code がよく入る場所を探す。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function regPath(key) {
  try {
    const out = execFileSync("reg", ["query", key, "/v", "Path"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    const m = out.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i);
    // %USERPROFILE% などを展開する
    return m ? m[1].trim().replace(/%([^%]+)%/g, (_, v) => process.env[v] ?? `%${v}%`) : "";
  } catch {
    return "";
  }
}

/** PATH を最新にする（今の PATH にない場所だけを後ろに足す） */
export function refreshWindowsPath() {
  if (process.platform !== "win32") return;
  const sep = ";";
  const cur = (process.env.Path || process.env.PATH || "").split(sep).filter(Boolean);
  const seen = new Set(cur.map((p) => p.toLowerCase()));
  for (const extra of [regPath("HKCU\\Environment"), regPath("HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment")]) {
    for (const p of extra.split(sep).filter(Boolean)) {
      if (!seen.has(p.toLowerCase())) {
        cur.push(p);
        seen.add(p.toLowerCase());
      }
    }
  }
  process.env.Path = cur.join(sep);
  process.env.PATH = process.env.Path;
}

/** Claude Code の場所。CLAUDE_BIN の指定 → PATH の中 → よく入る場所、の順に探す。見つからなければ "claude" */
export function findClaudeBin(env = process.env) {
  if (env.CLAUDE_BIN) return env.CLAUDE_BIN;
  if (process.platform !== "win32") return "claude";
  const home = os.homedir();
  const names = ["claude.exe", "claude.cmd"];
  const dirs = [
    ...(env.Path || env.PATH || "").split(";").filter(Boolean),
    path.join(home, ".local", "bin"),
    path.join(env.APPDATA || path.join(home, "AppData", "Roaming"), "npm"),
    path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "Programs", "claude"),
    path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "AnthropicClaude"),
  ];
  for (const d of dirs) for (const n of names) {
    const f = path.join(d, n);
    try {
      if (fs.existsSync(f)) return f;
    } catch {}
  }
  return "claude";
}
