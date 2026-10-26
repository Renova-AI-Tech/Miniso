@echo off
setlocal
cd /d "%~dp0..\.."
if not exist "logs" mkdir "logs"
node --env-file=.env scripts\linx\sync.mjs --days-back 2 --profile dashboard >> logs\linx-daily-sync.log 2>&1
exit /b %errorlevel%
