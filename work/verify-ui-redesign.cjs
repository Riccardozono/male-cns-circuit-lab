'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='a30d70c2ee382b68f3f13c0b6f2ed36a95cbe278',checks=[];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>cp.execFileSync('git',args,{cwd:root,maxBuffer:128*1024*1024});
// The first-person camera changes only these three display-layer modules.
// Their packaged bytes are checked below, separately from the preserved core.
const authorizedPresentationChanges=['outputs/circuit-3d.mjs','outputs/car-3d.mjs','outputs/supplied-car-3d.mjs'];
const protectedFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/vehicle-992.js','outputs/terrain.js','outputs/progress-save.js','outputs/desktop-state.js','outputs/desktop-runtime.js','outputs/model-profiles.js','outputs/legacy-models.js','outputs/agent-selection.js','outputs/model-test.js','outputs/full-connectome-loader.js','outputs/learning-metrics.js','outputs/data/connectome-full.bin','outputs/data/connectome-full.json','outputs/data/connectome.json','outputs/data/circuits.js','outputs/data/circuits.json','outputs/data/terrain.js','outputs/data/curbs.js','outputs/track-renderer.js','outputs/brain-atlas.js','outputs/car-renderer.js','outputs/world-terrain.mjs','outputs/environment-assets.mjs','outputs/vegetation.mjs','outputs/assets/porsche-992-gt3-r-lod.glb','desktop/engine.cjs','desktop/worker.cjs','desktop/preload.cjs','desktop/progress-files.cjs'];
const tracked=git('ls-files').toString().split(/\r?\n/);
for(const file of protectedFiles.filter(f=>tracked.includes(f))){
  const bytes=fs.readFileSync(path.join(root,file)),blob=git('show',base+':'+file),current=hash(bytes);
  const clean=b=>/\.(bin|glb)$/.test(file)?b:Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n'));
  const priorPackage=path.join(root,'dist-learning-dev-560/win-unpacked/resources/app',file);
  const previousPackageHash=fs.existsSync(priorPackage)?hash(fs.readFileSync(priorPackage)):null;
  checks.push({name:file,passed:hash(clean(bytes))===hash(clean(blob))&&(!previousPackageHash||current===previousPackageHash),sha256:current,previousPackageSha256:previousPackageHash,gitComparison:'LF-normalized for text; binary unchanged'});
}
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
checks.push({name:'App version 5.6.0 unchanged',passed:pkg.version==='5.6.0'});
checks.push({name:'Published tag unchanged',passed:git('rev-parse','v5.6.0^{}').toString().trim()==='7cb6fcf0b12bd56bd7a7510fef147f7356a2f3a4'});
for(const [file,expected]of [['MAL-E-CNS-Circuit-Lab-portable-5.6.0-x64.exe','95f5bff7c029d0f7661ba9677031efc528d5e1d82c76dada42579336b8654424'],['MAL-E-CNS-Circuit-Lab-setup-5.6.0-x64.exe','c070442d86f6e406e84b915774deeae974723b30f40e05929f51516292928ce5'],['SHA256SUMS.txt','c316739d12495ab5e9778e08eca4e58b6983c9c0c506f6d2ee64967790c29af1']]){const actual=hash(fs.readFileSync(path.join(root,'dist-landscape-v560',file)));checks.push({name:'Published '+file,passed:actual===expected,sha256:actual});}
const appRoot=path.join(root,'dist-first-person-dev-560/win-unpacked/resources/app');
for(const file of ['outputs/session-ui.js','outputs/ui-theme.js','outputs/styles.css','outputs/index.html','outputs/app.js',...authorizedPresentationChanges,'outputs/assets/porsche-992-gt3-r-lod.glb','outputs/assets/fonts/Tajawal-Bold.ttf','outputs/assets/fonts/Sintony-Bold.ttf','outputs/assets/fonts/OFL-Tajawal.txt','outputs/assets/fonts/OFL-Sintony.txt'])checks.push({name:'Packaged '+file,passed:hash(fs.readFileSync(path.join(root,file)))===hash(fs.readFileSync(path.join(appRoot,file)))});
const report={baseline:base,authorizedPresentationChanges,checks,passed:checks.every(c=>c.passed),boundary:'Camera and display culling changed as requested; physical/neural/learning core and anatomical/track data preserved. No convergence or performance claim.'};
fs.writeFileSync(path.join(root,'.impeccable/review/first-person/preservation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,checks:checks.length,failed:checks.filter(c=>!c.passed)},null,2));process.exitCode=report.passed?0:1;
