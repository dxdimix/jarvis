// K.Y.M.I.S（キーミス）の PC 常駐プログラム。
// - Supabase の messages テーブルを Realtime で見張り、画面から届いた発言（status = 'pending'）を受け取る。
// - 起動したままの Claude Code（利用者の有料プラン）に返事を作らせ、書いた端から messages に書き込む。
// - PC からは外向きの通信だけを使う。ポートを開けないので、ルーターやファイアウォールの設定は不要。
//
// 起動: npm run agent（.env.local の SUPABASE_URL / SUPABASE_SECRET_KEY を使う）

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { ClaudeSession } from "./lib/claude-session.mjs";
import { acquireSingleInstance } from "./lib/single-instance.mjs";
import { PERSONA, buildFirstTurn, formatTurn } from "./lib/prompt.mjs";
import { startAutoUpdate } from "./lib/updater.mjs";
import { aliasLegacyEnv } from "./lib/env.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(ROOT, ".env.local"), quiet: true });
aliasLegacyEnv(); // 以前の名前（JARVIS_〇〇）で書かれた設定も読む

// URL は「https://xxxx.supabase.co」の形にそろえる（後ろに /rest/v1/ などが付いていても動くように）。
const RAW_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const SUPABASE_URL = RAW_URL ? URL.parse(RAW_URL)?.origin ?? RAW_URL : "";
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY?.trim();
const TIMEOUT_MS = Number(process.env.KYMIS_TIMEOUT_MS || 3 * 60 * 1000);
// この回数だけ会話したら Claude Code を起動し直す（会話が長くなりすぎて遅くなるのを防ぐ）。
const MAX_TURNS = Number(process.env.KYMIS_MAX_TURNS || 40);
const HISTORY_COUNT = 30;
// 画面への書き込みの間隔。短いほど滑らかだが、Supabase への書き込み回数が増える。
const STREAM_INTERVAL_MS = 300;
// Claude Code の作業フォルダ。PC 上の他のファイルに触れないよう、専用フォルダで動かす。
const WORKDIR = path.join(ROOT, "agent", "workspace");
// 利用者のアプリが置いてある開発用フォルダ。キーミスはここのコードを読める（書き換えはしない）。
const DEV_DIR = process.env.KYMIS_DEV_DIR || path.join(os.homedir(), "dev");
const PERSONA_FILE = "kymis-persona.md"; // WORKDIR からの相対パス（Windows の日本語ユーザー名でも崩れないように）

