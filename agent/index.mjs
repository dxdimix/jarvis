// DIMY（ディミ）の PC 常駐プログラム。
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
import { ClaudeSession, connectorToolPrefix } from "./lib/claude-session.mjs";
import { acquireSingleInstance } from "./lib/single-instance.mjs";
import { PERSONA, buildFirstTurn, buildMemoryBlock, formatTurn } from "./lib/prompt.mjs";
import { startAutoUpdate } from "./lib/updater.mjs";
import { aliasLegacyEnv } from "./lib/env.mjs";
import { startBookmarkSync } from "./lib/bookmarks.mjs";
import { startHotkeyWatch } from "./lib/hotkey.mjs";
import { runCommand, startPcStateSync } from "./lib/pc.mjs";
import { ensureDesktopShortcuts } from "./lib/shortcuts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 画面の設定の「再起動」で書く印（次の起動で、すぐ新しい版を確かめる）
const UPDATE_NOW_FILE = path.join(ROOT, "agent", ".update-now");
loadEnv({ path: path.join(ROOT, ".env.local"), quiet: true });
aliasLegacyEnv(); // 以前の名前（JARVIS_〇〇）で書かれた設定も読む

// URL は「https://xxxx.supabase.co」の形にそろえる（後ろに /rest/v1/ などが付いていても動くように）。
const RAW_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const SUPABASE_URL = RAW_URL ? URL.parse(RAW_URL)?.origin ?? RAW_URL : "";
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY?.trim();
const TIMEOUT_MS = Number(process.env.DIMY_TIMEOUT_MS || 3 * 60 * 1000);
// この回数だけ会話したら Claude Code を起動し直す（会話が長くなりすぎて遅くなるのを防ぐ）。
const MAX_TURNS = Number(process.env.DIMY_MAX_TURNS || 40);
const HISTORY_COUNT = 30;
// 画面への書き込みの間隔。短いほど滑らかだが、Supabase への書き込み回数が増える。
const STREAM_INTERVAL_MS = 300;
// Claude Code の作業フォルダ。PC 上の他のファイルに触れないよう、専用フォルダで動かす。
const WORKDIR = path.join(ROOT, "agent", "workspace");
// ディミに使わせる claude.ai のコネクタ（Google のサービス）。利用者が claude.ai でつないだものだけが実際に使える。
// 利用者の決まり: 探す・読む・作る・書き換える・消すのすべてを任せる（消す前は必ず確かめる。人格に書いてある）。
const CONNECTORS = (process.env.DIMY_CONNECTORS ?? "claude.ai Google Drive,claude.ai Google Sheets,claude.ai Gmail,claude.ai Google Calendar")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);
// 利用者のアプリが置いてある開発用フォルダ。ディミはここのコードを読める（書き換えはしない）。
const DEV_DIR = process.env.DIMY_DEV_DIR || path.join(os.homedir(), "dev");
const PERSONA_FILE = "dimy-persona.md"; // WORKDIR からの相対パス（Windows の日本語ユーザー名でも崩れないように）
const MCP_CONFIG_FILE = "dimy-mcp.json"; // WORKDIR からの相対パス

