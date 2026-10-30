$ErrorActionPreference = 'Stop'
$uiProject = [IO.Path]::GetFullPath($PSScriptRoot)
$uiExecutable = Join-Path $uiProject 'dist-first-person-dev-560\win-unpacked\MAL-E CNS Circuit Lab.exe'
$uiProfile = Join-Path $uiProject '.impeccable\development-ui-profile'
if (-not (Test-Path -LiteralPath $uiExecutable -PathType Leaf)) {
    throw 'Copia di prova UI non compilata: electron-builder --dir --win --x64 --publish never --config.directories.output=dist-first-person-dev-560.'
}
Start-Process -FilePath $uiExecutable -ArgumentList ('--user-data-dir="' + $uiProfile + '"') -WindowStyle Hidden
