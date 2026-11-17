@echo off
setlocal
set "electron=%~dp0node_modules\electron\dist\electron.exe"
set "trial=%~1"
if not defined trial if exist "%~dp0.impeccable\review\learning-ml\progress407-reward-refinement\prova-v3-monza-ricompense.json.gz" set "trial=%~dp0.impeccable\review\learning-ml\progress407-reward-refinement\prova-v3-monza-ricompense.json.gz"
if not defined trial set "trial=%~dp0.impeccable\review\learning-ml\progress404-desktop-imitation\prova-v3-monza.json.gz"
set "testProfile=%~2"
if not defined testProfile set "testProfile=MaleCNS-CircuitLab-V3-Test"
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
start "" /D "%~dp0." "%electron%" . --male-cns-training-copy-v3-baseline --imitation-trial="%trial%" --user-data-dir="%LOCALAPPDATA%\%testProfile%"
