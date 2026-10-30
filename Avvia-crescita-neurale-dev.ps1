$ErrorActionPreference='Stop'
$taskProjectRoot=$PSScriptRoot
$taskElectronPath=Join-Path $taskProjectRoot 'node_modules/electron/dist/electron.exe'
$taskEntryPath=Join-Path $taskProjectRoot 'work/neural-grown-main.cjs'
foreach($taskRequiredPath in @($taskElectronPath,$taskEntryPath,(Join-Path $taskProjectRoot '.impeccable/runtime-node24/node.exe'),(Join-Path $taskProjectRoot '.impeccable/review/neural-sacl/retained-native-model/verification.json'))){if(-not(Test-Path -LiteralPath $taskRequiredPath -PathType Leaf)){throw "Copia sperimentale incompleta: manca $taskRequiredPath"}}
$taskPreviousElectronMode=$env:ELECTRON_RUN_AS_NODE
try{
  $env:ELECTRON_RUN_AS_NODE=$null
  Start-Process -FilePath $taskElectronPath -ArgumentList @(('"'+$taskEntryPath+'"'),'--show') -WorkingDirectory $taskProjectRoot -WindowStyle Normal
}finally{$env:ELECTRON_RUN_AS_NODE=$taskPreviousElectronMode}
