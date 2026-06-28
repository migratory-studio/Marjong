@echo off
rem ============================================================
rem  Open the Roguelite (Roukou-no-Yakata) designer with one click.
rem   1) Start the local dev server (node server.mjs) minimized.
rem   2) Open the designer in the default browser.
rem  If a server is already running, the new node exits with
rem  EADDRINUSE and the existing one is used.
rem
rem  NOTE: keep this file ASCII-only.
rem ============================================================
setlocal
set "PORT=5173"
set "URL=http://localhost:%PORT%/tools/roguelite-designer.html"

rem Move to the repo root (one level up from this tools\ folder).
cd /d "%~dp0.."

echo Starting dev server on http://localhost:%PORT% ...
start "AI Mahjong dev server" /min cmd /c "node server.mjs"

rem Give the server a moment to bind the port before opening the browser.
timeout /t 2 /nobreak >nul

echo Opening the designer in your browser ...
start "" "%URL%"

endlocal
