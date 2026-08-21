@echo off
title MTG Training Diary - synchro
cd /d "%~dp0"

REM Synchro seule, sans ouvrir l'app. N'a besoin que de Node.
call diary\setup.bat
if errorlevel 1 (
  pause
  exit /b 1
)

node diary\sync\sync.js
echo.
pause
