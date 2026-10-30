'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),Core=require('./neural-current-feedback.cjs'),Native=require('./neural-additive-memory-native.cjs'),I=require('./neural-research-source-identity.cjs');
const dir=path.resolve('.impeccable/review/neural-sacl/current-neuronal-feedback-prepared');fs.mkdirSync(dir);
try{
 const p=Core.loadParent(),env=Native.create(p.frozenMemoryGenes),rows=[],hash=crypto.createHash('sha256');let s=env.state(),first=-1;
 while(!s.complete){if(first<0&&env.memoryValues().some(v=>v>0))first=rows.length;rows.push(s.observation.slice());s=env.step();hash.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,s.car.outputs])+'\n');}
 assert.equal(hash.digest('hex'),p.trace);for(const k of ['bestProgress','fitness','laps','reason','totalSimulationSeconds','lapTimes'])assert.deepEqual(s[k],p.expectedResult[k]);assert(first>0&&rows.length-first>=32);
 const raw=Float64Array.from(rows.flat()),file=path.join(dir,'observations.f64');fs.writeFileSync(file,Buffer.from(raw.buffer),{flag:'wx'});
 const prepared={format:'male-cns-current-neuronal-feedback-preparation-v1',parentReportSha256:p.parentReportSha256,sourceTrace:p.trace,expectedResult:p.expectedResult,firstActiveControl:first,rows:rows.length,observationSha256:I.sha(fs.readFileSync(file)),basis:Core.fit(rows.slice(first)),sourceHashes:I.collect(['work/prepare-current-feedback.cjs','work/neural-current-feedback.cjs','work/neural-additive-memory-native.cjs']),boundary:'Eight current actual descending-neuron columns, fit without physical targets or action labels; artificial learned feedback, not new biological neurons.'};fs.writeFileSync(path.join(dir,'prepared.json'),JSON.stringify(prepared,null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,rows:rows.length,first,basis:prepared.basis}));
}finally{Native.close();}
