$ErrorActionPreference='Stop'
$taskProjectRoot=$PSScriptRoot
$taskElectronPath=Join-Path $taskProjectRoot 'node_modules/electron/dist/electron.exe'
$taskEntryPath=Join-Path $taskProjectRoot 'work/neural-instant-main.cjs'
$taskNodePath=Join-Path $taskProjectRoot '.impeccable/runtime-node24/node.exe'
foreach($taskRequiredPath in @($taskElectronPath,$taskEntryPath,$taskNodePath)){
  if(-not(Test-Path -LiteralPath $taskRequiredPath -PathType Leaf)){throw "Copia privata incompleta: manca $taskRequiredPath"}
}
& $taskNodePath -e "require(process.argv[1]).defaultChoice()" (Join-Path $taskProjectRoot 'work/neural-instant-desktop-model.cjs')
if($LASTEXITCODE -ne 0){throw 'Modello o verifiche non corrispondenti. Nessuna release o altro salvataggio viene modificato.'}
$taskPreviousElectronMode=$env:ELECTRON_RUN_AS_NODE
try{
  $env:ELECTRON_RUN_AS_NODE=$null
  # Interactive window explicitly requested by the author; not a background helper.
  Start-Process -FilePath $taskElectronPath -ArgumentList @(('"'+$taskEntryPath+'"'),'--show') -WorkingDirectory $taskProjectRoot -WindowStyle Normal
}finally{$env:ELECTRON_RUN_AS_NODE=$taskPreviousElectronMode}
