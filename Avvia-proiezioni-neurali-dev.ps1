$ErrorActionPreference='Stop'
$taskProjectRoot=$PSScriptRoot
$taskElectronPath=Join-Path $taskProjectRoot 'node_modules/electron/dist/electron.exe'
$taskEntryPath=Join-Path $taskProjectRoot 'work/neural-projected-main.cjs'
foreach($taskRequiredPath in @($taskElectronPath,$taskEntryPath,(Join-Path $taskProjectRoot '.impeccable/runtime-node24/node.exe'),(Join-Path $taskProjectRoot '.impeccable/review/neural-sacl/projected-block-3680/report.json'))){if(-not(Test-Path -LiteralPath $taskRequiredPath -PathType Leaf)){throw "Copia sperimentale incompleta: manca $taskRequiredPath"}}
$taskLearnProof=Get-Content -Raw -LiteralPath (Join-Path $taskProjectRoot '.impeccable/review/neural-sacl/projected-block-3680/report.json')|ConvertFrom-Json
$taskDefaultModel=Join-Path $taskProjectRoot '.impeccable/review/neural-sacl/projected-block-3680/model.malecns-projected-frontier.json'
$taskDefaultHash=(Get-FileHash -Algorithm SHA256 -LiteralPath $taskDefaultModel).Hash.ToLowerInvariant()
if(-not $taskLearnProof.passed -or @($taskLearnProof.nativeVerifications|Where-Object { $_.passed -and $_.modelSha256 -eq $taskDefaultHash }).Count -ne 2){throw 'Il modello predefinito non corrisponde ai due replay nativi verificati.'}
$taskPreviousElectronMode=$env:ELECTRON_RUN_AS_NODE
try{
  $env:ELECTRON_RUN_AS_NODE=$null
  Start-Process -FilePath $taskElectronPath -ArgumentList @(('"'+$taskEntryPath+'"'),'--show') -WorkingDirectory $taskProjectRoot -WindowStyle Normal
}finally{$env:ELECTRON_RUN_AS_NODE=$taskPreviousElectronMode}
