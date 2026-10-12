'use strict';
// Read-only release/save compatibility verification; synthetic states only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),released=path.join(root,'dist-landscape-v560/win-unpacked/resources/app/outputs');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js'),Profiles=require('../outputs/model-profiles.js');
const OldF=require(path.join(released,'simulation.js')),OldP=require(path.join(released,'progress-save.js')),OldLegacy=require(path.join(released,'legacy-models.js')),OldProfiles=require(path.join(released,'model-profiles.js'));
const compact=require('../outputs/data/connectome.json'),meta=require('../outputs/data/connectome-full.json'),checks=[];
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),check=(name,passed,detail)=>checks.push({name,passed,detail});
const bytes=fs.readFileSync(path.join(root,'outputs/data',meta.binary)),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),types={float64:Float64Array,float32:Float32Array,int32:Int32Array,uint32:Uint32Array,uint8:Uint8Array,int8:Int8Array};
const full={...meta,compact:true};for(const [name,d]of Object.entries(meta.arrays))full[name]=new types[d.dtype](buffer,d.offset,d.length);
check('Anatomical binary unchanged',sha(bytes)===meta.binarySha256,meta.binarySha256);
for(const id of ['v2','v3','v4','v5']){
  const oldData=id==='v2'?OldLegacy.buildV2(compact):id==='v3'?OldLegacy.tagV3(compact):id==='v5'?OldProfiles.buildV5(full):full;
  const newData=id==='v2'?Legacy.buildV2(compact):id==='v3'?Legacy.tagV3(compact):id==='v5'?Profiles.buildV5(full):full;
  const old=new OldF.Simulation(oldData,{population:4}),current=new F.Simulation(newData,{population:4});
  // Old optimizer states and ledgers are produced by the released module;
  // no user file is opened, imported, modified or migrated.
  old.evolve();const state=OldP.capture(old);P.restore(current,state);
  check(id+': released training state accepted unchanged',JSON.stringify(P.capture(current))===JSON.stringify(state),{policyVersion:current.graph.learning.version,parameters:current.graph.learning.length});
  check(id+': model/save contract unchanged',JSON.stringify(P.compatibleGraph(current.graph))===JSON.stringify(OldP.compatibleGraph(old.graph)));
}
for(const file of ['outputs/rewards.js','outputs/vehicle-992.js','outputs/progress-save.js','outputs/model-profiles.js','desktop/engine.cjs','desktop/worker.cjs','package.json','package-lock.json']){
  const before=cp.execFileSync('git',['show','v5.6.0:'+file],{cwd:root,maxBuffer:4*1024*1024}).toString().replace(/\r\n/g,'\n');
  const after=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');check(file+': unchanged from release',sha(before)===sha(after));
}
for(const [file,expected]of [['MAL-E-CNS-Circuit-Lab-portable-5.6.0-x64.exe','95f5bff7c029d0f7661ba9677031efc528d5e1d82c76dada42579336b8654424'],['MAL-E-CNS-Circuit-Lab-setup-5.6.0-x64.exe','c070442d86f6e406e84b915774deeae974723b30f40e05929f51516292928ce5']])check(file+': published bytes untouched',sha(fs.readFileSync(path.join(root,'dist-landscape-v560',file)))===expected);
const result={passed:checks.every(c=>c.passed),checks,boundary:'Original 5.6.0 package, synthetic old-version states, no real user saves, installer not executed. Continuing training uses the new selection/sampling algorithm, not an identical old rollout.'};
const out=path.join(root,'.impeccable/review/learning-ml/preservation.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));
console.log(JSON.stringify({passed:result.passed,checks:checks.length,failed:checks.filter(c=>!c.passed)}));if(!result.passed)process.exitCode=1;
