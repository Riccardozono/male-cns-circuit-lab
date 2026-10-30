$ErrorActionPreference = 'Stop'
$decoderProject = [IO.Path]::GetFullPath($PSScriptRoot)
$decoderExecutable = Join-Path $decoderProject 'dist-decoder6-dev-560\win-unpacked\MAL-E CNS Circuit Lab - Decoder 6 DEV.exe'
$decoderProfile = Join-Path $decoderProject '.impeccable\development-decoder6-profile'
if (-not (Test-Path -LiteralPath $decoderExecutable -PathType Leaf)) {
    throw 'La copia Windows sperimentale non è compilata. Consulta docs/DECODER6-SPERIMENTALE.md.'
}
# Separate profile: never load or replace the normal application's preferences.
Start-Process -FilePath $decoderExecutable -ArgumentList ('--user-data-dir="' + $decoderProfile + '"') -WindowStyle Hidden
