$ErrorActionPreference='Stop'
$taskProjectRoot=$PSScriptRoot
$taskElectronPath=Join-Path $taskProjectRoot 'node_modules/electron/dist/electron.exe'
$taskEntryPath=Join-Path $taskProjectRoot 'work/neural-chain-cuda-main.cjs'
$taskNodePath=Join-Path $taskProjectRoot '.impeccable/runtime-node24/node.exe'
foreach($taskRequiredPath in @($taskElectronPath,$taskEntryPath,$taskNodePath)){if(-not(Test-Path -LiteralPath $taskRequiredPath -PathType Leaf)){throw "Copia CUDA incompleta: manca $taskRequiredPath"}}
& $taskNodePath -e "require(process.argv[1]).defaultChoice()" (Join-Path $taskProjectRoot 'work/neural-chain-cuda-model.cjs')
if($LASTEXITCODE -ne 0){throw 'La copia CUDA o le sue prove non corrispondono. La versione distribuita non viene modificata.'}
$taskPreviousElectronMode=$env:ELECTRON_RUN_AS_NODE
try{
  $env:ELECTRON_RUN_AS_NODE=$null
  # Explicitly requested interactive app, not a background service.
  Start-Process -FilePath $taskElectronPath -ArgumentList @(('"'+$taskEntryPath+'"'),'--show') -WorkingDirectory $taskProjectRoot -WindowStyle Normal
}finally{$env:ELECTRON_RUN_AS_NODE=$taskPreviousElectronMode}
