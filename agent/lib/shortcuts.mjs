// デスクトップのショートカットを、今の決まりに合わせる（Windows・自動更新される本体のフォルダだけ）。
// - 「ディミを再起動」を作る（更新を反映させたいときに使う）
// - 以前の「ディミを起動」「ディミを停止」は片付ける
// セットアップをやり直さなくても、自動更新で届いた版が起動したときに直るようにするため。
// コマンドの引数に日本語を直接書くと Windows で崩れるので、PowerShell には -EncodedCommand（UTF-16）で渡す。

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export function ensureDesktopShortcuts({ root, log }) {
  if (process.platform !== "win32") return;
  if (!fs.existsSync(path.join(root, ".version"))) return; // 開発用のフォルダでは作らない
  const restart = path.join(root, "windows", "restart-dimy.ps1");
  if (!fs.existsSync(restart)) return;
  const q = (s) => s.replace(/'/g, "''");
  const script = [
    "$Desktop = [Environment]::GetFolderPath('Desktop')",
    "$Shell = New-Object -ComObject WScript.Shell",
    "$Link = $Shell.CreateShortcut((Join-Path $Desktop 'ディミを再起動.lnk'))",
    "$Link.TargetPath = 'powershell.exe'",
    `$Link.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${q(restart)}"'`,
    `$Link.WorkingDirectory = '${q(root)}'`,
    "$Link.Save()",
    "foreach ($l in @('ディミを起動.lnk', 'ディミを停止.lnk')) { $f = Join-Path $Desktop $l; if (Test-Path $f) { Remove-Item $f -Force } }",
  ].join("\n");
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], { windowsHide: true, stdio: "ignore" });
  child.on("error", (e) => log(`デスクトップのショートカットを直せませんでした（${e.message}）。`));
}
