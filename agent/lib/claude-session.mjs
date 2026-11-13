// Claude Code を起動したままにして、続けて質問できるようにする。
// - 発言のたびに起動し直さないので、起動の待ち時間がなくなる。
// - 会話の流れは Claude Code の中に残るので、毎回履歴を送り直さなくてよい。
// - 返事は書いた端から onText で受け取れる（画面に少しずつ表示するため）。

import { spawn } from "node:child_process";

/**
 * Claude Code に渡す環境変数から、キーや秘密の値を外す。
 * アプリのデータを読む道具（agent/tools/appdata.mjs）は、キーを .env.local から自分で読む。
 */
export function safeEnv(env) {
  return Object.fromEntries(
    // Claude Code 自身のログインに使うもの（ANTHROPIC_ / CLAUDE_ で始まる）は残す。
    Object.entries(env).filter(
      ([k]) => /^(ANTHROPIC_|CLAUDE_)/.test(k) || !/KEY|SECRET|TOKEN|PASSWORD|JARVIS_APP_|KYMIS_APP_|SUPABASE/i.test(k),
    ),
  );
}

/**
 * Windows では Claude Code を cmd.exe 経由で起動する（claude.cmd を探すため）。
 * そのとき引数は 1 本の文字列につながれるので、空白や記号（( ) * , など）を含む引数は引用符で囲む。
 * 囲まないと、許可のルールなどが途中で切れたり、別の意味に取られたりする。
 */
export function quoteForCmd(arg) {
  if (arg === "") return '""';
  if (!/[\s"&|<>^()%!*,;=]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

export class ClaudeSession {
  /**
   * @param {{ bin: string, model: string, tools: string, allowedTools: string, disallowedTools: string, addDirs: string[],
   *   mcpConfigFile?: string, cwd: string, systemPromptFile: string, timeoutMs: number }} options
   */
  constructor(options) {
    this.options = options;
    this.child = null;
    this.turns = 0;
    this.pending = null; // { resolve, reject, onText, text, timer }
    this.buf = "";
  }

  get alive() {
    return this.child !== null;
  }

  start() {
    const { bin, model, tools, allowedTools, disallowedTools, addDirs = [], mcpConfigFile, cwd, systemPromptFile } = this.options;
    const args = [
      "-p",
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--model", model,
      "--tools", tools,
      "--allowedTools", allowedTools,
      ...(disallowedTools ? ["--disallowedTools", disallowedTools] : []),
      ...addDirs.flatMap((d) => ["--add-dir", d]),
      "--append-system-prompt-file", systemPromptFile,
      "--no-session-persistence",
      "--strict-mcp-config",
      ...(mcpConfigFile ? ["--mcp-config", mcpConfigFile] : []),
    ];
    const win = process.platform === "win32";
    const child = spawn(win ? quoteForCmd(bin) : bin, win ? args.map(quoteForCmd) : args, {
      cwd,
      // 返事に関係のない通信（返事を書き終えた後に 3 秒ほどかかっていた）を止めて、完了を早める。
      env: { ...safeEnv(process.env), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" },
      shell: win, // Windows では claude.cmd を探すために必要（引数は上で引用符で囲んである）
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    this.turns = 0;
    this.buf = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + 1);
        if (line.trim()) this.#onLine(line);
      }
    });
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-2000)));
    child.on("error", (e) => {
      if (this.child !== child) return; // 止めた古い Claude Code の通知は無視する
      this.#fail(
        e.code === "ENOENT"
          ? "この PC で Claude Code（claude コマンド）が見つかりません。"
          : `Claude Code を起動できませんでした（${e.code || e.message}）。`,
      );
      this.child = null;
    });
    child.on("close", (code) => {
      if (this.child !== child) return; // 止めた古い Claude Code の通知は無視する
      this.child = null;
      if (this.pending) {
        console.error(`  Claude Code が終了しました（終了コード ${code}）: ${stderr.trim().slice(0, 300)}`);
        // 理由の手がかりを画面にも出す（Claude Code のエラー表示の最後の部分。キーは含まれない）。
        const reason = stderr.trim().split("\n").slice(-3).join(" ").slice(-300);
        this.#fail(`Claude Code がエラーで終了しました（終了コード ${code}）${reason ? `: ${reason}` : "。"}`);
      }
    });
  }

  stop() {
    const child = this.child;
    this.child = null;
    if (!child) return;
    child.stdin.end();
    if (process.platform === "win32" && child.pid) {
      // Windows では cmd.exe 経由で起動しているため、子の Claude Code ごと止める。
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } else {
      child.kill();
    }
  }

  /**
   * 1 回分の発言を送り、返事が終わるまで待つ。
   * @param {string} text
   * @param {(textSoFar: string) => void} [onText] 返事が書き足されるたびに、それまでの全文で呼ばれる
   * @returns {Promise<string>} 返事の全文
   */
  ask(text, onText) {
    if (this.pending) return Promise.reject(new Error("前の返事を作っている途中です。"));
    if (!this.child) this.start();
    this.turns++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // 途中で止まった Claude Code は捨てて、次の発言で起動し直す。
        this.#fail("時間内に返事ができませんでした。");
        this.stop();
      }, this.options.timeoutMs);
      this.pending = { resolve, reject, onText, text: "", timer };
      const msg = { type: "user", message: { role: "user", content: text } };
      this.child.stdin.write(JSON.stringify(msg) + "\n");
    });
  }

  #onLine(line) {
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    const p = this.pending;
    if (!p) return;

    if (ev.type === "stream_event") {
      const e = ev.event;
      // 道具（Web 検索など）を使う前後で文章が複数の塊に分かれるので、塊の間に空行を入れてつなぐ。
      if (e?.type === "content_block_start" && e.content_block?.type === "text") {
        if (p.text) p.text += "\n\n";
      } else if (e?.type === "content_block_delta" && e.delta?.type === "text_delta") {
        p.text += e.delta.text;
        p.onText?.(p.text);
      }
    } else if (ev.type === "result") {
      clearTimeout(p.timer);
      this.pending = null;
      if (ev.is_error || ev.subtype !== "success") {
        p.reject(new Error(`Claude Code がエラーを返しました（${ev.subtype}）。`));
      } else {
        p.resolve((p.text || String(ev.result ?? "")).trim());
      }
    }
  }

  #fail(message) {
    const p = this.pending;
    if (!p) return;
    clearTimeout(p.timer);
    this.pending = null;
    p.reject(new Error(message));
  }
}
