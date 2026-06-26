@echo off
rem ============================================================
rem  Open the character dialogue (text lines) editor with one click.
rem   1) Start the local dev server (node server.mjs) in a
rem      separate, minimized window.
rem   2) Open the editor in the default browser.
rem  If a server is already running, the new node just exits
rem  with EADDRINUSE and the existing one is used.
rem
rem  NOTE: keep this file ASCII-only. Mixing `chcp 65001` with
rem  non-ASCII bytes breaks cmd's batch parser mid-file.
rem ============================================================
setlocal
set "PORT=5173"
set "URL=http://localhost:%PORT%/tools/dialogue-editor.html"

rem Move to the repo root (one level up from this tools\ folder).
cd /d "%~dp0.."

echo Starting dev server on http://localhost:%PORT% ...
start "AI Mahjong dev server" /min cmd /c "node server.mjs"

rem Give the server a moment to bind the port before opening the browser.
timeout /t 2 /nobreak >nul

echo Opening the editor in your browser ...
start "" "%URL%"

endlocal
