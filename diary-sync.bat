@echo off
REM Rattrape les drafts joues sans overlay, depuis le Player.log d'Arena.
REM N'a besoin que de Node : aucune dependance a installer.
REM Idempotent : relancer ne duplique rien.
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Node.js est introuvable. Installe-le depuis https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist "diary\.env" (
  echo.
  echo   Fichier diary\.env manquant.
  echo   Copie diary\.env.example vers diary\.env et renseigne tes cles Supabase.
  echo.
  pause
  exit /b 1
)

node diary\sync\sync.js
echo.
pause
