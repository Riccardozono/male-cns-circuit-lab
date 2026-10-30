$ErrorActionPreference = 'Stop'
$learningProject = [IO.Path]::GetFullPath($PSScriptRoot)
$learningExecutable = Join-Path $learningProject 'dist-learning-actuators-dev-560\win-unpacked\MAL-E CNS Circuit Lab.exe'
$learningProfile = Join-Path $learningProject '.impeccable\development-learning-profile'
if (-not (Test-Path -LiteralPath $learningExecutable -PathType Leaf)) {
    throw 'Copia di prova non compilata: electron-builder --dir --win --x64 --publish never --config.directories.output=dist-learning-actuators-dev-560.'
}
Start-Process -FilePath $learningExecutable -ArgumentList ('--user-data-dir="' + $learningProfile + '"') -WindowStyle Hidden
