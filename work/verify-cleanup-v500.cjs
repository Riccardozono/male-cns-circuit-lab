'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'outputs/pulizia-v500'),plan=JSON.parse(fs.readFileSync(path.join(out,'piano.json'),'utf8')),stage=process.argv.includes('--stage');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),read=file=>JSON.parse(fs.readFileSync(path.join(out,file),'utf8'));
function walk(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name),prefix+e.name+'/'):[{file:prefix+e.name,bytes:fs.statSync(path.join(dir,e.name)).size}]);}
const retained=plan.protectedRuntime.map(f=>({...f,identical:hash(path.join(root,f.file))===f.sha256})),saves=plan.protectedSaves.map(f=>({...f,identical:hash(path.join(root,f.file))===f.sha256}));
const directory=stage?plan.stagingDistribution:plan.currentDistribution,names=['MAL-E-CNS-Circuit-Lab-portable-5.0.0-x64.exe','MAL-E-CNS-Circuit-Lab-setup-5.0.0-x64.exe'];
const artifacts=names.map(name=>{const file=path.join(root,directory,name);return {file:directory+'/'+name,bytes:fs.statSync(file).size,sha256:hash(file)};});
const signatureCommand='Get-AuthenticodeSignature -LiteralPath '+artifacts.map(a=>"'"+path.join(root,a.file).replaceAll("'","''")+"'").join(', ')+" | Select-Object Path, @{Name='Status';Expression={$_.Status.ToString()}} | ConvertTo-Json -Depth 2";
const signatures=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-Command',signatureCommand],{encoding:'utf8',windowsHide:true}));
const diagnostics={gpu:read('runtime-gpu/model-comparison-smoke.json'),cpu:read('runtime-cpu/model-comparison-smoke.json'),progress:read('progress/progress-smoke.json')};
const runtimePassed=diagnostics.gpu.passed&&diagnostics.gpu.checks.length===30&&diagnostics.gpu.cases.length===4&&!diagnostics.gpu.forceCpuFallback&&diagnostics.cpu.passed&&diagnostics.cpu.checks.length===30&&diagnostics.cpu.cases.length===4&&diagnostics.cpu.forceCpuFallback&&diagnostics.progress.passed&&diagnostics.progress.checks.length===57&&diagnostics.progress.priorImports.length===4&&Object.values(diagnostics).every(r=>r.version==='5.0.0'&&!r.consoleErrors.length);
let packageAudit,removal,tests;
if(stage){
  const appRoot=path.join(root,directory,'win-unpacked/resources/app'),manifest=JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8'));
  const files=walk(appRoot),expected=[...plan.protectedRuntime.map(f=>f.file),'package.json'].sort(),actual=files.map(f=>f.file).sort();
  const matches=plan.protectedRuntime.map(f=>({file:f.file,identical:hash(path.join(appRoot,f.file))===f.sha256}));
  packageAudit={version:manifest.version,files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),expectedFiles:expected,exactFileAllowlist:JSON.stringify(expected)===JSON.stringify(actual),matches,unusedReportsTestsCachesOrSaves:files.filter(f=>/\.(malecns-save|tap|log)$|(^|\/)tests\/|smoke\.json$/.test(f.file)).map(f=>f.file)};
}else{
  const previous=read('pre-sostituzione.json');packageAudit=previous.packageAudit;
  const sameStagedArtifacts=artifacts.every(a=>previous.artifacts.some(p=>path.basename(p.file)===path.basename(a.file)&&p.sha256===a.sha256));
  const phases=['PreviousFiles','ReplaceRelease','BuildDuplicates'].map(p=>read('rimozione-'+p+'.json'));
  const missing=plan.candidates.filter(c=>fs.existsSync(path.join(root,c.relative))).map(c=>c.relative);
  const currentTree=fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory()).flatMap(e=>walk(path.join(root,e.name),e.name+'/'));
  removal={sameStagedArtifacts,phases,unexpectedRemainingTargets:missing,stagingRemoved:!fs.existsSync(path.join(root,plan.stagingDistribution)),currentDistributionFiles:fs.readdirSync(path.join(root,plan.currentDistribution)).sort(),currentProjectBytes:currentTree.reduce((n,f)=>n+f.bytes,0),projectBytesBefore:plan.sourceBytesBefore,projectBytesReduction:plan.sourceBytesBefore-currentTree.reduce((n,f)=>n+f.bytes,0),protectedSaves:saves.length,recoverableThroughRecycleBin:phases.every(p=>!p.permanentDeletionUsed&&!p.recycleBinEmptied&&p.protectedFilesUnchanged)};
  const tap=fs.readFileSync(path.join(out,'test-results.tap'),'utf8'),count=n=>Number(tap.match(new RegExp('^# '+n+' (\\d+)\\s*$','m'))?.[1]||0);
  tests={tests:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped'),sha256:hash(path.join(out,'test-results.tap'))};
}
const packagePassed=packageAudit.version==='5.0.0'&&packageAudit.exactFileAllowlist&&packageAudit.matches.every(f=>f.identical)&&!packageAudit.unusedReportsTestsCachesOrSaves.length;
const finalPassed=stage||(removal.sameStagedArtifacts&&!removal.unexpectedRemainingTargets.length&&removal.stagingRemoved&&JSON.stringify(removal.currentDistributionFiles)===JSON.stringify(names.sort())&&removal.recoverableThroughRecycleBin&&tests.tests===250&&tests.passed===250&&!tests.failed&&!tests.skipped);
const report={version:'5.0.0',generatedAt:new Date().toISOString(),stage,passed:retained.every(f=>f.identical)&&saves.every(f=>f.identical)&&runtimePassed&&packagePassed&&finalPassed,artifacts,signatures,retained,saves,packageAudit,diagnostics,tests,removal,boundary:'Cleanup only. Explicit release allowlist, actual staged portable GPU/CPU/native save verification, source/runtime hashes and original save paths preserved. Recycled files remain on disk until the user empties the Recycle Bin; project size reduction is not free disk space. No learning or performance gain is claimed.'};
fs.writeFileSync(path.join(out,stage?'pre-sostituzione.json':'verifica-finale.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({version:report.version,stage,passed:report.passed,retainedFiles:retained.length,saves:saves.length,package:{files:packageAudit.files,bytes:packageAudit.bytes,exactAllowlist:packageAudit.exactFileAllowlist,unwantedFiles:packageAudit.unusedReportsTestsCachesOrSaves},diagnostics:Object.fromEntries(Object.entries(diagnostics).map(([k,v])=>[k,{passed:v.passed,checks:v.checks.length}])),tests,project:removal?{beforeGiB:removal.projectBytesBefore/1073741824,afterGiB:removal.currentProjectBytes/1073741824,reductionGiB:removal.projectBytesReduction/1073741824,remainingUnwanted:removal.unexpectedRemainingTargets}:undefined,artifacts,signatures},null,2));if(!report.passed)process.exitCode=1;
