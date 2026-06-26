@echo off
chcp 65001 >nul
rem ============================================================
rem  キャラ画像 オフセット調整ツールをワンクリックで開く
rem   1) ローカル開発サーバ(node server.mjs)を起動（別ウィンドウ・最小化）
rem   2) 既定ブラウザでツールを開く
rem  既に起動済みならサーバ側は EADDRINUSE で即終了するだけ（既存サーバを使う）。
rem ============================================================
setlocal
set PORT=5173
rem このbatの 1つ上＝リポジトリのルートへ移動（server.mjs がある場所）
cd /d "%~dp0.."

echo 開発サーバを起動中... (http://localhost:%PORT%)
start "AI Mahjong dev server" /min cmd /c "node server.mjs"

rem サーバ立ち上がりを少し待つ
timeout /t 2 /nobreak >nul

echo ツールを開きます...
start "" "http://localhost:%PORT%/tools/offset-tuner.html"

endlocal
