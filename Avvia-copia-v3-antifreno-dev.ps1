$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath($PSScriptRoot)
$electron = Join-Path $project 'node_modules\electron\dist\electron.exe'
$entry = Join-Path $project 'work\neural-statehead-brake-lock-main.cjs'
$profile = Join-Path $project '.impeccable\development-statehead-brake-lock-profile'
if (-not (Test-Path -LiteralPath $electron -PathType Leaf)) { throw 'Runtime Electron locale non trovato.' }
if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) { throw 'Copia V3 anti-freno-bloccato non trovata.' }
Start-Process -FilePath $electron -WorkingDirectory $project -ArgumentList @('"' + $entry + '"','--show','--user-data-dir="' + $profile + '"')
