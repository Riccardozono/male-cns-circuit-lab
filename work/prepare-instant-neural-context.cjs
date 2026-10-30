'use strict';
// Observation-only basis fitted to an actual native neuronal trajectory.
// No ideal commands/geometry/physical targets are columns in the basis fit.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),Model=require('./neural-statehead-cuda-packed-runtime.cjs'),Context=require('./neural-context-readout.cjs'),I=require('./neural-research-source-identity.cjs');
const base=path.resolve('.impeccable/review/neural-sacl'),out=path.join(base,'instant-neural-context256-prepared');fs.mkdirSync(out,{recursive:false});
try{
 const modelFile=path.join(base,'neuronal-statehead-6584-cma-search/clean.malecns-statehead.json'),loaded=Model.load(modelFile),env=Model.createFromLoaded(loaded),observations=[],trace=crypto.createHash('sha256');let state=env.state();
 while(!state.complete){observations.push(state.observation.slice());state=env.step();trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');}
 assert.equal(trace.digest('hex'),loaded.data.fullTraceSha256);const n=observations.length,tail=256,protectedCount=n-tail,mean=Array(516).fill(0),variance=Array(516).fill(0);
 for(const row of observations)for(let j=0;j<516;j++)mean[j]+=row[j]/n;
 for(const row of observations)for(let j=0;j<516;j++)variance[j]+=(row[j]-mean[j])**2/n;
 const scales=variance.map(v=>Math.max(.02,Math.sqrt(v))),centreIndices=[.75,.5,.25].map(f=>n-Math.round(tail*f));
 const centres=centreIndices.map(index=>{const values=observations[index].slice();let nearest=Infinity;for(let i=0;i<protectedCount;i++)nearest=Math.min(nearest,Context.distance(observations[i],values,scales));assert(nearest>1e-8);return {values,radius:nearest*.75};});
 let first=-1;for(let i=0;i<n;i++){const active=centres.some(c=>Context.feature(observations[i],c,scales)>0);if(i<protectedCount)assert(!active);if(first<0&&active)first=i;}
 assert(first>=protectedCount&&first<n-8);const raw=Float64Array.from(observations.flat()),rawFile=path.join(out,'actual-neuronal-observations.f64');fs.writeFileSync(rawFile,Buffer.from(raw.buffer),{flag:'wx'});
 const prepared={format:'male-cns-actual-instant-neural-context-preparation-v1',schema:1,modelFile,modelSha256:loaded.sha256,numericRuntime:'24.19.0',appVersion:'5.6.0',basis:{scales,centres,protectedCount,sourceObservationCount:n},centreIndices,firstActivatedControl:first,sourceFullResult:loaded.data.expectedResult,sourceFullTraceSha256:loaded.data.fullTraceSha256,actualObservationRows:n,observationDimensions:516,observationsBeforeControl:true,observationsSha256:I.sha(fs.readFileSync(rawFile)),sourceHashes:I.collect(['work/prepare-instant-neural-context.cjs','work/neural-statehead-cuda-packed-runtime.cjs']),boundary:'Actual neuronal history/controller-state observations only. Tail indices choose training context data, never serve as policy inputs. No route, physical state targets or ideal action labels.'};
 fs.writeFileSync(path.join(out,'prepared.json'),JSON.stringify(prepared,null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,rows:n,firstActivatedControl:first,protectedCount,centreIndices,dimensions:6}));
}catch(error){fs.writeFileSync(path.join(out,'failed.json'),JSON.stringify({passed:false,error:error.stack},null,2),{flag:'wx'});console.error(error.stack);process.exitCode=1;}finally{Model.closeCuda();}
