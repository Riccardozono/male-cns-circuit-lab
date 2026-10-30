@echo off
if not exist "%~dp0dist-learning-actuators-dev-560\win-unpacked\MAL-E CNS Circuit Lab.exe" (
  echo Copia di prova non compilata. Vedere Avvia-apprendimento-dev.ps1.
  pause
  exit /b 1
)
start "" "%~dp0dist-learning-actuators-dev-560\win-unpacked\MAL-E CNS Circuit Lab.exe" --user-data-dir="%~dp0.impeccable\development-learning-profile"
