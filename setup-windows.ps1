# ジャービス：Windows 用の自動セットアップ
# PowerShell で次の1行を実行すると、必要なものを確認・インストールして、PC の起動時に自動で動くようにする。
#   irm https://raw.githubusercontent.com/dxdimix/jarvis/main/setup-windows.ps1 | iex
# 何度実行しても問題ない（入っているものはそのまま使い、アプリは最新版に更新する。設定ファイル .env.local は引き継ぐ）。

$ErrorActionPreference = "Stop"
$AppDir = Join-Path $HOME "jarvis"
$ZipUrl = "https://github.com/dxdimix/jarvis/archive/refs/heads/main.zip"

function Step($msg) { Write-Host ""; Write-Host "== $msg" -ForegroundColor Cyan }
function Ok($msg) { Write-Host "   OK: $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host ""; Write-Host "!! $msg" -ForegroundColor Red; Read-Host "Enter キーで終了します"; exit 1 }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [Environment]::GetEnvironmentVariable("Path", "User") + ";" +
              (Join-Path $HOME ".local\bin")
}
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
# npm で入れた claude.ps1 は実行ポリシーで止まることがあるため、.exe / .cmd を優先して使う。
function Claude-Path {
  $c = Get-Command claude.exe, claude.cmd -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { $c.Source } else { $null }
}
function Test-Claude {
  # 古い PowerShell は日本語をパイプで渡すと文字化けするため、確認の文は英語にする。
  $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  $out = "Reply with OK only" | & (Claude-Path) -p --no-session-persistence --tools WebSearch 2>&1
  $code = $LASTEXITCODE; $ErrorActionPreference = $prev
  return @{ Ok = ($code -eq 0); Out = ($out | Out-String) }
}
# .env.local の 4 つの値が、見本のままでなく入っているか
function Test-EnvFile($path) {
  if (-not (Test-Path $path)) { return $false }
  $text = Get-Content $path -Raw -Encoding UTF8
  foreach ($key in "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_URL", "SUPABASE_SECRET_KEY") {
    $m = [regex]::Match($text, "(?m)^$key=(.+)$")
    if (-not $m.Success -or $m.Groups[1].Value -match "xxxx|example") { return $false }
  }
  return $true
}

Refresh-Path

# 1. Node.js
Step "Node.js を確認しています"
if (Has "node") {
  Ok "インストール済み（$(node --version)）"
} else {
  if (-not (Has "winget")) {
    Fail "Node.js が入っていません。https://nodejs.org/ja から LTS 版を入れてから、もう一度この1行を実行してください。"
  }
  Write-Host "   Node.js をインストールします（数分かかります。確認画面が出たら「はい」を押してください）"
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  Refresh-Path
  if (-not (Has "node")) { Fail "Node.js のインストールを確認できませんでした。PC を再起動してから、もう一度この1行を実行してください。" }
  Ok "インストールしました（$(node --version)）"
}

# 2. Claude Code
Step "Claude Code を確認しています"
if (Claude-Path) {
  Ok "インストール済み（$(& (Claude-Path) --version)）"
} else {
  Write-Host "   Claude Code をインストールします"
  Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression
  Refresh-Path
  if (-not (Claude-Path)) { Fail "Claude Code のインストールを確認できませんでした。PowerShell を開き直して、もう一度この1行を実行してください。" }
  Ok "インストールしました"
}

# 3. 動いているジャービスを止める（ファイルを入れ替えるため）
$StopScript = Join-Path $AppDir "windows\stop-jarvis.ps1"
if (Test-Path $StopScript) {
  Step "動いているジャービスを止めています"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $StopScript
  Start-Sleep -Seconds 2
}