// 終了コード（windows/start-hidden.vbs と start-windows.bat が見る）
// 3: 自動で起動し直さなくてよい / 4: 更新したので、すぐに起動し直す
const EXIT_NO_RESTART = 3;
const EXIT_RESTART_NOW = 4;
// 自動更新: 確認の間隔と、更新元の GitHub リポジトリ。KYMIS_AUTO_UPDATE=off で止められる。
const UPDATE_INTERVAL_MS = Number(process.env.KYMIS_UPDATE_INTERVAL_MS || 60 * 60 * 1000);
// リポジトリの名前を jarvis から kymis に変えた。変える前と後のどちらでも更新できるよう、両方を順に試す。
const UPDATE_REPOS = (process.env.KYMIS_UPDATE_REPO || "dxdimix/kymis,dxdimix/jarvis").split(",").map((r) => r.trim());
// この時間、会話がなければ更新してよい。
const IDLE_BEFORE_UPDATE_MS = 2 * 60 * 1000;

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error("SUPABASE_URL と SUPABASE_SECRET_KEY を .env.local に設定してください（.env.example を参照）。");
  process.exit(EXIT_NO_RESTART);
}
if (!(await acquireSingleInstance("kymis-agent"))) {
  console.error("キーミスの常駐プログラムは、すでに別の画面で動いています。");
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
  // Claude Code に使わせる道具（docs/monitoring.md の決まりに合わせる）
  // - Web 検索、アプリのコードを読む（Read / Glob / Grep）、アプリのデータを読む道具（読み取り専用）
  // - Bash は appdata.mjs の実行だけを許可する（ほかは Claude Code が安全と判断する読み取り系のコマンドだけ動く）
  // - .env などの秘密のファイルは読ませない
  tools: process.env.KYMIS_TOOLS || "WebSearch,Read,Glob,Grep,Bash",
  allowedTools: process.env.KYMIS_ALLOWED_TOOLS || "WebSearch,Read,Glob,Grep,Bash(node ../tools/appdata.mjs:*)",
  disallowedTools: "Read(**/.env*),Read(**/*.pem),Read(**/*.key),Edit,Write,NotebookEdit",
  addDirs: DEV_DIR && fs.existsSync(DEV_DIR) ? [DEV_DIR] : [],
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
let inFlight = 0;
let lastActivity = Date.now();
function enqueue(message) {
  inFlight++;
  queue = queue
    .then(() => handle(message))
    .catch((e) => log(`処理中にエラー: ${e.message || e}`))
    .finally(() => {
      inFlight--;
      lastActivity = Date.now();
    });
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

// Realtime の通知は、起動直後や再接続の前後に取りこぼすことがある。
// 念のため 30 秒ごとに返事待ちの発言が残っていないか確かめる（同じ発言を二重に処理しないことは handle() が保証する）。
setInterval(() => {
  if (inFlight === 0) processBacklog();
}, 30_000).unref();

// 最初の発言を待たずに Claude Code を起動しておく（1 回目の返事も速くするため）。
claude.start();

function shutdown() {
  claude.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

if (process.env.KYMIS_AUTO_UPDATE !== "off") {
  const enabled = startAutoUpdate({
    root: ROOT,
    repos: UPDATE_REPOS,
    intervalMs: UPDATE_INTERVAL_MS,
    isIdle: () => inFlight === 0 && Date.now() - lastActivity > IDLE_BEFORE_UPDATE_MS,
    log,
    onUpdated: () => {
      claude.stop();
      process.exit(EXIT_RESTART_NOW);
    },
  });
  if (enabled) log(`自動更新: オン（${Math.round(UPDATE_INTERVAL_MS / 60000)} 分ごとに新しい版を確認します）`);
}

// Realtime のチャンネルにつなぐ。つながらなかったときや切れたときは、10 秒後につなぎ直す。
// （PC の起動直後など、ネットワークや Supabase の準備が整う前に起動しても、あとでつながるようにする）
const RETRY_MS = 10_000;
// 通信の土台（ソケット）が壊れたままだと、チャンネルだけ作り直してもつながらない。
// つなぎ直すときは土台ごと作り直す（同時に複数のチャンネルが頼んでも、作り直しは 1 回にまとめる）。
let resetting = null;
function resetRealtime(then) {
  resetting ??= (async () => {
    supabase.realtime.disconnect();
    await new Promise((r) => setTimeout(r, 500));
    supabase.realtime.connect();
  })().finally(() => {
    resetting = null;
  });
  resetting.then(then);
}
function connect(name, setup, onSubscribed) {
  let retrying = false;
  const channel = setup(supabase.channel(name));
  channel.subscribe((status, err) => {
    if (status === "SUBSCRIBED") {
      onSubscribed?.(channel);
    } else if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") && !retrying) {
      retrying = true;
      log(`Supabase との接続に問題があります（${name}: ${status}${err ? ` ${err.message}` : ""}）。${RETRY_MS / 1000} 秒後につなぎ直します。`);
      setTimeout(async () => {
        await supabase.removeChannel(channel).catch(() => {});
        resetRealtime(() => connect(name, setup, onSubscribed));
      }, RETRY_MS);
    }
  });
}

// 画面に「PC が動いている」ことを知らせる（Realtime の Presence）。中身は起動時刻だけ。
connect(
  "kymis-presence",
  (ch) => ch,
  (ch) => ch.track({ online_at: new Date().toISOString() }),
);

let announced = false;
connect(
  "kymis-agent",
  (ch) =>
    ch.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: "status=eq.pending" },
      (payload) => enqueue(payload.new),
    ),
  () => {
    if (!announced) log("キーミス、起動しました。画面からの発言を待っています。（終了: Ctrl + C）");
    else log("Supabase につなぎ直しました。");
    announced = true;
    // 接続が切れてつなぎ直したときも、その間に届いた発言を拾う。
    processBacklog();
  },
);
