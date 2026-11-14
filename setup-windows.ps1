# DIMY（ディミ）：Windows 用の自動セットアップ
# PowerShell で次の1行を実行すると、必要なものを確認・インストールして、PC の起動時に自動で動くようにする。
#   irm https://raw.githubusercontent.com/dxdimix/dimy/main/setup-windows.ps1 | iex
# 何度実行しても問題ない（入っているものはそのまま使い、アプリは最新版に更新する。設定ファイル .env.local は引き継ぐ）。
# 一度セットアップすると、その後は常駐プログラムが GitHub の新しい版を自動で取り込む（agent/lib/updater.mjs）。

$ErrorActionPreference = "Stop"
$AppDir = Join-Path $HOME "dimy"
$Repo = "dxdimix/dimy"
# 以前の名前（キーミス、ジャービス）のときの場所。見つかったら設定を引き継ぎ、片付ける。
$OldDirs = @((Join-Path $HOME "kymis"), (Join-Path $HOME "jarvis"))

function Step($msg) { Write-Host ""; Write-Host "== $msg" -ForegroundColor Cyan }
function Ok($msg) { Write-Host "   OK: $msg" -ForegroundColor Green }
function Warn-Old($msg) { Write-Host "   注意: $msg" -ForegroundColor Yellow }
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

# 3. 動いているディミ（以前の名前のものも）を止める（ファイルを入れ替えるため）
Step "動いているディミを止めています"
$StopScript = Join-Path $AppDir "windows\stop-dimy.ps1"
$Dirs = @($AppDir) + $OldDirs
$Running = Get-CimInstance Win32_Process | Where-Object {
  $proc = $_
  $cmd = $proc.CommandLine
  $cmd -and (
    ($proc.Name -eq "wscript.exe" -and $cmd -like "*start-hidden.vbs*" -and @($Dirs | Where-Object { $cmd -like "*$_*" }).Count -gt 0) -or
    ($proc.Name -eq "cmd.exe" -and @($Dirs | Where-Object { $cmd -like "*$_\agent\logs*" }).Count -gt 0)
  )
} | Sort-Object { if ($_.Name -eq "wscript.exe") { 0 } else { 1 } }
foreach ($p in $Running) { taskkill.exe /pid $p.ProcessId /T /F | Out-Null }
if ($Running) { Start-Sleep -Seconds 2; Ok "止めました" } else { Ok "動いていませんでした" }

# 4. アプリ本体（最新版をダウンロード。設定ファイル .env.local は引き継ぐ）
Step "アプリをダウンロードしています"
# 最新版の番号を調べて、その版をダウンロードする（番号は .version に書き、自動更新で使う）
# （GitHub の API は回数制限があるため、git が使う窓口から調べる）
$Refs = Invoke-WebRequest -Uri "https://github.com/$Repo.git/info/refs?service=git-upload-pack" -Headers @{ "User-Agent" = "git/2.45 dimy-setup" } -UseBasicParsing
$RefsText = [Text.Encoding]::ASCII.GetString($Refs.RawContentStream.ToArray())
if ($RefsText -notmatch "([0-9a-f]{40}) refs/heads/main") { Fail "最新版の番号を取得できませんでした。少し待ってから、もう一度この1行を実行してください。" }
$Sha = $Matches[1]
$ZipUrl = "https://github.com/$Repo/archive/$Sha.zip"
$Tmp = Join-Path $env:TEMP ("dimy-setup-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $Tmp | Out-Null
$Zip = Join-Path $Tmp "app.zip"
Invoke-WebRequest -Uri $ZipUrl -OutFile $Zip -UseBasicParsing
Expand-Archive -Path $Zip -DestinationPath $Tmp
$Src = Get-ChildItem $Tmp -Directory | Select-Object -First 1 -ExpandProperty FullName
$EnvFile = Join-Path $AppDir ".env.local"
$OldEnvFile = $OldDirs | ForEach-Object { Join-Path $_ ".env.local" } | Where-Object { Test-Path $_ } | Select-Object -First 1
# 設定ファイルを引き継ぐ。新しい場所になければ、以前の名前の場所から持ってくる。
$SavedEnv = if (Test-Path $EnvFile) { [IO.File]::ReadAllBytes($EnvFile) } elseif ($OldEnvFile) { [IO.File]::ReadAllBytes($OldEnvFile) } else { $null }
if (Test-Path $AppDir) { Remove-Item $AppDir -Recurse -Force }
Move-Item $Src $AppDir
if ($SavedEnv) {
  # 設定の名前を、以前の「JARVIS_」「KYMIS_」から今の「DIMY_」に書き換える（値はそのまま）
  $Utf8 = New-Object System.Text.UTF8Encoding($false)
  $Text = $Utf8.GetString($SavedEnv) -replace "(?m)^(JARVIS|KYMIS)_", "DIMY_"
  [IO.File]::WriteAllText($EnvFile, $Text, $Utf8)
}
Remove-Item $Tmp -Recurse -Force
Set-Content -Path (Join-Path $AppDir ".version") -Value $Sha -NoNewline -Encoding ascii
Ok "保存先: $AppDir（版: $($Sha.Substring(0, 7))）"

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
$Link = $Shell.CreateShortcut((Join-Path $Startup "ディミ.lnk"))
$Link.TargetPath = "wscript.exe"
$Link.Arguments = "`"$Hidden`""
$Link.WorkingDirectory = $AppDir
$Link.Save()
Ok "スタートアップに登録しました"

# デスクトップに「停止」と「起動」のショートカットを作る
$Desktop = [Environment]::GetFolderPath("Desktop")
$Link = $Shell.CreateShortcut((Join-Path $Desktop "ディミを起動.lnk"))
$Link.TargetPath = "wscript.exe"
$Link.Arguments = "`"$Hidden`""
$Link.WorkingDirectory = $AppDir
$Link.Save()
$Link = $Shell.CreateShortcut((Join-Path $Desktop "ディミを停止.lnk"))
$Link.TargetPath = "powershell.exe"
$Link.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$StopScript`""
$Link.WorkingDirectory = $AppDir
$Link.Save()
Ok "デスクトップに「ディミを起動」「ディミを停止」を作りました"

# 以前の名前（キーミス、ジャービス）のショートカットとフォルダを片付ける
foreach ($old in @("キーミス", "ジャービス")) {
  $OldLinks = @((Join-Path $Startup "$old.lnk"), (Join-Path $Desktop "${old}を起動.lnk"), (Join-Path $Desktop "${old}を停止.lnk"))
  foreach ($l in $OldLinks) { if (Test-Path $l) { Remove-Item $l -Force } }
}
foreach ($OldDir in $OldDirs) {
  if (Test-Path $OldDir) {
    try { Remove-Item $OldDir -Recurse -Force; Ok "以前の名前のフォルダ（$OldDir）を片付けました" }
    catch { Warn-Old "以前の名前のフォルダ（$OldDir）を消せませんでした。PC を再起動したあとに、手で消してください。" }
  }
}

# 8. 起動
Step "ディミを起動します"
Start-Process wscript.exe -ArgumentList "`"$Hidden`"" -WorkingDirectory $AppDir
Write-Host ""
Write-Host "ディミが画面なしで動き始めました。ブラウザの画面右上に「PC: オンライン」と出れば準備完了です。" -ForegroundColor Green
Write-Host "次回からは、PC を起動するだけで自動で動きます。" -ForegroundColor Green
Write-Host "動きの記録: $AppDir\agent\logs\agent.log" -ForegroundColor Gray
