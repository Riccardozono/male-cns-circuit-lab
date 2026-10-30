@echo off
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0work\neural-statehead-brake-lock-main.cjs" --show --user-data-dir="%~dp0.impeccable\development-statehead-brake-lock-profile"
