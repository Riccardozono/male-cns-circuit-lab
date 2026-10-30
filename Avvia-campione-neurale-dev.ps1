$ErrorActionPreference='Stop'
$taskProjectRoot=$PSScriptRoot
$taskElectronPath=Join-Path $taskProjectRoot 'node_modules/electron/dist/electron.exe'
$taskEntryPath=Join-Path $taskProjectRoot 'work/neural-chain-main.cjs'
$taskNodePath=Join-Path $taskProjectRoot '.impeccable/runtime-node24/node.exe'
foreach($taskRequiredPath in @($taskElectronPath,$taskEntryPath,$taskNodePath,(Join-Path $taskProjectRoot '.impeccable/review/neural-sacl/neuronal-clean-champion.json'))){if(-not(Test-Path -LiteralPath $taskRequiredPath -PathType Leaf)){throw "Copia sperimentale incompleta: manca $taskRequiredPath"}}
& $taskNodePath -e "require(process.argv[1]).defaultChoice()" (Join-Path $taskProjectRoot 'work/neural-chain-desktop-model.cjs')
if($LASTEXITCODE -ne 0){throw 'Il campione o le sue verifiche non corrispondono. Nessun modello è stato sostituito.'}
$taskPreviousElectronMode=$env:ELECTRON_RUN_AS_NODE
try{
  $env:ELECTRON_RUN_AS_NODE=$null
  # A visible window is the explicitly requested Windows application, not a
  # background service. Numerical workers themselves always remain hidden.
  Start-Process -FilePath $taskElectronPath -ArgumentList @(('"'+$taskEntryPath+'"'),'--show') -WorkingDirectory $taskProjectRoot -WindowStyle Normal
}finally{$env:ELECTRON_RUN_AS_NODE=$taskPreviousElectronMode}
