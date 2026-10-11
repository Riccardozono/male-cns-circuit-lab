'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'outputs','test-access-verification-v500');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8')),hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const relative=file=>path.relative(root,file).replaceAll('\\','/');
const files=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(directory,e.name)):[path.join(directory,e.name)]);
if(process.argv.includes('--baseline')){
  assert.ok(!fs.existsSync(path.join(out,'baseline.json')),'Do not replace an existing preservation baseline');
  const saves=files(path.join(root,'outputs')).filter(f=>f.endsWith('.malecns-save'));
  const releases=['dist-model-ui-v500','dist-test-mode-v500'].flatMap(d=>files(path.join(root,d)).filter(f=>f.endsWith('.exe')));
  const core=['outputs/simulation.js','outputs/model-test.js','outputs/desktop-runtime.js','outputs/neural-learning.js','outputs/rewards.js','outputs/vehicle-992.js','outputs/model-profiles.js','outputs/legacy-models.js','outputs/progress-save.js','outputs/agent-selection.js',...files(path.join(root,'outputs','data')).map(relative),...files(path.join(root,'desktop')).map(relative).filter(f=>f!=='desktop/model-test-smoke.cjs')];
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'baseline.json'),JSON.stringify({createdAt:new Date().toISOString(),protected:[...saves,...releases].map(f=>({file:relative(f),sha256:hash(f)})),core:[...new Set(core)].map(file=>({file,sha256:hash(path.join(root,file))}))},null,2));
  console.log(JSON.stringify({saves:saves.length,releases:releases.length,core:core.length}));return;
}
const baseline=read(path.join(out,'baseline.json')),manifest=read(path.join(root,'package.json')),release=path.resolve(root,'dist-test-access-v500');
const protectedFiles=baseline.protected.map(f=>({...f,identical:fs.existsSync(path.join(root,f.file))&&hash(path.join(root,f.file))===f.sha256}));
const core=baseline.core.map(f=>({...f,identical:hash(path.join(root,f.file))===f.sha256}));
assert.ok(protectedFiles.every(f=>f.identical)&&core.every(f=>f.identical),'Saves, existing releases and all non-UI runtime must remain unchanged');
assert.equal(manifest.version,'5.0.0');
const reports={};for(const folder of ['source-gpu','portable-gpu','portable-cpu','progress']){
  const r=read(path.join(out,folder,folder==='progress'?'progress-smoke.json':'model-test-smoke.json'));assert.equal(r.passed,true,folder);assert.equal(r.version,'5.0.0');reports[folder]={passed:r.passed,checks:r.checks.length,consoleErrors:r.consoleErrors,priorImports:r.priorImports??null};
}
assert.equal(reports.progress.priorImports.length,4);
const tap=fs.readFileSync(path.join(out,'tests.tap'),'utf8'),count=name=>Number(tap.match(new RegExp('^# '+name+' (\\d+)$','m'))?.[1]);
const tests={tests:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped')};assert.ok(tests.tests>=272&&tests.passed===tests.tests&&tests.failed===0&&tests.skipped===0);
const prior=process.argv.includes('--final')?read(path.join(out,'verification.json')):null;
const expected=manifest.build.files.flatMap(f=>f.endsWith('/**/*')?files(path.join(root,f.slice(0,-5))).map(relative):[f]).sort(),appDir=path.join(release,'win-unpacked','resources','app');
const actual=prior?prior.packageAudit.map(f=>f.file).sort():files(appDir).map(f=>path.relative(appDir,f).replaceAll('\\','/')).sort();assert.deepEqual(actual,expected);
const packageAudit=prior?prior.packageAudit.map(f=>({...f,sourceIdentical:f.file==='package.json'?manifest.version==='5.0.0':hash(path.join(root,f.file))===f.sha256})):actual.map(file=>({file,sha256:hash(path.join(appDir,file)),sourceIdentical:file==='package.json'?read(path.join(appDir,file)).version===manifest.version:hash(path.join(root,file))===hash(path.join(appDir,file))}));assert.ok(packageAudit.every(f=>f.sourceIdentical));
const artifacts=['portable','setup'].map(type=>{const file=path.join(release,`MAL-E-CNS-Circuit-Lab-${type}-5.0.0-x64.exe`);return{file:relative(file),sha256:hash(file),bytes:fs.statSync(file).size};});
if(prior){assert.deepEqual(artifacts.map(f=>f.sha256),prior.artifacts.map(f=>f.sha256));assert.deepEqual(fs.readdirSync(release).sort(),artifacts.map(f=>path.basename(f.file)).sort());}
const report={passed:true,version:manifest.version,generatedAt:new Date().toISOString(),final:!!prior,tests,protectedFiles,unchangedRuntime:core,packageAudit,reports,artifacts,boundary:'UI access/removal, actual test-mode execution and save compatibility. No learning-convergence or speed claim.'};
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,tests,protectedFiles:protectedFiles.length,unchangedRuntime:core.length,packagedFiles:packageAudit.length,reports,artifacts},null,2));
