#!/usr/bin/env node
// ディミの直近の会話・PC への命令・常駐プログラムの記録をまとめて見る（npm run history）。
// Claude Code でディミの不具合を調べるときに、まずこれを実行して「実際に何が起きたか」を確かめる。
// 使い方: npm run history [-- --n 30 --logs 80]
// キーは .env.local（このフォルダ、なければ自動更新される本体のフォルダ ~/dimy）から読む。キーの値は表示しない。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { aliasLegacyEnv } from "../agent/lib/env.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INSTALLED = path.join(os.homedir(), "dimy");
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) || def : def;
};
const N = arg("n", 30);
const LOGS = arg("logs", 80);

for (const dir of [ROOT, INSTALLED]) {
  const f = path.join(dir, ".env.local");
  if (fs.existsSync(f)) config({ path: f, quiet: true });
  if (process.env.SUPABASE_SECRET_KEY) break;
}
aliasLegacyEnv();

const time = (iso) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false });

async function db() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return console.log("（.env.local に SUPABASE_URL と SUPABASE_SECRET_KEY がないので、会話は読めません）\n");
  const sb = createClient(new URL(url).origin, key, { auth: { persistSession: false } });

  const { data: msgs, error } = await sb
    .from("messages")
    .select("id, role, status, content, error, reply_to, created_at")
    .order("created_at", { ascending: false })
    .limit(N);
  console.log(`==== 直近の会話（新しいものが下・${N} 件まで） ====`);
  if (error) console.log(`読めませんでした: ${error.message}`);
  else
    for (const m of msgs.reverse()) {
      const who = m.role === "user" ? "あなた" : "ディミ";
      console.log(`[${time(m.created_at)}] ${who}（${m.status}）${m.error ? ` エラー: ${m.error}` : ""}`);
      console.log(`  ${m.content.replace(/\n/g, "\n  ")}`);
    }

  const { data: cmds, error: cErr } = await sb
    .from("pc_commands")
    .select("kind, payload, status, result, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  console.log("\n==== PC への命令（Chrome で開くなど・新しいものが下） ====");
  if (cErr) console.log(`読めませんでした: ${cErr.message}`);
  else if (!cmds.length) console.log("（ありません）");
  else for (const c of cmds.reverse()) console.log(`[${time(c.created_at)}] ${c.kind} ${JSON.stringify(c.payload)} → ${c.status}${c.result ? `: ${c.result}` : ""}`);
}

function logs() {
  for (const dir of [...new Set([INSTALLED, ROOT])]) {
    const f = path.join(dir, "agent", "logs", "agent.log");
    if (!fs.existsSync(f)) continue;
    const lines = fs.readFileSync(f, "utf8").trimEnd().split(/\r?\n/);
    console.log(`\n==== 常駐プログラムの記録（${f}・最後の ${Math.min(LOGS, lines.length)} 行） ====`);
    console.log(lines.slice(-LOGS).join("\n"));
  }
}

await db();
logs();
