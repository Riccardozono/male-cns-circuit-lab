'use strict';
// Read-only distribution integrity checks. JSON is evidence, not app state.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist-learning-3d-v510'),app=path.join(dist,'win-unpacked','resources','app');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
const config=JSON.parse(fs.readFileSync(path.join(root,'package.json'))),checks=[];
const check=(name,ok,detail)=>checks.push({name,passed:Boolean(ok),detail});
check('Native package has exact 5.1.0 version',JSON.parse(fs.readFileSync(path.join(app,'package.json'))).version==='5.1.0');
const nativePath=path.join(dist,'win-unpacked','MAL-E CNS Circuit Lab.exe'),nativeFd=fs.openSync(nativePath,'r'),nativeDos=Buffer.alloc(64);
fs.readSync(nativeFd,nativeDos,0,64,0);const nativePe=Buffer.alloc(6);fs.readSync(nativeFd,nativePe,0,6,nativeDos.readUInt32LE(60));fs.closeSync(nativeFd);
check('Native Electron payload is Windows x64',nativePe.readUInt32LE(0)===0x4550&&nativePe.readUInt16LE(4)===0x8664);
const expected=config.build.files.flatMap(p=>p.endsWith('/**/*')?walk(path.join(root,p.slice(0,-5))).map(f=>path.relative(root,f)):p);
const missing=[],different=[];
for(const f of expected){const p=path.join(app,f);if(!fs.existsSync(p))missing.push(f);else if(f!=='package.json'&&sha(p)!==sha(path.join(root,f)))different.push(f);}
check('All allowlisted runtime files equal the verified source',!missing.length&&!different.length,{files:expected.length,missing,different});
const asset='outputs/assets/porsche-992-gt3-r-lod.glb',provenance=JSON.parse(fs.readFileSync(path.join(app,'outputs/assets/porsche-992-gt3-r-provenance.json')));
check('Shipped Porsche equals derived asset provenance',sha(path.join(app,asset))===provenance.derivedSha256,{sha256:sha(path.join(app,asset)),bytes:fs.statSync(path.join(app,asset)).size,lods:provenance.lods});
check('Original heavy GLB is not bundled',!fs.existsSync(path.join(app,'outputs/assets/porsche-992-gt3-r-supplied.glb')));
check('Author and model license are bundled',fs.readFileSync(path.join(app,'outputs/assets/PORSCHE-3D-CREDITS.md'),'utf8').includes('MattDoesBlender')&&provenance.license.includes('CC-BY-NC-SA-4.0'));
check('Offline Three runtime and MIT notice are bundled',['three.module.js','three.core.js','GLTFLoader.js','THREE-LICENSE.txt'].every(f=>fs.existsSync(path.join(app,'outputs/vendor',f))));
const glb=fs.readFileSync(path.join(app,asset)),json=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());
check('Porsche buffers and textures are self-contained',(json.buffers||[]).every(b=>!b.uri)&&(json.images||[]).every(i=>i.bufferView!==undefined&&!i.uri));
const baseline=JSON.parse(fs.readFileSync(path.join(root,'work/baseline-v510/manifest.json'))),changed=Object.entries(baseline.protected).filter(([f,h])=>!fs.existsSync(path.join(root,f))||sha(path.join(root,f))!==h).map(([f])=>f);
check('All pre-existing protected files are unchanged',!changed.length,{files:Object.keys(baseline.protected).length,changed});
const artifacts=[];
if(!process.argv.includes('--unpacked-only')){
  for(const [name,file,cpu] of [['packaged-3d','ui-smoke.json',false],['packaged-cpu-3d','ui-smoke.json',true],['packaged-progress','progress-smoke.json',false],['packaged-cpu-progress','progress-smoke.json',true],['packaged-model-test','model-test-smoke.json',false],['packaged-cpu-model-test','model-test-smoke.json',true],['portable-3d','ui-smoke.json',false]]){
    const p=path.join(root,'outputs/verification-v510',name,file),r=fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):null;
    check(name+' native runtime checks passed',r&&r.passed&&r.version==='5.1.0'&&r.forceCpuFallback===cpu&&r.checks.every(c=>c.passed),r?{file:path.relative(root,p),checks:r.checks.length,cpu,generatedAt:r.generatedAt}:null);
  }
  for(const kind of ['portable','setup']){
    const file=`MAL-E-CNS-Circuit-Lab-${kind}-5.1.0-x64.exe`,p=path.join(dist,file),exists=fs.existsSync(p);check(kind+' Windows artifact exists',exists);
    if(exists){const fd=fs.openSync(p,'r'),dos=Buffer.alloc(64);fs.readSync(fd,dos,0,64,0);const pe=Buffer.alloc(26);fs.readSync(fd,pe,0,26,dos.readUInt32LE(60));fs.closeSync(fd);const machine=pe.readUInt16LE(4);check(kind+' has a Windows PE launcher',dos.readUInt16LE(0)===0x5a4d&&pe.readUInt32LE(0)===0x4550,{launcherMachine:machine.toString(16),note:'NSIS self-extracting launchers may be x86; the bundled Electron payload is x64.'});artifacts.push({file,bytes:fs.statSync(p).size,sha256:sha(p)});}
  }
}
const report={passed:checks.every(c=>c.passed),generatedAt:new Date().toISOString(),appVersion:'5.1.0',checks,artifacts,boundary:'Integrity and bundled files only. Runtime evidence is recorded separately; installer not installed in the user profile.'};
const out=path.join(root,'outputs/verification-v510');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,process.argv.includes('--unpacked-only')?'unpacked-integrity.json':'package-integrity.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));process.exitCode=report.passed?0:1;
