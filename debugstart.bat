@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Mahjong RPG Launcher (DEBUG)

set "PORT=5173"
set "URL=http://localhost:%PORT%/?debug=tsumoreba"

rem --- Node.js check ---
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install from https://nodejs.org/
  pause
  exit /b 1
)

rem --- already running? (port in use) -> just open browser in debug mode ---
netstat -ano | findstr ":%PORT%" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo Server already running. Opening browser in DEBUG mode...
  start "" "%URL%"
  exit /b 0
)

echo Starting Mahjong RPG in DEBUG mode...
echo server: http://localhost:%PORT%
echo DEBUG: all scenarios unlocked via ?debug=tsumoreba
echo (close the server window to stop)
echo.

start "Mahjong RPG Server" cmd /k "chcp 65001 >nul & node server.mjs"
timeout /t 2 >nul
start "" "%URL%"

exit /b 0