// 終了コード（windows/start-hidden.vbs と start-windows.bat が見る）
// 3: 自動で起動し直さなくてよい / 4: 更新したので、すぐに起動し直す
const EXIT_NO_RESTART = 3;
const EXIT_RESTART_NOW = 4;
// 自動更新: 確認の間隔と、更新元の GitHub リポジトリ。DIMY_AUTO_UPDATE=off で止められる。
const UPDATE_INTERVAL_MS = Number(process.env.DIMY_UPDATE_INTERVAL_MS || 60 * 60 * 1000);
// リポジトリの名前を jarvis から dimy に変えた。変える前と後のどちらでも更新できるよう、両方を順に試す。
const UPDATE_REPOS = (process.env.DIMY_UPDATE_REPO || "dxdimix/dimy,dxdimix/kymis,dxdimix/jarvis").split(",").map((r) => r.trim());
// この時間、会話がなければ更新してよい。
const IDLE_BEFORE_UPDATE_MS = 2 * 60 * 1000;

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error("SUPABASE_URL と SUPABASE_SECRET_KEY を .env.local に設定してください（.env.example を参照）。");
  process.exit(EXIT_NO_RESTART);
}
if (!(await acquireSingleInstance("dimy-agent"))) {
  console.error("ディミの常駐プログラムは、すでに別の画面で動いています。");
  process.exit(EXIT_NO_RESTART);
}
fs.mkdirSync(WORKDIR, { recursive: true });
// 人格に、この PC での手引きの場所を書き足して渡す（PC ごとにフォルダの場所が違うため）。
fs.writeFileSync(
  path.join(WORKDIR, PERSONA_FILE),
  `${PERSONA}\n- ディミの手引きのフォルダ（この PC での場所）: ${path.join(ROOT, "docs", "apps")}\n`,
);
// ディミの道具（MCP サーバー）の設定。node はこの常駐プログラムと同じものを、場所を指定して使う。
fs.writeFileSync(
  path.join(WORKDIR, MCP_CONFIG_FILE),
  JSON.stringify(
    { mcpServers: { dimy: { command: process.execPath, args: [path.join(ROOT, "agent", "tools", "mcp-server.mjs")] } } },
    null,
    2,
  ),
);

