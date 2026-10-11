param([ValidateSet('PreviousFiles','ReplaceRelease','BuildDuplicates')][string]$Phase)
$ErrorActionPreference = 'Stop'
$cleanupRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$cleanupPlan = Get-Content -LiteralPath (Join-Path $cleanupRoot 'outputs/pulizia-v500/piano.json') -Raw | ConvertFrom-Json
if ($cleanupRoot -ne $cleanupPlan.root) { throw 'Workspace mismatch.' }
Add-Type -AssemblyName Microsoft.VisualBasic.Core
$cleanupProcesses = @(Get-CimInstance Win32_Process)
function Resolve-CleanupTarget([string]$Relative) {
  if ([IO.Path]::IsPathRooted($Relative)) { throw "Absolute manifest path: $Relative" }
  $absolute = [IO.Path]::GetFullPath((Join-Path $cleanupRoot $Relative))
  if (-not $absolute.StartsWith($cleanupRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw "Outside workspace: $Relative" }
  $cursor = $absolute
  while ($cursor -ne $cleanupRoot) {
    if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Reparse point: $cursor" }
    $cursor = Split-Path -Parent $cursor
  }
  return $absolute
}
function Check-ProtectedFiles {
  foreach ($saved in @($cleanupPlan.protectedSaves) + @($cleanupPlan.protectedRuntime)) {
    $file = Resolve-CleanupTarget $saved.file
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $saved.sha256) { throw "Protected file changed: $($saved.file)" }
  }
}
function Check-TargetIdle([string]$Absolute) {
  $directoryPrefix = $Absolute + [IO.Path]::DirectorySeparatorChar
  foreach ($process in $cleanupProcesses) {
    $usesExecutable = $process.ExecutablePath -and ($process.ExecutablePath.Equals($Absolute,[StringComparison]::OrdinalIgnoreCase) -or $process.ExecutablePath.StartsWith($directoryPrefix,[StringComparison]::OrdinalIgnoreCase))
    $usesCommandPath = $process.CommandLine -and ($process.CommandLine.Contains($directoryPrefix,[StringComparison]::OrdinalIgnoreCase) -or $process.CommandLine.Contains('"' + $Absolute + '"',[StringComparison]::OrdinalIgnoreCase))
    if ($usesExecutable -or $usesCommandPath) { throw "Target is used by process $($process.ProcessId): $Absolute" }
  }
}
function Recycle-Target([string]$Absolute) {
  if ((Get-Item -LiteralPath $Absolute -Force).PSIsContainer) {
    $savedFiles = @(Get-ChildItem -LiteralPath $Absolute -Recurse -File -Force | Where-Object { $_.Extension -eq '.malecns-save' })
    if ($savedFiles.Count) { throw "A save was found inside $Absolute" }
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($Absolute,[Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,[Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin,[Microsoft.VisualBasic.FileIO.UICancelOption]::ThrowException)
  } else {
    if ([IO.Path]::GetExtension($Absolute) -eq '.malecns-save') { throw 'Never remove a progress file.' }
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($Absolute,[Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,[Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin,[Microsoft.VisualBasic.FileIO.UICancelOption]::ThrowException)
  }
  if (Test-Path -LiteralPath $Absolute) { throw "Recycle did not remove source: $Absolute" }
}
Check-ProtectedFiles
$cleanupResults = [Collections.Generic.List[object]]::new()
if ($Phase -eq 'ReplaceRelease') {
  $verified = Get-Content -LiteralPath (Join-Path $cleanupRoot 'outputs/pulizia-v500/pre-sostituzione.json') -Raw | ConvertFrom-Json
  if (-not $verified.passed) { throw 'Staged executable has not passed verification.' }
  $staging = Resolve-CleanupTarget $cleanupPlan.stagingDistribution
  $current = Resolve-CleanupTarget $cleanupPlan.currentDistribution
  Check-TargetIdle $staging
  Check-TargetIdle $current
  foreach ($artifact in $verified.artifacts) {
    $file = Resolve-CleanupTarget $artifact.file
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $artifact.sha256) { throw "Staged artifact changed: $file" }
  }
  Recycle-Target $current
  Move-Item -LiteralPath $staging -Destination $current
  $cleanupResults.Add([pscustomobject]@{relative=$cleanupPlan.currentDistribution;status='Old release recycled; validated stage moved into same path';bytes=($cleanupPlan.previousArtifacts | Measure-Object -Property bytes -Sum).Sum})
} else {
  $targets = @($cleanupPlan.candidates | Where-Object { ($_.relative.StartsWith('dist-model-ui-v500/')) -eq ($Phase -eq 'BuildDuplicates') })
  # Validate every path and its exact file set BEFORE the first removal.
  foreach ($target in $targets) {
    $absolute = Resolve-CleanupTarget $target.relative
    Check-TargetIdle $absolute
    $actualFiles = if ($target.kind -eq 'directory') { @(Get-ChildItem -LiteralPath $absolute -Recurse -File -Force) } else { @(Get-Item -LiteralPath $absolute -Force) }
    if ($Phase -ne 'BuildDuplicates') {
      if ($actualFiles.Count -ne $target.files.Count) { throw "Changed file set: $absolute" }
      foreach ($file in $target.files) {
        $actual = Get-Item -LiteralPath (Resolve-CleanupTarget $file.file) -Force
        $plannedTime = [DateTime]$file.modifiedAtUtc
        if ($actual.Length -ne $file.bytes -or [Math]::Abs(($actual.LastWriteTimeUtc - $plannedTime.ToUniversalTime()).TotalMilliseconds) -gt 2) { throw "Changed file: $($file.file)" }
      }
    }
    if (@($actualFiles | Where-Object { $_.Extension -eq '.malecns-save' }).Count) { throw "Saved progress inside $absolute" }
  }
  foreach ($target in $targets) {
    $absolute = Resolve-CleanupTarget $target.relative
    $bytes = if ($target.kind -eq 'directory') { (Get-ChildItem -LiteralPath $absolute -Recurse -File -Force | Measure-Object -Property Length -Sum).Sum } else { (Get-Item -LiteralPath $absolute -Force).Length }
    Recycle-Target $absolute
    $cleanupResults.Add([pscustomobject]@{relative=$target.relative;status='SentToRecycleBin';bytes=$bytes;reason=$target.reason})
  }
}
Check-ProtectedFiles
$cleanupReport = [pscustomobject]@{phase=$Phase;root=$cleanupRoot;completedAt=[DateTime]::UtcNow.ToString('o');targets=$cleanupResults.ToArray();bytes=($cleanupResults | Measure-Object -Property bytes -Sum).Sum;saveCount=$cleanupPlan.protectedSaves.Count;protectedFilesUnchanged=$true;recycleBinEmptied=$false;permanentDeletionUsed=$false}
$cleanupReport | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $cleanupRoot ('outputs/pulizia-v500/rimozione-' + $Phase + '.json')) -Encoding utf8
[pscustomobject]@{phase=$Phase;removedTargets=$cleanupResults.Count;bytes=$cleanupReport.bytes;protectedSaves=$cleanupReport.saveCount;recovery='Windows Recycle Bin'} | ConvertTo-Json
