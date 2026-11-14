# デスクトップ PC に、開発用のフォルダ（C:\Users\<名前>\dev）を用意する。
# GitHub のリポジトリを取り寄せ（すでにあれば最新にし）、Remote Control でどの端末からでも作業できるようにする準備。
#   irm https://raw.githubusercontent.com/dxdimix/dimy/main/setup-dev-windows.ps1 | iex
# 何度実行しても問題ない。手元で変更中のフォルダは、上書きせずにそのまま残す。

$ErrorActionPreference = "Stop"
$Owner = "dxdimix"
$DevDir = Join-Path $HOME "dev"
# 取り寄せるリポジトリ（増やすときはここに足す）
$Repos = @(
  "fx-signal-monitor",
  "kabu-signal-monitor",
  "umsheet-web",
  "nencho-helper",
  "medical-equipment-manager",
  "dimy",
  "sedori-system",
  "keiba-optimizer"
)

function Step($msg) { Write-Host ""; Write-Host "== $msg" -ForegroundColor Cyan }
function Ok($msg) { Write-Host "   OK: $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "   注意: $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host ""; Write-Host "!! $msg" -ForegroundColor Red; Read-Host "Enter キーで終了します"; exit 1 }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [Environment]::GetEnvironmentVariable("Path", "User")
}
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

Refresh-Path

# 1. Git
Step "Git を確認しています"
if (Has "git") {
  Ok "インストール済み（$(git --version)）"
} else {
  if (-not (Has "winget")) { Fail "Git が入っていません。https://git-scm.com/download/win から入れてから、もう一度この1行を実行してください。" }
  Write-Host "   Git をインストールします（数分かかります。確認画面が出たら「はい」を押してください）"
  winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements
  Refresh-Path
  if (-not (Has "git")) { Fail "Git のインストールを確認できませんでした。PowerShell を開き直して、もう一度この1行を実行してください。" }
  Ok "インストールしました（$(git --version)）"
}

# 2. 開発用フォルダ
Step "開発用フォルダを用意しています"
New-Item -ItemType Directory -Path $DevDir -Force | Out-Null
Ok $DevDir

# 2-2. 以前の名前（kymis、jarvis）のフォルダを「dimy」に変える（手元に変更がなければ）
$NewDev = Join-Path $DevDir "dimy"
foreach ($oldName in @("kymis", "jarvis")) {
  $OldDev = Join-Path $DevDir $oldName
  if (-not (Test-Path (Join-Path $OldDev ".git")) -or (Test-Path $NewDev)) { continue }
  $ErrorActionPreference = "Continue"
  $changes = git -C $OldDev status --porcelain
  if ($changes) {
    Warn "dev\$oldName に手元の変更があるので、名前を変えずに残します（変更を GitHub に送ってから、もう一度この1行を実行してください）"
  } else {
    git -C $OldDev remote set-url origin "https://github.com/$Owner/dimy.git"
    try { Rename-Item $OldDev "dimy"; Ok "dev\$oldName を dev\dimy に名前を変えました" }
    catch { Warn "dev\$oldName の名前を変えられませんでした（開いているプログラムを閉じてから、もう一度この1行を実行してください）" }
  }
  $ErrorActionPreference = "Stop"
}

# 3. リポジトリを取り寄せる
Step "GitHub からリポジトリを取り寄せています"
Write-Host "   初めてのときは、GitHub へのログイン画面（ブラウザ）が開きます。dxdimix のアカウントでログインしてください。" -ForegroundColor Yellow
$ErrorActionPreference = "Continue" # git の進み具合の表示をエラー扱いしないため
$Done = @(); $Skipped = @(); $Failed = @()
foreach ($r in $Repos) {
  $dir = Join-Path $DevDir $r
  if (Test-Path (Join-Path $dir ".git")) {
    $changes = git -C $dir status --porcelain
    if ($changes) {
      Warn "$r は手元に変更があるので、最新にせずそのままにします"
      $Skipped += $r
      continue
    }
    git -C $dir pull --ff-only --quiet
    if ($LASTEXITCODE -eq 0) { Ok "$r（最新にしました）"; $Done += $r } else { Warn "$r を最新にできませんでした"; $Failed += $r }
  } elseif (Test-Path $dir) {
    Warn "$dir は git のフォルダではないので、触らずに飛ばします"
    $Skipped += $r
  } else {
    git clone --quiet "https://github.com/$Owner/$r.git" $dir
    if ($LASTEXITCODE -eq 0) { Ok "$r（取り寄せました）"; $Done += $r } else { Warn "$r を取り寄せられませんでした"; $Failed += $r }
  }
}
$ErrorActionPreference = "Stop"

# 4. すべてのセッションが読む決まり（CLAUDE.md）を置く
Step "開発の決まりを置いています"
# 4-1. dev の中で作業するセッションが読む決まり（全文）。元は dimy リポジトリの windows/dev-CLAUDE.md
$RulesUrl = "https://raw.githubusercontent.com/$Owner/dimy/main/windows/dev-CLAUDE.md"
try {
  Invoke-WebRequest -Uri $RulesUrl -OutFile (Join-Path $DevDir "CLAUDE.md") -UseBasicParsing
  Ok "$DevDir\CLAUDE.md"
} catch {
  Warn "決まりのファイルを取得できませんでした（$($_.Exception.Message)）"
}
# 4-2. この PC のすべてのセッションが読む決まり（短い一文）。今の中身は残し、印で囲んだ部分だけを入れ替える
$UserClaudeDir = Join-Path $HOME ".claude"
$UserClaude = Join-Path $UserClaudeDir "CLAUDE.md"
$Begin = "<!-- BEGIN: dimy dev rule -->"
$End = "<!-- END: dimy dev rule -->"
$Block = @"
$Begin
## 開発する場所（ディミ DIMY が管理）
- アプリ・システムの開発は、必ず ``$DevDir\<アプリ名>`` で行う。新しく作るときもここに作る。
- 詳しい決まりは ``$DevDir\CLAUDE.md`` を読むこと。
$End
"@
New-Item -ItemType Directory -Path $UserClaudeDir -Force | Out-Null
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$Current = if (Test-Path $UserClaude) { [IO.File]::ReadAllText($UserClaude, $Utf8) } else { "" }
# 以前の名前（kymis、jarvis）の印で囲んだ部分も、新しい内容に入れ替える
$Pattern = "(?s)<!-- BEGIN: (dimy|kymis|jarvis) dev rule -->.*?<!-- END: (dimy|kymis|jarvis) dev rule -->"
if ($Current -match $Pattern) {
  $New = [regex]::Replace($Current, $Pattern, { param($m) $Block.Trim() })
} else {
  $Sep = if ($Current.Trim()) { "`r`n`r`n" } else { "" }
  $New = $Current.TrimEnd() + $Sep + $Block.Trim() + "`r`n"
}
[IO.File]::WriteAllText($UserClaude, $New, $Utf8)
Ok "$UserClaude（ほかの内容はそのまま残しています）"

# 5. 結果
Step "結果"
Write-Host "   用意できた: $($Done.Count) 個 / 飛ばした: $($Skipped.Count) 個 / 失敗: $($Failed.Count) 個"
if ($Failed.Count) { Write-Host "   失敗したもの: $($Failed -join ', ')" -ForegroundColor Red }
Write-Host ""
Write-Host "開発用フォルダ: $DevDir" -ForegroundColor Green
Write-Host "このフォルダの中で作業すると、ディミ本体（$HOME\dimy、自動更新で上書きされる）とは別に開発できます。" -ForegroundColor Green
