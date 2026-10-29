@echo off
chcp 65001 >nul
title Flow Studio
cd /d "%~dp0"
node tools\prep-chrome.js
set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe
start "" "%CHROME%" --remote-debugging-port=9222 --user-data-dir="%~dp0chrome-profile" --no-first-run "https://labs.google/fx/tools/flow"
timeout /t 2 >nul
start "" http://localhost:4000
node server.js
pause