// secret キーは RLS を通らない強い権限を持つ。PC の .env.local にだけ置き、Vercel やリポジトリには入れない。
const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const claude = new ClaudeSession({
  bin: process.env.CLAUDE_BIN || "claude",
  model: process.env.CLAUDE_MODEL || "sonnet",
  // Claude Code に使わせる道具（docs/monitoring.md の決まりに合わせる）
  // - Web 検索、アプリのコードを読む（Read / Glob / Grep）、ディミの道具（MCP、アプリのデータを読み取り専用で読む）
  // - コマンドを実行する機能（Bash）は渡さない。書き換え（Edit / Write）もさせない
  // - .env などの秘密のファイルは読ませない
  tools: process.env.DIMY_TOOLS || "WebSearch,Read,Glob,Grep",
  allowedTools: process.env.DIMY_ALLOWED_TOOLS || ["WebSearch,Read,Glob,Grep,mcp__dimy", ...CONNECTORS.map(connectorToolPrefix)].join(","),
  useConnectors: CONNECTORS.length > 0,
  onInit: (ev) => {
    // どのコネクタが使えるかを記録に残す（つながっていないものは、利用者が claude.ai で追加・ログインする）
    const google = (ev.mcp_servers ?? []).filter((m) => CONNECTORS.includes(m.name));
    if (google.length) log(`コネクタ: ${google.map((m) => `${m.name}（${m.status}）`).join("、")}`);
    const n = (ev.tools ?? []).filter((t) => CONNECTORS.some((c) => t.startsWith(connectorToolPrefix(c)))).length;
    log(`コネクタの道具: ${n} 個`);
  },
  disallowedTools: "Read(**/.env*),Read(**/*.pem),Read(**/*.key),Bash,Edit,Write,NotebookEdit",
  mcpConfigFile: MCP_CONFIG_FILE,
  // 開発用フォルダ（アプリのコード）と、ディミの手引き（docs）を読めるようにする
  addDirs: [path.join(ROOT, "docs"), ...(DEV_DIR && fs.existsSync(DEV_DIR) ? [DEV_DIR] : [])],
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

// 「覚えていること」と「最近の評価」（画面や会話で変わったら、次の発言で Claude Code を起動し直して反映する）
let memoryChanged = false;
async function loadMemory(userId) {
  try {
    const [notes, fb] = await Promise.all([
      supabase.from("kymis_notes").select("kind, content").eq("user_id", userId).eq("active", true).order("created_at"),
      supabase
        .from("feedback")
        .select("rating, comment, messages(content)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    if (notes.error) throw notes.error;
    if (fb.error) throw fb.error;
    return buildMemoryBlock(
      notes.data,
      fb.data.map((f) => ({ rating: f.rating, comment: f.comment, reply: f.messages?.content ?? "" })),
    );
  } catch (e) {
    // 表がまだない（データベースの更新前）などのときは、覚えていることなしで続ける
    log(`覚えていることを読めませんでした（${e.message ?? e}）。なしで続けます。`);
    return "";
  }
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
    if (claude.alive && claude.turns > 0 && memoryChanged) {
      log("覚えていることか評価が変わったので、Claude Code を起動し直して反映します。");
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
      memoryChanged = false;
      prompt = buildFirstTurn(history.reverse(), claimed.content, { memory: await loadMemory(claimed.user_id) });
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
    // 画面で強制停止された: そこまでの返事は残し（なければ消し）、発言は終わったことにする
    if (e?.cancelled) {
      log("画面で止められたので、返事を作るのをやめました。");
      if (e.partial?.trim()) await writer.finish(`${e.partial.trim()}\n\n（ここで止めました）`).catch(() => {});
      else await writer.discard();
      await supabase.from("messages").update({ status: "done" }).eq("id", claimed.id);
      return;
    }
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

// ディミの「覚える」道具（MCP）が、誰のメモとして書くかを知るため、利用者の ID を渡す。
// 利用者は 1 人だけの決まり（画面からの新規登録はしない）。
try {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 2 });
  if (error) throw error;
  if (data.users.length === 1) {
    const owner = data.users[0];
    process.env.DIMY_OWNER_ID = owner.id;
    // Chrome のブックマークを写す（利用者のメールアドレスでログインしている Chrome のプロフィールから）
    if (owner.email && process.env.DIMY_BOOKMARKS !== "off") startBookmarkSync({ supabase, userId: owner.id, email: owner.email, log });
    // Chrome のプロフィールと Claude Code のセッションの一覧を画面に知らせ、画面からの命令（Chrome で開くなど）を受け付ける
    startPcStateSync({ supabase, userId: owner.id, log });
    startPcCommands(owner.id);
  } else log(`利用者が ${data.users.length} 人いるため、「覚える」道具は使いません。`);
} catch (e) {
  log(`利用者を確かめられませんでした（${e.message ?? e}）。「覚える」道具は使いません。`);
}

// 画面からの命令（表 pc_commands）を実行する。利用者本人の命令だけ。古い命令（2 分以上前）は実行しない。
function startPcCommands(ownerId) {
  const done = new Set();
  async function exec(cmd) {
    if (done.has(cmd.id) || cmd.status !== "pending") return;
    done.add(cmd.id);
    let status = "done";
    let result;
    if (cmd.user_id !== ownerId) {
      status = "error";
      result = "利用者本人の命令ではありません。";
    } else if (Date.now() - new Date(cmd.created_at).getTime() > 120_000) {
      status = "error";
      result = "時間がたっているので実行しませんでした。";
    } else if (cmd.kind === "restart") {
      // 画面の設定の「再起動」: 返事を書いてから終わり、起動し直す（起動したらすぐ新しい版を確かめる）
      result = "再起動します";
      await supabase.from("pc_commands").update({ status: "done", result }).eq("id", cmd.id).eq("status", "pending");
      log("画面から再起動を頼まれました。起動し直します。");
      try {
        fs.writeFileSync(UPDATE_NOW_FILE, String(Date.now()));
      } catch {}
      claude.stop();
      setTimeout(() => process.exit(EXIT_RESTART_NOW), 300);
      return;
    } else {
      try {
        result = await runCommand(cmd, { log });
      } catch (e) {
        status = "error";
        result = e instanceof Error ? e.message : String(e);
        log(`命令を実行できませんでした: ${result}`);
      }
    }
    await supabase.from("pc_commands").update({ status, result }).eq("id", cmd.id).eq("status", "pending");
  }
  async function backlog() {
    const { data, error } = await supabase.from("pc_commands").select("*").eq("status", "pending").order("created_at");
    if (!error) for (const c of data) await exec(c);
  }
  // つながらなくても（表がまだないなど）つなぎ直しはしない（発言の通知まで止めないため）
  let warned = false;
  supabase
    .channel("dimy-pc")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "pc_commands" }, (p) => exec(p.new))
    .subscribe((status) => {
      if (status === "SUBSCRIBED") backlog();
      if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && !warned) {
        warned = true;
        log("画面からの命令（Chrome で開くなど）を受け取れません。データベースの更新がまだかもしれません。");
      }
    });
  setInterval(backlog, 30_000).unref();
}

// デスクトップのショートカットを今の決まり（「ディミを再起動」1 つ）に合わせる
ensureDesktopShortcuts({ root: ROOT, log });

// 最初の発言を待たずに Claude Code を起動しておく（1 回目の返事も速くするため）。
claude.start();

function shutdown() {
  claude.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// 「ディミを再起動」（デスクトップのアイコン・画面の設定）から起動したときは、すぐ新しい版を確かめる
const UPDATE_NOW = process.env.DIMY_UPDATE_NOW === "1" || fs.existsSync(UPDATE_NOW_FILE);
try {
  fs.rmSync(UPDATE_NOW_FILE, { force: true });
} catch {}
if (process.env.DIMY_AUTO_UPDATE !== "off") {
  const enabled = startAutoUpdate({
    root: ROOT,
    repos: UPDATE_REPOS,
    intervalMs: UPDATE_INTERVAL_MS,
    // デスクトップの「ディミを再起動」から起動したとき（DIMY_UPDATE_NOW=1）は、会話の途切れを待たずにすぐ更新する
    isIdle: () => inFlight === 0 && (UPDATE_NOW || Date.now() - lastActivity > IDLE_BEFORE_UPDATE_MS),
    firstCheckMs: UPDATE_NOW ? 3_000 : 60_000,
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
  "dimy-presence",
  (ch) => ch,
  (ch) => ch.track({ online_at: new Date().toISOString() }),
);

// 右 Ctrl を 2 回押したことを画面に知らせる（Realtime の Broadcast）。送るのは「押された」ことだけ。
let controlChannel = null;
connect(
  "dimy-control",
  // 画面の強制停止（ボタン・Esc・「ストップ」）: 作っている返事をやめ、まだ始めていない発言も取り消す
  (ch) => ch.on("broadcast", { event: "stop" }, () => forceStop()),
  (ch) => (controlChannel = ch),
);
async function forceStop() {
  const partial = claude.cancel();
  if (partial !== null) claude.start(); // 次の返事を速くするため、すぐ起動し直しておく
  const { data } = await supabase
    .from("messages")
    .update({ status: "error", error: "止めました" })
    .eq("status", "pending")
    .eq("role", "user")
    .select("id");
  if (partial !== null || data?.length) log(`画面で強制停止されました（取り消した発言 ${data?.length ?? 0} 件）。`);
}
if (process.env.DIMY_HOTKEY !== "off") {
  startHotkeyWatch({
    root: ROOT,
    log,
    onDouble: () => {
      if (!controlChannel) return log("キーの見張り: Supabase につながっていないため、画面に知らせられませんでした。");
      controlChannel.send({ type: "broadcast", event: "hotkey", payload: { at: Date.now() } }).catch(() => {});
    },
  });
}

// 「覚えていること」と評価の変化を見張る。発言の通知とは別のチャンネルにする
// （表がまだないデータベースでも、発言の通知が止まらないように）。
// つながらなくても（表がないなど）つなぎ直しはしない。つなぎ直しは通信の土台ごと作り直すので、発言の通知まで止めてしまうため。
let memoryWarned = false;
supabase
  .channel("dimy-memory")
  .on("postgres_changes", { event: "*", schema: "public", table: "kymis_notes" }, () => (memoryChanged = true))
  .on("postgres_changes", { event: "*", schema: "public", table: "feedback" }, () => (memoryChanged = true))
  .subscribe((status) => {
    if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && !memoryWarned) {
      memoryWarned = true;
      log("「覚えていること」の変化を見張れません（データベースの更新前かもしれません）。会話は続けられます。");
    }
  });

let announced = false;
connect(
  "dimy-agent",
  (ch) =>
    ch.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: "status=eq.pending" },
      (payload) => enqueue(payload.new),
    ),
  () => {
    if (!announced) log("ディミ、起動しました。画面からの発言を待っています。（終了: Ctrl + C）");
    else log("Supabase につなぎ直しました。");
    announced = true;
    // 接続が切れてつなぎ直したときも、その間に届いた発言を拾う。
    // つながった直後は通知が届き始めるまで少しかかるので、3 秒後にも 1 回確かめる。
    processBacklog();
    setTimeout(processBacklog, 3_000);
  },
);
