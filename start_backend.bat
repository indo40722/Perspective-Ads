@echo off
cd /d "%~dp0"
echo Starting Perspective Ads Backend...
py -3.10 backend\main.py
pause
