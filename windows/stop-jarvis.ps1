# ジャービスの常駐プログラム（画面なしで動いているもの）を止める。
$AppDir = Split-Path -Parent $PSScriptRoot
# 先に見張り役（start-hidden.vbs）を止めてから、常駐プログラムと Claude Code を止める。
$targets = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and (
    ($_.Name -eq "wscript.exe" -and $_.CommandLine -like "*$AppDir*start-hidden.vbs*") -or
    ($_.Name -eq "cmd.exe" -and $_.CommandLine -like "*$AppDir\agent\logs*")
  )
} | Sort-Object { if ($_.Name -eq "wscript.exe") { 0 } else { 1 } }
foreach ($p in $targets) { taskkill.exe /pid $p.ProcessId /T /F | Out-Null }
if ($targets) { Write-Host "ジャービスを停止しました。" } else { Write-Host "ジャービスは動いていませんでした。" }