# 4. アプリ本体（最新版をダウンロード。設定ファイル .env.local は引き継ぐ）
Step "アプリをダウンロードしています"
$Tmp = Join-Path $env:TEMP ("jarvis-setup-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $Tmp | Out-Null
$Zip = Join-Path $Tmp "app.zip"
Invoke-WebRequest -Uri $ZipUrl -OutFile $Zip -UseBasicParsing
Expand-Archive -Path $Zip -DestinationPath $Tmp
$Src = Join-Path $Tmp "jarvis-main"
$EnvFile = Join-Path $AppDir ".env.local"
$SavedEnv = if (Test-Path $EnvFile) { [IO.File]::ReadAllBytes($EnvFile) } else { $null }
if (Test-Path $AppDir) { Remove-Item $AppDir -Recurse -Force }
Move-Item $Src $AppDir
if ($SavedEnv) { [IO.File]::WriteAllBytes($EnvFile, $SavedEnv) }
Remove-Item $Tmp -Recurse -Force
Ok "保存先: $AppDir"

Step "必要な部品を準備しています（初回は数分かかります）"
Push-Location $AppDir
npm.cmd install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "部品の準備に失敗しました。上に表示されたエラーを確認してください。" }
Pop-Location
Ok "準備できました"

# 5. 設定ファイル（Supabase の URL とキー）
Step "設定ファイルを確認しています"
if (-not (Test-EnvFile $EnvFile)) {
  if (-not (Test-Path $EnvFile)) { Copy-Item (Join-Path $AppDir ".env.example") $EnvFile }
  Write-Host "   メモ帳で設定ファイルを開きます。Supabase の値を 4 か所に貼り付けて、保存してからメモ帳を閉じてください。" -ForegroundColor Yellow
  Write-Host "   （値の場所: Supabase の Project Settings の「Data API」と「API Keys」）" -ForegroundColor Yellow
  Start-Process notepad.exe -ArgumentList "`"$EnvFile`"" -Wait
  if (-not (Test-EnvFile $EnvFile)) { Fail "設定ファイルに値が入っていないようです。もう一度この1行を実行してください。" }
}
Ok "設定ファイル: $EnvFile"

# 6. Claude Code にログインしているか確認する
Step "Claude Code のログインを確認しています"
$check = Test-Claude
if (-not $check.Ok) {
  Write-Host "   まだログインしていないようです。これから Claude Code の画面が開きます。" -ForegroundColor Yellow
  Write-Host "   画面の案内に従って Claude のアカウントでログインし、終わったら /exit と入力してください。" -ForegroundColor Yellow
  Read-Host "   準備ができたら Enter キーを押してください"
  & (Claude-Path)
  $check = Test-Claude
  if (-not $check.Ok) { Fail "ログインを確認できませんでした。もう一度この1行を実行してください。`n$($check.Out)" }
}
Ok "ログイン済みです"

# 7. PC の起動時に自動で動くようにする（スタートアップにショートカットを置く）
Step "PC の起動時に自動で動くようにしています"
$Shell = New-Object -ComObject WScript.Shell
$Hidden = Join-Path $AppDir "windows\start-hidden.vbs"
$Startup = [Environment]::GetFolderPath("Startup")
$Link = $Shell.CreateShortcut((Join-Path $Startup "ジャービス.lnk"))
$Link.TargetPath = "wscript.exe"
$Link.Arguments = "`"$Hidden`""
$Link.WorkingDirectory = $AppDir
$Link.Save()
Ok "スタートアップに登録しました"

# デスクトップに「停止」と「起動」のショートカットを作る
$Desktop = [Environment]::GetFolderPath("Desktop")
$Link = $Shell.CreateShortcut((Join-Path $Desktop "ジャービスを起動.lnk"))
$Link.TargetPath = "wscript.exe"
$Link.Arguments = "`"$Hidden`""
$Link.WorkingDirectory = $AppDir
$Link.Save()
$Link = $Shell.CreateShortcut((Join-Path $Desktop "ジャービスを停止.lnk"))
$Link.TargetPath = "powershell.exe"
$Link.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$StopScript`""
$Link.WorkingDirectory = $AppDir
$Link.Save()
Ok "デスクトップに「ジャービスを起動」「ジャービスを停止」を作りました"

# 8. 起動
Step "ジャービスを起動します"
Start-Process wscript.exe -ArgumentList "`"$Hidden`"" -WorkingDirectory $AppDir
Write-Host ""
Write-Host "ジャービスが画面なしで動き始めました。ブラウザの画面右上に「PC: オンライン」と出れば準備完了です。" -ForegroundColor Green
Write-Host "次回からは、PC を起動するだけで自動で動きます。" -ForegroundColor Green
Write-Host "動きの記録: $AppDir\agent\logs\agent.log" -ForegroundColor Gray
