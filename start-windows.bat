@echo off
rem Double-click this file to start the K.Y.M.I.S agent on this PC.
cd /d "%~dp0"
where node >NUL 2>&1 || (echo Node.js is not installed. See README. & pause & exit /b 1)
where claude >NUL 2>&1 || (echo Claude Code [claude command] is not installed. See README. & pause & exit /b 1)
if not exist .env.local (echo .env.local is missing. Copy .env.example to .env.local and fill in the values. & pause & exit /b 1)
if not exist node_modules (call npm install || (pause & exit /b 1))
:run
node agent\index.mjs
rem Exit code 4 = the agent updated itself. Start it again.
if %errorlevel%==4 goto run
pause
