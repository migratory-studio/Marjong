@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Mahjong RPG Launcher

set "PORT=5173"
set "URL=http://localhost:%PORT%"

rem --- Node.js check ---
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js が見つかりません / Node.js not found.
  echo https://nodejs.org/ からインストールしてください。
  echo.
  pause
  exit /b 1
)

rem --- already running? (port in use) -> just open the browser ---
netstat -ano | findstr ":%PORT%" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo サーバーは既に起動中です。ブラウザを開きます... / Already running.
  start "" "%URL%"
  exit /b 0
)

echo 麻雀RPG を起動します... / Starting Mahjong RPG
echo サーバー / server: %URL%
echo （サーバーウィンドウを閉じると停止します / close the server window to stop）
echo.

rem サーバーを別ウィンドウで起動 (ASCII title to avoid encoding issues)
start "Mahjong RPG Server" cmd /k "chcp 65001 >nul & node server.mjs"

rem サーバー起動を待ってからブラウザを開く
timeout /t 2 >nul
start "" "%URL%"

exit /b 0
