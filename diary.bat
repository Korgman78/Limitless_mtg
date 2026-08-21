@echo off
REM Lance le MTG Training Diary et ouvre le navigateur.
REM Garder cette fenetre ouverte tant que l'app est utilisee.
cd /d "%~dp0diary"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Node.js est introuvable. Installe-le depuis https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo.
  echo   Fichier diary\.env manquant.
  echo   Copie diary\.env.example vers diary\.env et renseigne :
  echo     VITE_SUPABASE_URL
  echo     VITE_SUPABASE_KEY
  echo.
  pause
  exit /b 1
)

REM Premiere utilisation sur ce poste : installe les dependances du front.
if not exist "node_modules" (
  echo Premiere utilisation, installation des dependances...
  call npm install
  if errorlevel 1 (
    echo Echec de l'installation.
    pause
    exit /b 1
  )
)

npm run dev
