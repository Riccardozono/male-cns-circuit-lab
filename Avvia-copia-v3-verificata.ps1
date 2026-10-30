$ErrorActionPreference = 'Stop'
$trainingProject = [IO.Path]::GetFullPath($PSScriptRoot)
$trainingExecutable = Join-Path $trainingProject 'dist-learning-verified-v3-560\MAL-E-CNS-Circuit-Lab-portable-5.6.0-x64.exe'
$trainingProfile = Join-Path $trainingProject '.impeccable\training-copy-verified-v3-profile'
if (-not (Test-Path -LiteralPath $trainingExecutable -PathType Leaf)) {
    throw 'Copia V3 portable non compilata. Ricompilare in dist-learning-verified-v3-560; le release pubblicate non vengono modificate.'
}
Start-Process -FilePath $trainingExecutable -ArgumentList @('--user-data-dir="' + $trainingProfile + '"', '--male-cns-training-copy-v3')
