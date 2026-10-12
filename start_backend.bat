@echo off
cd /d "%~dp0"
if not exist "frontend\node_modules" (
    echo フロントエンドの依存関係をインストールしています...
    call npm --prefix frontend install
    if errorlevel 1 goto failed
)
echo フロントエンドをビルドしています...
call npm --prefix frontend run build
if errorlevel 1 goto failed
echo Perspective Ads バックエンドを起動しています...
py -3.10 backend\main.py
if errorlevel 1 goto failed
pause
exit /b 0

:failed
echo 起動に失敗しました。エラーを確認してください。
pause
exit /b 1
