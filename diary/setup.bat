@echo off
REM ---------------------------------------------------------------------------
REM Verifications de premier lancement, partagees par diary.bat et diary-sync.bat.
REM Sort avec ERRORLEVEL 1 si l'environnement n'est pas utilisable.
REM ---------------------------------------------------------------------------

REM --- Node.js -----------------------------------------------------------------
where node >nul 2>&1
if not errorlevel 1 goto :check_env

echo.
echo   Node.js est necessaire et n'est pas installe sur ce PC.
echo.
where winget >nul 2>&1
if errorlevel 1 (
  echo   Installe-le depuis https://nodejs.org puis relance ce fichier.
  echo.
  exit /b 1
)

set /p INSTALL_NODE="  L'installer maintenant automatiquement ? [O/n] "
if /i "%INSTALL_NODE%"=="n" (
  echo   Abandon. Installe Node depuis https://nodejs.org puis relance.
  exit /b 1
)

echo.
echo   Installation de Node.js (quelques minutes, une seule fois)...
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
  echo.
  echo   L'installation a echoue. Installe Node depuis https://nodejs.org
  exit /b 1
)

REM winget ajoute Node au PATH, mais pas dans la fenetre deja ouverte.
echo.
echo   Node est installe. Ferme cette fenetre et relance ce fichier.
echo.
exit /b 1

REM --- Configuration Supabase --------------------------------------------------
:check_env
if exist "%~dp0.env" exit /b 0

echo.
echo   Premiere utilisation sur ce PC : il manque les acces a ta base.
echo   Recopie-les depuis un PC deja configure ^(fichier diary\.env^),
echo   ou depuis le tableau de bord Supabase ^(Project Settings ^> API^).
echo.

set /p SB_URL="  URL Supabase (https://xxxx.supabase.co) : "
if "%SB_URL%"=="" (
  echo   Aucune URL saisie, abandon.
  exit /b 1
)

set /p SB_KEY="  Cle anon : "
if "%SB_KEY%"=="" (
  echo   Aucune cle saisie, abandon.
  exit /b 1
)

>  "%~dp0.env" echo VITE_SUPABASE_URL=%SB_URL%
>> "%~dp0.env" echo VITE_SUPABASE_KEY=%SB_KEY%

echo.
echo   Configuration enregistree dans diary\.env — plus rien a saisir ensuite.
echo.
exit /b 0
