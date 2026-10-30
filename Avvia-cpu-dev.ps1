$ErrorActionPreference = 'Stop'
$cpuDevProject = [IO.Path]::GetFullPath($PSScriptRoot)
$cpuDevExecutable = Join-Path $cpuDevProject 'dist-exact-cpu-dev-560\win-unpacked\MAL-E CNS Circuit Lab - CPU DEV.exe'
$cpuDevProfile = Join-Path $cpuDevProject '.impeccable\development-exact-cpu-profile'
if (-not (Test-Path -LiteralPath $cpuDevExecutable -PathType Leaf)) {
    throw 'La copia Windows CPU DEV non è presente.'
}
Start-Process -FilePath $cpuDevExecutable -ArgumentList ('--user-data-dir="' + $cpuDevProfile + '"') -WindowStyle Hidden
