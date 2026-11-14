// 右 Ctrl を 2 回続けて押したことを見張る（Windows のみ）。
// windows/hotkey.ps1 を画面なしで起動し、DOUBLE と書かれたら onDouble を呼ぶ。止まったら 10 秒後に起動し直す。
import { spawn } from "node:child_process";
import path from "node:path";

const RESTART_MS = 10_000;

export function startHotkeyWatch({ root, onDouble, log }) {
  if (process.platform !== "win32") return false;
  const script = path.join(root, "windows", "hotkey.ps1");
  let stopped = false;
  let failures = 0;

  const run = () => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", script, "-ParentId", String(process.pid)],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let buf = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line === "DOUBLE") onDouble();
        else if (line === "READY") {
          failures = 0;
          log("キーの見張り: 右 Ctrl を 2 回押すと、画面で話し始め・話し終わりができます。");
        } else if (line) log(`キーの見張り: ${line}`);
      }
    });
    let err = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => log(`キーの見張りを起動できませんでした（${e.message}）。`));
    child.on("exit", (code) => {
      if (stopped) return;
      failures++;
      log(`キーの見張りが止まりました（終了コード ${code}${err ? `: ${err.trim().split("\n")[0]}` : ""}）。`);
      // 何度も続けて失敗するときは、あきらめる（会話には影響しない）
      if (failures < 5) setTimeout(run, RESTART_MS);
    });
    process.on("exit", () => child.kill());
  };
  run();
  return () => {
    stopped = true;
  };
}
