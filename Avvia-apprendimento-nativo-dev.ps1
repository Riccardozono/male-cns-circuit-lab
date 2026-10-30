$ErrorActionPreference='Stop'
$taskProjectRoot=$PSScriptRoot
$taskElectronPath=Join-Path $taskProjectRoot 'node_modules/electron/dist/electron.exe'
$taskRuntimePath=Join-Path $taskProjectRoot '.impeccable/runtime-node24/node.exe'
$taskEntryPath=Join-Path $taskProjectRoot 'work/neural-training-main.cjs'
foreach($taskRequiredPath in @($taskElectronPath,$taskRuntimePath,$taskEntryPath,(Join-Path $taskProjectRoot '.impeccable/review/neural-sacl/native-training/bootstrap.json'))){if(-not(Test-Path -LiteralPath $taskRequiredPath -PathType Leaf)){throw "Copia sperimentale incompleta: manca $taskRequiredPath"}}
$taskPreviousElectronMode=$env:ELECTRON_RUN_AS_NODE
try{
  $env:ELECTRON_RUN_AS_NODE=$null
  # This is the interactive app, not a background worker: keep its window visible.
  Start-Process -FilePath $taskElectronPath -ArgumentList @(('"'+$taskEntryPath+'"'),'--show') -WorkingDirectory $taskProjectRoot -WindowStyle Normal
}finally{$env:ELECTRON_RUN_AS_NODE=$taskPreviousElectronMode}
