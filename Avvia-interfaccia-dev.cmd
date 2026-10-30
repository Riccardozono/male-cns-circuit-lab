@echo off
if not exist "%~dp0dist-first-person-dev-560\win-unpacked\MAL-E CNS Circuit Lab.exe" (
  echo Copia di prova non compilata. Usare Avvia-interfaccia-dev.ps1 per le istruzioni.
  pause
  exit /b 1
)
start "" "%~dp0dist-first-person-dev-560\win-unpacked\MAL-E CNS Circuit Lab.exe" --user-data-dir="%~dp0.impeccable\development-ui-profile"
