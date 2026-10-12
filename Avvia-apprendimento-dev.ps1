$ErrorActionPreference = 'Stop'
$appProject = [IO.Path]::GetFullPath($PSScriptRoot)
$appExecutable = Join-Path $appProject 'dist-learning-dev-560\win-unpacked\MAL-E CNS Circuit Lab.exe'
$appProfile = Join-Path $appProject '.impeccable\development-learning-profile'
if (-not (Test-Path -LiteralPath $appExecutable -PathType Leaf)) {
    throw 'Copia di sviluppo non compilata: eseguire electron-builder --dir --win --x64 --publish never --config.directories.output=dist-learning-dev-560.'
}
Start-Process -FilePath $appExecutable -ArgumentList ('--user-data-dir="' + $appProfile + '"') -WindowStyle Hidden
