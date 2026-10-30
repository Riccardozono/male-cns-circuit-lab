@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Avvia-campione-stato-neurale-cuda-dev.ps1"
if errorlevel 1 pause
