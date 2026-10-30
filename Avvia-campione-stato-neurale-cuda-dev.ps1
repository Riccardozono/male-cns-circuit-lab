$ErrorActionPreference='Stop'
$stateHeadProjectRoot=$PSScriptRoot
$stateHeadElectron=Join-Path $stateHeadProjectRoot 'node_modules/electron/dist/electron.exe'
$stateHeadEntry=Join-Path $stateHeadProjectRoot 'work/neural-statehead-cuda-main.cjs'
$stateHeadNode=Join-Path $stateHeadProjectRoot '.impeccable/runtime-node24/node.exe'
foreach($stateHeadRequired in @($stateHeadElectron,$stateHeadEntry,$stateHeadNode)){if(-not(Test-Path -LiteralPath $stateHeadRequired -PathType Leaf)){throw "Copia state-head CUDA incompleta: manca $stateHeadRequired"}}
& $stateHeadNode -e "require(process.argv[1]).defaultChoice()" (Join-Path $stateHeadProjectRoot 'work/neural-statehead-cuda-model.cjs')
if($LASTEXITCODE -ne 0){throw 'La prova fisica del candidato state-head o il suo hash non corrispondono. Nessuna app o salvataggio è stato modificato.'}
$stateHeadPreviousElectronMode=$env:ELECTRON_RUN_AS_NODE
try{$env:ELECTRON_RUN_AS_NODE=$null;Start-Process -FilePath $stateHeadElectron -ArgumentList @(('"'+$stateHeadEntry+'"'),'--show') -WorkingDirectory $stateHeadProjectRoot -WindowStyle Normal}
finally{$env:ELECTRON_RUN_AS_NODE=$stateHeadPreviousElectronMode}
