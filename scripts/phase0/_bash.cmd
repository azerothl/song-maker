@echo off
setlocal EnableExtensions
rem Lance un script .sh Phase 0 via Git Bash (pas WSL) pour des chemins Windows natifs.
rem Usage: _bash.cmd script.sh [args...]

if "%~1"=="" (
  echo Usage: %~nx0 script.sh [args...]
  exit /b 1
)

set "SCRIPT=%~1"
if not exist "%SCRIPT%" (
  echo ERREUR: script introuvable: %SCRIPT%
  exit /b 1
)

set "BASH_EXE="
if exist "%ProgramFiles%\Git\bin\bash.exe" set "BASH_EXE=%ProgramFiles%\Git\bin\bash.exe"
if not defined BASH_EXE if exist "%ProgramFiles(x86)%\Git\bin\bash.exe" set "BASH_EXE=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not defined BASH_EXE if exist "%LOCALAPPDATA%\Programs\Git\bin\bash.exe" set "BASH_EXE=%LOCALAPPDATA%\Programs\Git\bin\bash.exe"

if not defined BASH_EXE (
  for /f "delims=" %%I in ('where bash 2^>nul') do (
    echo %%I | findstr /I /C:"\Git\bin\bash.exe" /C:"\Git\usr\bin\bash.exe" >nul
    if not errorlevel 1 (
      set "BASH_EXE=%%I"
      goto :have_bash
    )
  )
)

:have_bash
if not defined BASH_EXE (
  echo ERREUR: Git Bash introuvable.
  echo Installez Git for Windows: https://git-scm.com/download/win
  exit /b 1
)

rem Refuse WSL bash (System32) — chemins Linux incompatibles avec le cache Tauri Windows.
echo %BASH_EXE% | findstr /I /C:"\System32\bash.exe" /C:"\SysWOW64\bash.exe" >nul
if not errorlevel 1 (
  echo ERREUR: bash pointe vers WSL ^(%BASH_EXE%^).
  echo Utilisez Git for Windows pour les scripts Phase 0 sur Windows.
  exit /b 1
)

"%BASH_EXE%" %*
exit /b %ERRORLEVEL%
