@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Avvia-apprendimento-nativo-dev.ps1"
exit /b %errorlevel%
