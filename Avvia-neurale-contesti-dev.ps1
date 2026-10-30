$contextProject = $PSScriptRoot
$contextElectron = Join-Path $contextProject 'node_modules/electron/dist/electron.exe'
$contextEntry = Join-Path $contextProject 'work/context-preview-main.cjs'
$contextModel = Join-Path $contextProject '.impeccable/review/neural-sacl/context-stack-3/model.malecns-neural-context.json'
$contextNode = Join-Path $contextProject '.impeccable/runtime-node24/node.exe'
if (!(Test-Path -LiteralPath $contextElectron) -or !(Test-Path -LiteralPath $contextEntry) -or !(Test-Path -LiteralPath $contextModel) -or !(Test-Path -LiteralPath $contextNode)) {
  Write-Error 'Manca un file della copia di sviluppo. Mantieni il progetto completo; non usare il portable della release per questo modello.'
  exit 1
}
$contextRunMode = [Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE', 'Process')
try {
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
  Start-Process -FilePath $contextElectron -WorkingDirectory $contextProject -ArgumentList @(('"' + $contextEntry + '"'), '--stage=3', '--show') -WindowStyle Hidden
} finally {
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $contextRunMode, 'Process')
}
