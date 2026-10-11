'use strict';
// Inventory only. No removal/move is performed here. The Windows executor
// separately checks the resolved paths, saves, file lists, sizes and processes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),posix=p=>p.replaceAll('\\','/');
const reportDir=path.join(root,'outputs/pulizia-v500');fs.mkdirSync(reportDir,{recursive:true});
const within=relative=>{const absolute=path.resolve(root,relative),r=path.relative(root,absolute);assert.ok(r&&!r.startsWith('..')&&!path.isAbsolute(r),'Outside workspace: '+relative);return absolute;};
function walk(relative){
  const absolute=within(relative),entries=[];assert.ok(!fs.lstatSync(absolute).isSymbolicLink(),'Reparse/symlink: '+relative);
  if(fs.statSync(absolute).isDirectory())for(const child of fs.readdirSync(absolute,{withFileTypes:true}))entries.push(...walk(posix(path.join(relative,child.name))));
  else {const stat=fs.statSync(absolute);entries.push({file:posix(relative),bytes:stat.size,modifiedAtUtc:stat.mtime.toISOString()});}return entries;
}
const oldDirs=['dist','dist-car-visual-v461','dist-learning','dist-learning-v43','dist-learning-v44','dist-metric-v470','dist-model-v500','dist-models','dist-performance-v450','dist-physics-v460','dist-progress-v462','dist-rewards-v480','dist-selection-v463','dist-speed-fix','dist-tracks-v442','dist-ui-v441'];
const rootProfiles=['male-cns-gpu-benchmark','male-cns-gpu-benchmark-2','male-cns-gpu-benchmark-v4','male-cns-gpu-benchmark-v4-short','male-cns-smoke-after-benchmark','tmp'];
const candidates=[],protectedSaves=[],workKeep=new Set(['benchmark-all-models.cjs','benchmark-connectome-rl.cjs','serve.mjs','plan-cleanup-v500.cjs','recycle-cleanup-v500.ps1','verify-cleanup-v500.cjs','track-width-profiles.json']);
function add(relative,reason){
  if(!fs.existsSync(within(relative)))return;const files=walk(relative),saves=files.filter(f=>/\.malecns-save$/i.test(f.file));
  if(saves.length){for(const file of files)if(!/\.malecns-save$/i.test(file.file))add(file.file,reason);return;}
  if(!files.length)return;
  candidates.push({relative:posix(relative),kind:fs.statSync(within(relative)).isDirectory()?'directory':'file',reason,files,bytes:files.reduce((n,f)=>n+f.bytes,0)});
}
for(const dir of oldDirs)add(dir,'Previous distribution, not used by current 5.0.0');
for(const dir of rootProfiles)add(dir,'Generated benchmark profile or temporary reference/cache');
for(const e of fs.readdirSync(path.join(root,'work'),{withFileTypes:true})){
  if(e.isDirectory()){if(!['malecns','maps'].includes(e.name))add('work/'+e.name,'Generated profile, obsolete assisted archive or preprocessing cache');}
  else if(!workKeep.has(e.name)&&!['.py','.mjs'].includes(path.extname(e.name)))add('work/'+e.name,'Superseded verification script, report or log');
}
const rootKeep=new Set(['vehicle-992-provenance.json','model-core-verification-v500.json','model-ui-core-verification-v500.json','model-ui-release-verification-v500.json','release-verification-v500.json','test-results-model-ui-v500.tap','test-results-v500.tap']);
for(const e of fs.readdirSync(path.join(root,'outputs'),{withFileTypes:true})){
  const relative='outputs/'+e.name;
  if(e.isDirectory()){
    if(['assets','data','tests','pulizia-v500'].includes(e.name))continue;
    if(e.name==='model-benchmark-v500'){
      for(const file of walk(relative))if(file.file!=='outputs/model-benchmark-v500/portable/model-benchmark.json')add(file.file,'Superseded benchmark attempt');
    }else add(relative,'Generated historical diagnostic output (save files protected)');
  }else if(!rootKeep.has(e.name)&&!['.js','.html','.css','.md'].includes(path.extname(e.name)))add(relative,'Historical test/benchmark report or log');
}
add('outputs/data/connectome.js','Unused duplicated JS catalog: every current controller/test loads connectome.json');
add('.impeccable/review','Old screenshot review, not app data or active design context');
// Only the two current deliverables remain in the distribution directory.
// Replacement is atomic at directory level after staged executable verification.
const currentDistribution='dist-model-ui-v500';
for(const e of fs.readdirSync(path.join(root,currentDistribution),{withFileTypes:true}))if(!e.name.endsWith('.exe'))add(currentDistribution+'/'+e.name,'Duplicate unpacked runtime or rebuildable builder metadata');
for(const file of walk('outputs'))if(/\.malecns-save$/i.test(file.file))protectedSaves.push({...file,sha256:hash(within(file.file))});
const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const runtimeFiles=[...fs.readdirSync(path.join(root,'desktop')).filter(f=>f.endsWith('.cjs')).map(f=>'desktop/'+f),...manifest.build.files.filter(f=>!f.includes('*')&&f!=='package.json')];
const protectedRuntime=[...new Set(runtimeFiles)].map(file=>({file,bytes:fs.statSync(within(file)).size,sha256:hash(within(file))}));
for(const candidate of candidates)for(const file of candidate.files){
  assert.ok(!protectedSaves.some(s=>s.file===file.file),'Save would be removed: '+file.file);
  assert.ok(!protectedRuntime.some(s=>s.file===file.file),'Required source would be removed: '+file.file);
}
const oldExeFiles=['MAL-E-CNS-Circuit-Lab-portable-5.0.0-x64.exe','MAL-E-CNS-Circuit-Lab-setup-5.0.0-x64.exe'];
const previousArtifacts=oldExeFiles.map(name=>{const file=currentDistribution+'/'+name;return {file,bytes:fs.statSync(within(file)).size,sha256:hash(within(file))};});
const tree=fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory()&&e.name!=='dist-model-ui-v500-clean').flatMap(e=>walk(e.name));
const plan={schema:1,root,version:manifest.version,createdAt:new Date().toISOString(),mode:'Recycle Bin only; never permanently delete or empty the Recycle Bin',currentDistribution,stagingDistribution:'dist-model-ui-v500-clean',sourceBytesBefore:tree.reduce((n,f)=>n+f.bytes,0),candidates,protectedSaves,protectedRuntime,previousArtifacts,counts:{targets:candidates.length,files:candidates.reduce((n,c)=>n+c.files.length,0),bytes:candidates.reduce((n,c)=>n+c.bytes,0),saves:protectedSaves.length},preservedDevelopment:['node_modules','outputs/tests','work/malecns','work/maps','Python/source-generation scripts','PRODUCT.md','DESIGN.md','.impeccable context']};
fs.writeFileSync(path.join(reportDir,'piano.json'),JSON.stringify(plan,null,2));
console.log(JSON.stringify({version:plan.version,...plan.counts,GiBToRecycle:plan.counts.bytes/1073741824,protectedRuntimeFiles:protectedRuntime.length,previousArtifacts,reason:'Explicit current file allowlist and all saved-progress paths are protected.'},null,2));
