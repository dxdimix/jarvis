# ディミ（DIMY）を再起動する（デスクトップの「ディミを再起動」から使う。更新を反映させたいときに）。
# 止めてから起動し直す。起動するとすぐに新しい版を確かめ、あれば更新してから動く（DIMY_UPDATE_NOW）。
$AppDir = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot "stop-dimy.ps1") | Out-Null
Start-Sleep -Seconds 2
$env:DIMY_UPDATE_NOW = "1"
Start-Process -FilePath "wscript.exe" -ArgumentList "`"$(Join-Path $AppDir 'windows\start-hidden.vbs')`"" -WorkingDirectory $AppDir
(New-Object -ComObject WScript.Shell).Popup("ディミを再起動しました。新しい版があれば、1 分ほどで入れ替わります。", 5, "ディミ", 64) | Out-Null
