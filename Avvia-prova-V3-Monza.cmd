@echo off
setlocal
set "electron=%~dp0node_modules\electron\dist\electron.exe"
set "trial=%~1"
if not defined trial set "trial=%~dp0.impeccable\review\learning-ml\progress404-desktop-imitation\prova-v3-monza.json.gz"
if not exist "%electron%" (
  echo Electron non disponibile. Installa le dipendenze del progetto con npm ci.
  pause
  exit /b 1
)
if not exist "%trial%" (
  echo Bundle V3 non trovato. Specifica il percorso del decoder di prova.
  pause
  exit /b 1
)
start "" /D "%~dp0." "%electron%" . --male-cns-training-copy-v3-baseline --imitation-trial="%trial%" --user-data-dir="%LOCALAPPDATA%\MaleCNS-CircuitLab-V3-Test"
