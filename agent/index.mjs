// ジャービスの PC 常駐プログラム。
// - Supabase の messages テーブルを Realtime で見張り、画面から届いた発言（status = 'pending'）を受け取る。
// - PC の Claude Code（claude -p、利用者の有料プラン）に返事を作らせ、返事を messages に書き込む。
// - PC からは外向きの通信だけを使う。ポートを開けないので、ルーターやファイアウォールの設定は不要。
//
// 起動: npm run agent（.env.local の SUPABASE_URL / SUPABASE_SECRET_KEY を使う）

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { buildPrompt } from "./lib/prompt.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(ROOT, ".env.local"), quiet: true });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const MODEL = process.env.CLAUDE_MODEL || "sonnet";
// Claude Code に使わせる道具。最初は Web 検索だけ。PC 操作を足すときはここを広げる。
const TOOLS = process.env.JARVIS_TOOLS || "WebSearch";
const TIMEOUT_MS = Number(process.env.JARVIS_TIMEOUT_MS || 3 * 60 * 1000);
const HISTORY_COUNT = 30;
// Claude Code の作業フォルダ。PC 上の他のファイルに触れないよう、専用フォルダで動かす。
const WORKDIR = path.join(ROOT, "agent", "workspace");

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error("SUPABASE_URL と SUPABASE_SECRET_KEY を .env.local に設定してください（.env.example を参照）。");
  process.exit(1);
}
fs.mkdirSync(WORKDIR, { recursive: true });

// secret キーは RLS を通らない強い権限を持つ。PC の .env.local にだけ置き、Vercel やリポジトリには入れない。
const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString("ja-JP")}] ${msg}`);
}

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--output-format", "text",
      "--model", MODEL,
      "--tools", TOOLS,
      "--allowedTools", TOOLS,
      "--no-session-persistence",
      "--strict-mcp-config",
    ];
    const child = spawn(CLAUDE_BIN, args, {
      cwd: WORKDIR,
      shell: process.platform === "win32", // Windows では claude.cmd を探すために必要
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("時間内に返事ができませんでした。"));
    }, TIMEOUT_MS);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(
        new Error(
          e.code === "ENOENT"
            ? "この PC で Claude Code（claude コマンド）が見つかりません。"
            : `Claude Code を起動できませんでした（${e.code || e.message}）。`,
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(stdout.trim());
      console.error(`  Claude Code がエラーで終了しました（終了コード ${code}）: ${stderr.trim().slice(0, 300)}`);
      reject(new Error("Claude Code がエラーで終了しました。PC の画面に表示された理由を確認してください。"));
    });
    child.stdin.end(prompt);
  });
}

async function handle(message) {
  // 他の常駐プログラムと取り合わないよう、pending → processing に変えられたときだけ処理する。
  const { data: claimed, error: claimError } = await supabase
    .from("messages")
    .update({ status: "processing" })
    .eq("id", message.id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return;

  log("発言を受け取りました。返事を作っています…");
  const started = Date.now();
  try {
    const { data: history, error } = await supabase
      .from("messages")
      .select("role, content")
      .eq("user_id", claimed.user_id)
      .eq("status", "done")
      .lt("created_at", claimed.created_at)
      .order("created_at", { ascending: false })
      .limit(HISTORY_COUNT);
    if (error) throw error;

    const reply = await runClaude(buildPrompt(history.reverse(), claimed.content));
    if (!reply) throw new Error("返事が空でした。");

    const { error: insertError } = await supabase.from("messages").insert({
      user_id: claimed.user_id,
      role: "assistant",
      content: reply,
      status: "done",
      reply_to: claimed.id,
    });
    if (insertError) throw insertError;
    await supabase.from("messages").update({ status: "done" }).eq("id", claimed.id);
    log(`返事をしました（${((Date.now() - started) / 1000).toFixed(1)} 秒）`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`失敗しました: ${msg}`);
    await supabase.from("messages").update({ status: "error", error: msg }).eq("id", claimed.id);
  }
}

// 1 件ずつ順番に処理する。
let queue = Promise.resolve();
function enqueue(message) {
  queue = queue.then(() => handle(message)).catch((e) => log(`処理中にエラー: ${e.message || e}`));
}

async function processBacklog() {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) return log(`未処理の発言を取得できませんでした: ${error.message}`);
  if (data.length) log(`未処理の発言が ${data.length} 件あります。`);
  data.forEach(enqueue);
}

// 前回の途中で止まった発言（processing のまま）は、返事待ちに戻してやり直す。
await supabase.from("messages").update({ status: "pending" }).eq("status", "processing").eq("role", "user");

supabase
  .channel("jarvis-agent")
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "messages", filter: "status=eq.pending" },
    (payload) => enqueue(payload.new),
  )
  .subscribe((status, err) => {
    if (status === "SUBSCRIBED") {
      log("ジャービス、起動しました。画面からの発言を待っています。（終了: Ctrl + C）");
      // 接続が切れて再接続したときも、その間に届いた発言を拾う。
      processBacklog();
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      log(`Supabase との接続に問題があります（${status}${err ? `: ${err.message}` : ""}）。自動で再接続します。`);
    }
  });
