@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Mahjong RPG Launcher (DEBUG)

set "PORT=5173"
set "URL=http://localhost:%PORT%/?debug=1"

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

rem --- already running? (port in use) -> just open the browser in debug mode ---
netstat -ano | findstr ":%PORT%" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo サーバーは既に起動中です。デバッグモードで開きます... / Already running (debug).
  start "" "%URL%"
  exit /b 0
)

echo 麻雀RPG を【デバッグモード】で起動します... / Starting Mahjong RPG (DEBUG)
echo サーバー / server: http://localhost:%PORT%
echo デバッグ: シナリオ全解放（?debug=1） / debug: all scenarios unlocked
echo （サーバーウィンドウを閉じると停止します / close the server window to stop）
echo.

rem サーバーを別ウィンドウで起動 (ASCII title to avoid encoding issues)
start "Mahjong RPG Server" cmd /k "chcp 65001 >nul & node server.mjs"

rem サーバー起動を待ってからブラウザをデバッグモードで開く
timeout /t 2 >nul
start "" "%URL%"

exit /b 0
