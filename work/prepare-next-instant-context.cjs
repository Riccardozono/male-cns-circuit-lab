'use strict';
// Fit only actually observed neuronal values from the CURRENT verified winner.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),Model=require('./neural-instant-context-model.cjs'),Context=require('./neural-context-readout.cjs'),I=require('./neural-research-source-identity.cjs');
const base=path.resolve('.impeccable/review/neural-sacl'),out=path.join(base,'next-instant-context192-prepared');fs.mkdirSync(out);
try{
 const modelFile=path.join(base,'neuronal-instant-context256-first/clean.malecns-instant-context.json'),loaded=Model.load(modelFile),env=Model.createFromLoaded(loaded),observations=[],trace=crypto.createHash('sha256');let state=env.state();
 while(!state.complete){observations.push(state.observation.slice());state=env.step();trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');}
 assert.equal(trace.digest('hex'),loaded.data.fullTraceSha256);
 const n=observations.length,tail=192,protectedCount=n-tail,mean=Array(516).fill(0),variance=Array(516).fill(0);
 for(const row of observations)for(let j=0;j<516;j++)mean[j]+=row[j]/n;
 for(const row of observations)for(let j=0;j<516;j++)variance[j]+=(row[j]-mean[j])**2/n;
 const scales=variance.map(v=>Math.max(.02,Math.sqrt(v))),centreIndices=[.75,.5,.25].map(f=>n-Math.round(tail*f));
 const centres=centreIndices.map(index=>{const values=observations[index].slice();let nearest=Infinity;for(let i=0;i<protectedCount;i++)nearest=Math.min(nearest,Context.distance(observations[i],values,scales));assert(nearest>1e-8);return {values,radius:nearest*.75};});
 let first=-1;for(let i=0;i<n;i++){const active=centres.some(c=>Context.feature(observations[i],c,scales)>0);if(i<protectedCount)assert(!active);if(first<0&&active)first=i;}
 assert(first>=protectedCount&&first<n-8);
 const raw=Float64Array.from(observations.flat()),rawFile=path.join(out,'observations.f64');fs.writeFileSync(rawFile,Buffer.from(raw.buffer),{flag:'wx'});
 const p={format:'male-cns-next-instant-context-preparation-v1',modelFile,modelSha256:loaded.sha256,basis:{scales,centres,protectedCount,sourceObservationCount:n},centreIndices,firstActivatedControl:first,sourceFullResult:loaded.data.expectedResult,sourceFullTraceSha256:loaded.data.fullTraceSha256,observationsSha256:I.sha(fs.readFileSync(rawFile)),sourceHashes:I.collect(['work/prepare-next-instant-context.cjs','work/neural-instant-context-model.cjs']),boundary:'Only actual neuronal history/controller observations; no route, clock, pose or action labels. Previous model frozen; three new contexts/six coefficients.'};
 fs.writeFileSync(path.join(out,'prepared.json'),JSON.stringify(p,null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,rows:n,firstActivatedControl:first,protectedCount,centreIndices}));
}catch(error){fs.writeFileSync(path.join(out,'failed.json'),JSON.stringify({error:error.stack}),{flag:'wx'});console.error(error.stack);process.exitCode=1;}finally{Model.close();}
