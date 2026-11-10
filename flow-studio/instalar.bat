@echo off
chcp 65001 >nul
title Flow Studio - Instalacion
echo.
echo  === Instalando lo que necesita Flow Studio (tarda unos minutos) ===
echo.
where node >nul 2>nul || winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
where ffmpeg >nul 2>nul || winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
where yt-dlp >nul 2>nul || winget install -e --id yt-dlp.yt-dlp --accept-source-agreements --accept-package-agreements
where python >nul 2>nul || winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements
where claude >nul 2>nul || powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://claude.ai/install.ps1 | iex"
echo.
echo  Si alguna instalacion acaba de terminar, CIERRA esta ventana y vuelve a abrir instalar.bat una vez mas.
echo.
where node >nul 2>nul || (echo  Falta Node: cierra y vuelve a abrir instalar.bat & pause & exit /b)
cd /d "%~dp0"
call npm install
python -m pip install --upgrade faster-whisper
node tools\prep-chrome.js
echo.
echo  === Listo. Ahora abre una terminal, escribe  claude  e inicia sesion con tu cuenta de Claude (solo la primera vez). ===
echo  Despues usa  abrir.bat  para trabajar.
pause
