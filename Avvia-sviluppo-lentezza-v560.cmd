@echo off
setlocal
set "learningProject=%~dp0."
set "learningExecutable=%~dp0node_modules\electron\dist\electron.exe"
set "learningProfile=%~dp0.impeccable\moving-pace-development-profile"
if not exist "%learningExecutable%" (
  echo Electron non trovato nella cartella del progetto.
  echo Installa le dipendenze del progetto prima di avviare la copia di sviluppo.
  pause
  exit /b 1
)
set "ELECTRON_RUN_AS_NODE="
start "" "%learningExecutable%" "%learningProject%" "--user-data-dir=%learningProfile%" --male-cns-training-copy-v3
endlocal
