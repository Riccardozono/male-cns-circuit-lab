'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'outputs','model-test-verification-v500');
const release=path.resolve(root,process.argv[2]||'dist-test-mode-v500-ready');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const relative=f=>path.relative(root,f).replaceAll('\\','/');
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(directory,e.name)):[path.join(directory,e.name)]);}
const baseline=read(path.join(out,'baseline.json'));
const protectedFiles=baseline.files.map(f=>({...f,identical:fs.existsSync(path.join(root,f.path))&&hash(path.join(root,f.path))===f.sha256}));
assert.ok(protectedFiles.every(f=>f.identical),'Existing saves/releases must remain unchanged');
const manifest=read(path.join(root,'package.json')),appDir=path.join(release,'win-unpacked','resources','app');
const expected=manifest.build.files.flatMap(f=>f.endsWith('/**/*')?files(path.join(root,f.slice(0,-5))).map(relative):[f]).sort();
const priorAudit=process.argv.includes('--final')?read(path.join(out,'verification.json')):null;
const actual=priorAudit?priorAudit.packageAudit.files.map(f=>f.file).sort():files(appDir).map(f=>path.relative(appDir,f).replaceAll('\\','/')).sort();
assert.deepEqual(actual,expected,'Exact release allowlist');
const packageFiles=priorAudit?priorAudit.packageAudit.files.map(f=>({...f,sourceIdentical:f.file==='package.json'?manifest.version===priorAudit.appVersion:hash(path.join(root,f.file))===f.sha256})):actual.map(file=>({file,sha256:hash(path.join(appDir,file)),sourceIdentical:file==='package.json'?read(path.join(appDir,file)).version===manifest.version:hash(path.join(root,file))===hash(path.join(appDir,file))}));
assert.ok(packageFiles.every(f=>f.sourceIdentical),'Packaged source must match verified source');
const previous=read(path.join(root,'outputs','pulizia-v500','verifica-finale.json'));
const core=previous.retained.filter(f=>/\/(?:neural-learning|rewards|vehicle-992|model-profiles|legacy-models|progress-save)\.js$|^outputs\/data\//.test(f.file)).map(f=>({file:f.file,identical:hash(path.join(root,f.file))===f.sha256}));
assert.ok(core.length>=10&&core.every(f=>f.identical),'Original learning/physics/reward/data/save modules');
const reports={};for(const folder of ['source-final-gpu','source-cpu','portable-gpu','portable-cpu','progress']){
  const r=read(path.join(out,folder,folder==='progress'?'progress-smoke.json':'model-test-smoke.json'));
  assert.equal(r.passed,true,folder);assert.equal(r.version,'5.0.0');reports[folder]={passed:r.passed,checks:r.checks.length,consoleErrors:r.consoleErrors,report:r.report??null,priorImports:r.priorImports??null};
}
assert.equal(reports.progress.priorImports.length,4);
const tap=fs.readFileSync(path.join(out,'tests.tap'),'utf8'),get=name=>Number(tap.match(new RegExp('^# '+name+' (\\d+)$','m'))?.[1]);
const tests={tests:get('tests'),passed:get('pass'),failed:get('fail'),skipped:get('skipped')};assert.ok(tests.tests>=267&&tests.passed===tests.tests&&tests.failed===0&&tests.skipped===0);
const artifacts=['portable','setup'].map(type=>{const file=path.join(release,`MAL-E-CNS-Circuit-Lab-${type}-5.0.0-x64.exe`);assert.ok(fs.existsSync(file));return{file:relative(file),bytes:fs.statSync(file).size,sha256:hash(file)};});
if(priorAudit){assert.deepEqual(artifacts.map(a=>a.sha256),priorAudit.artifacts.map(a=>a.sha256),'Final executables must be the tested artifacts');assert.deepEqual(fs.readdirSync(release).sort(),artifacts.map(a=>path.basename(a.file)).sort(),'Only final portable/installer retained');}
const report={passed:true,appVersion:manifest.version,generatedAt:new Date().toISOString(),tests,protectedFiles,unchangedCore:core,packageAudit:{files:packageFiles,exactAllowlist:true,bytes:priorAudit?.packageAudit.bytes??files(appDir).reduce((sum,f)=>sum+fs.statSync(f).size,0)},reports,artifacts,final:!!priorAudit,review:'review.md: disposition ship for the added panel; in-thread substitute, not a whole-app audit.',boundary:'Functional/counter/isolation/persistence verification, not proof all models converge to two laps.'};
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:true,tests,saves:protectedFiles.filter(f=>f.path.endsWith('.malecns-save')).length,coreFiles:core.length,packagedFiles:actual.length,checks:Object.fromEntries(Object.entries(reports).map(([key,r])=>[key,r.checks])),artifacts},null,2));
