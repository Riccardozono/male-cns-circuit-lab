'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),Native=require('./neural-next-instant-native.cjs'),Context=require('./neural-context-readout.cjs'),I=require('./neural-research-source-identity.cjs');
const base=path.resolve('.impeccable/review/neural-sacl'),preparedFile=path.join(base,'next-instant-context192-prepared/prepared.json'),p=JSON.parse(fs.readFileSync(preparedFile,'utf8'));
const study=process.argv[2],out=study?path.join(base,study,'independent-native.json'):path.join(path.dirname(preparedFile),'verification.json');
if(fs.existsSync(out))throw Error('Preserve existing proof');
try{
 const report=study?JSON.parse(fs.readFileSync(path.join(base,study,'report.json'),'utf8')):null;
 if(report){assert(report.passed&&report.bestClean);assert.equal(report.identity.preparedSha256,I.sha(fs.readFileSync(preparedFile)));}
 const genes=report?report.bestClean.genes:Array(6).fill(0),env=Native.create({modelFile:p.modelFile,preparedFile,weights:genes}),trace=crypto.createHash('sha256');let state=env.state(),controls=0;
 const bytes=report?null:fs.readFileSync(path.join(path.dirname(preparedFile),'observations.f64')),observations=[];
 if(bytes)assert.equal(I.sha(bytes),p.observationsSha256);
 while(!state.complete){if(bytes){for(let j=0;j<516;j++)assert.equal(state.observation[j],bytes.readDoubleLE((controls*516+j)*8));observations.push(state.observation.slice());}state=env.step();controls++;trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');}
 const expected=report?report.bestClean.episode.result:p.sourceFullResult,expectedTrace=report?report.bestClean.episode.actionTraceSha256:p.sourceFullTraceSha256;
 assert.equal(trace.digest('hex'),expectedTrace);for(const k of ['bestProgress','fitness','laps','reason','totalSimulationSeconds','lapTimes'])assert.deepEqual(state[k],expected[k]);
 if(bytes){
  assert.equal(controls,p.basis.sourceObservationCount);assert.equal(bytes.length,controls*516*8);
  const mean=Array(516).fill(0),variance=Array(516).fill(0);for(const row of observations)for(let j=0;j<516;j++)mean[j]+=row[j]/controls;for(const row of observations)for(let j=0;j<516;j++)variance[j]+=(row[j]-mean[j])**2/controls;
  assert.deepEqual(variance.map(v=>Math.max(.02,Math.sqrt(v))),p.basis.scales);
  p.basis.centres.forEach((c,k)=>{assert.deepEqual(c.values,observations[p.centreIndices[k]]);let nearest=Infinity;for(let i=0;i<p.basis.protectedCount;i++)nearest=Math.min(nearest,Context.distance(observations[i],c.values,p.basis.scales));assert.equal(c.radius,nearest*.75);});
  let first=-1;observations.forEach((row,i)=>{const active=p.basis.centres.some(c=>Context.feature(row,c,p.basis.scales)>0);if(i<p.basis.protectedCount)assert(!active);if(active&&first<0)first=i;});assert.equal(first,p.firstActivatedControl);
 }
 const cuda=Native.stats();assert(cuda.gpuCalls>0&&cuda.cpuFallbacks===0);
 const proof={passed:true,controls,actualObservationValuesReproduced:bytes?controls*516:0,result:Object.fromEntries(['bestProgress','fitness','laps','reason','totalSimulationSeconds','lapTimes'].map(k=>[k,state[k]])),actionTraceSha256:expectedTrace,preparedSha256:I.sha(fs.readFileSync(preparedFile)),reportSha256:report?I.sha(fs.readFileSync(path.join(base,study,'report.json'))):null,cuda,sourceHashes:I.collect(['work/verify-next-instant-native.cjs','work/neural-next-instant-native.cjs']),boundary:'Actual independent native full-from-line drive. Not deployment or proof of other models/tracks.'};
 fs.writeFileSync(out,JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify(proof));
}finally{Native.close();}
