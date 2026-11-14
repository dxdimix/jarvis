' Starts the DIMY agent without a window (used by the Windows startup shortcut).
' If the agent stops unexpectedly, it is started again after 10 seconds.
' Exit code 3 from the agent means "do not restart" (already running, or settings are missing).
' Exit code 4 means "updated itself, restart now".
Option Explicit
Dim sh, fso, appDir, logDir, logFile, code
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
logDir = appDir & "\agent\logs"
logFile = logDir & "\agent.log"
If Not fso.FolderExists(logDir) Then fso.CreateFolder logDir
sh.CurrentDirectory = appDir

Do
  ' Keep the log small: move it aside when it grows over 1 MB.
  If fso.FileExists(logFile) Then
    If fso.GetFile(logFile).Size > 1048576 Then fso.CopyFile logFile, logFile & ".old", True : fso.DeleteFile logFile
  End If
  code = sh.Run("cmd /c node agent\index.mjs >> """ & logFile & """ 2>&1", 0, True)
  If code = 3 Then Exit Do
  If code <> 4 Then WScript.Sleep 10000
Loop
