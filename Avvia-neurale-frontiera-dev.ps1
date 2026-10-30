param([switch]$Diversita)
$frontierProject = $PSScriptRoot
$frontierElectron = Join-Path $frontierProject 'node_modules/electron/dist/electron.exe'
$frontierEntry = Join-Path $frontierProject 'work/context-preview-main.cjs'
$frontierModel = Join-Path $frontierProject $(if ($Diversita) { '.impeccable/review/neural-sacl/diversity-native-model/model.malecns-neural-diversity.json' } else { '.impeccable/review/neural-sacl/frontier-native-model/model.malecns-neural-frontier.json' })
$frontierNode = Join-Path $frontierProject '.impeccable/runtime-node24/node.exe'
if (!(Test-Path -LiteralPath $frontierElectron) -or !(Test-Path -LiteralPath $frontierEntry) -or !(Test-Path -LiteralPath $frontierModel) -or !(Test-Path -LiteralPath $frontierNode)) {
  Write-Error 'Manca un file della copia di verifica. Mantieni il progetto completo; questo modello non va caricato nel portable della release.'
  exit 1
}
$frontierRunMode = [Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE', 'Process')
try {
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
  $frontierArguments = @(('"' + $frontierEntry + '"'), '--stage=3', '--frontier', '--show')
  if ($Diversita) { $frontierArguments += '--diversity' }
  Start-Process -FilePath $frontierElectron -WorkingDirectory $frontierProject -ArgumentList $frontierArguments -WindowStyle Hidden
} finally {
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $frontierRunMode, 'Process')
}
