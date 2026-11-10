// ジャービスの PC 常駐プログラム。
// - Supabase の messages テーブルを Realtime で見張り、画面から届いた発言（status = 'pending'）を受け取る。
// - 起動したままの Claude Code（利用者の有料プラン）に返事を作らせ、書いた端から messages に書き込む。
// - PC からは外向きの通信だけを使う。ポートを開けないので、ルーターやファイアウォールの設定は不要。
//
// 起動: npm run agent（.env.local の SUPABASE_URL / SUPABASE_SECRET_KEY を使う）

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { ClaudeSession } from "./lib/claude-session.mjs";
import { acquireSingleInstance } from "./lib/single-instance.mjs";
import { PERSONA, buildFirstTurn, formatTurn } from "./lib/prompt.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(ROOT, ".env.local"), quiet: true });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const TIMEOUT_MS = Number(process.env.JARVIS_TIMEOUT_MS || 3 * 60 * 1000);
// この回数だけ会話したら Claude Code を起動し直す（会話が長くなりすぎて遅くなるのを防ぐ）。
const MAX_TURNS = Number(process.env.JARVIS_MAX_TURNS || 40);
const HISTORY_COUNT = 30;
// 画面への書き込みの間隔。短いほど滑らかだが、Supabase への書き込み回数が増える。
const STREAM_INTERVAL_MS = 300;
// Claude Code の作業フォルダ。PC 上の他のファイルに触れないよう、専用フォルダで動かす。
const WORKDIR = path.join(ROOT, "agent", "workspace");
const PERSONA_FILE = "jarvis-persona.md"; // WORKDIR からの相対パス（Windows の日本語ユーザー名でも崩れないように）

// 終了コード 3 は「自動で起動し直さなくてよい」の合図（windows/start-hidden.vbs が見る）。
const EXIT_NO_RESTART = 3;

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error("SUPABASE_URL と SUPABASE_SECRET_KEY を .env.local に設定してください（.env.example を参照）。");
  process.exit(EXIT_NO_RESTART);
}
if (!(await acquireSingleInstance("jarvis-agent"))) {
  console.error("ジャービスの常駐プログラムは、すでに別の画面で動いています。");
  process.exit(EXIT_NO_RESTART);
}
fs.mkdirSync(WORKDIR, { recursive: true });
fs.writeFileSync(path.join(WORKDIR, PERSONA_FILE), PERSONA);

// secret キーは RLS を通らない強い権限を持つ。PC の .env.local にだけ置き、Vercel やリポジトリには入れない。
const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const claude = new ClaudeSession({
  bin: process.env.CLAUDE_BIN || "claude",
  model: process.env.CLAUDE_MODEL || "sonnet",
  // Claude Code に使わせる道具。最初は Web 検索だけ。PC 操作を足すときはここを広げる。
  tools: process.env.JARVIS_TOOLS || "WebSearch",
  cwd: WORKDIR,
  systemPromptFile: PERSONA_FILE,
  timeoutMs: TIMEOUT_MS,
});

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString("ja-JP")}] ${msg}`);
}

/** 返事を少しずつ書き込む。書き込みは 1 本ずつ順番に行い、間隔をあけてまとめる。 */
function createReplyWriter(message) {
  let id = null;
  let latest = "";
  let written = "";
  let timer = null;
  let started = false;
  let chain = Promise.resolve();

  function flush(status) {
    chain = chain.then(async () => {
      if (!latest || (latest === written && status === "processing")) return;
      const content = latest;
      if (!id) {
        const { data, error } = await supabase
          .from("messages")
          .insert({ user_id: message.user_id, role: "assistant", content, status, reply_to: message.id })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      } else {
        const { error } = await supabase.from("messages").update({ content, status }).eq("id", id);
        if (error) throw error;
      }
      written = content;
    });
    return chain;
  }

  return {
    update(text) {
      latest = text;
      // 書き始めはすぐ画面に出す。2 回目以降はまとめて書き込む。
      if (!started) {
        started = true;
        flush("processing").catch((e) => log(`途中経過を書き込めませんでした: ${e.message}`));
        return;
      }
      timer ??= setTimeout(() => {
        timer = null;
        flush("processing").catch((e) => log(`途中経過を書き込めませんでした: ${e.message}`));
      }, STREAM_INTERVAL_MS);
    },
    async finish(text) {
      clearTimeout(timer);
      timer = null;
      latest = text;
      await flush("done");
    },
    async discard() {
      clearTimeout(timer);
      timer = null;
      await chain.catch(() => {});
      if (id) await supabase.from("messages").delete().eq("id", id);
    },
  };
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
  const writer = createReplyWriter(claimed);
  try {
    if (claude.alive && claude.turns >= MAX_TURNS) {
      log("会話が長くなったので、Claude Code を起動し直します。");
      claude.stop();
    }

    let prompt;
    if (claude.alive && claude.turns > 0) {
      prompt = formatTurn(claimed.content);
    } else {
      // 起動直後の最初の発言には、これまでの会話を添えて話の流れを引き継ぐ。
      const { data: history, error } = await supabase
        .from("messages")
        .select("role, content")
        .eq("user_id", claimed.user_id)
        .eq("status", "done")
        .lt("created_at", claimed.created_at)
        .order("created_at", { ascending: false })
        .limit(HISTORY_COUNT);
      if (error) throw error;
      prompt = buildFirstTurn(history.reverse(), claimed.content);
    }

    let firstAt = 0;
    const reply = await claude.ask(prompt, (text) => {
      firstAt ||= Date.now();
      writer.update(text);
    });
    if (!reply) throw new Error("返事が空でした。");

    await writer.finish(reply);
    await supabase.from("messages").update({ status: "done" }).eq("id", claimed.id);
    const sec = (ms) => (ms / 1000).toFixed(1);
    log(`返事をしました（書き始め ${sec(firstAt - started)} 秒 / 完了 ${sec(Date.now() - started)} 秒）`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`失敗しました: ${msg}`);
    await writer.discard();
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

// 前回の途中で止まった返事は消し、発言は返事待ちに戻してやり直す。
await supabase.from("messages").delete().eq("status", "processing").eq("role", "assistant");
await supabase.from("messages").update({ status: "pending" }).eq("status", "processing").eq("role", "user");

// 最初の発言を待たずに Claude Code を起動しておく（1 回目の返事も速くするため）。
claude.start();

function shutdown() {
  claude.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// 画面に「PC が動いている」ことを知らせる（Realtime の Presence）。中身は起動時刻だけ。
const presence = supabase.channel("jarvis-presence");
presence.subscribe((status) => {
  if (status === "SUBSCRIBED") presence.track({ online_at: new Date().toISOString() });
});

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
