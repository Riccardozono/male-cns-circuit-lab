@echo off
setlocal
cd /d "%~dp0..\.."
if not exist "node_modules\electron\dist\electron.exe" (
  echo Dipendenze non disponibili. Esegui npm install nella cartella del progetto.
  pause
  exit /b 1
)
"node_modules\electron\dist\electron.exe" . "--user-data-dir=%LOCALAPPDATA%\MAL-E-CNS-landscape-preview"
