@echo off
setlocal
set "APP=%~dp0dist-learning-frontier-v3-560\MAL-E-CNS-Circuit-Lab-portable-5.6.0-x64.exe"
set "PROFILE=%~dp0.impeccable\training-copy-frontier-v3-560-profile"
if not exist "%APP%" (
  echo Portable di verifica non trovato: "%APP%"
  pause
  exit /b 1
)
start "" "%APP%" --user-data-dir="%PROFILE%" --male-cns-training-copy-v3
