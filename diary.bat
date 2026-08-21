@echo off
title MTG Training Diary
cd /d "%~dp0"

REM Verifie Node et la configuration, les installe/demande si besoin.
call diary\setup.bat
if errorlevel 1 (
  pause
  exit /b 1
)

REM Premiere utilisation : dependances du front.
if not exist "diary\node_modules" (
  echo Premiere utilisation, installation des dependances...
  pushd diary
  call npm install
  popd
  if errorlevel 1 (
    echo Echec de l'installation.
    pause
    exit /b 1
  )
)

REM Rattrape ce qui a ete joue depuis la derniere fois, avant d'ouvrir l'app.
echo.
echo Lecture du Player.log d'Arena...
node diary\sync\sync.js
echo.

REM Puis surveille le log en continu, dans sa propre fenetre : les drafts et
REM matchs joues pendant que l'app est ouverte remontent tout seuls.
start "Diary - synchro Arena" /min cmd /c "node diary\sync\sync.js --watch"

pushd diary
call npm run dev
popd
