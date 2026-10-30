'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),Parent=require('./neural-statehead-cuda-packed-runtime.cjs'),Native=require('./neural-instant-context-native.cjs'),Context=require('./neural-context-readout.cjs'),I=require('./neural-research-source-identity.cjs');
const base=path.resolve('.impeccable/review/neural-sacl'),dir=path.join(base,'instant-neural-context256-prepared'),proofFile=path.join(dir,'verification.json');
if(fs.existsSync(proofFile))throw Error('Preserve completed context verification');
try{
 const preparedFile=path.join(dir,'prepared.json'),p=JSON.parse(fs.readFileSync(preparedFile,'utf8')),bytes=fs.readFileSync(path.join(dir,'actual-neuronal-observations.f64')),raw=new Float64Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/8),n=p.actualObservationRows;
 assert.equal(I.sha(bytes),p.observationsSha256);assert.equal(raw.length,n*516);for(const [file,sha]of Object.entries(p.sourceHashes))assert.equal(I.sha(fs.readFileSync(path.resolve(file))),sha);
 const mean=Array(516).fill(0),variance=Array(516).fill(0);for(let i=0;i<n;i++)for(let j=0;j<516;j++)mean[j]+=raw[i*516+j]/n;
 for(let i=0;i<n;i++)for(let j=0;j<516;j++)variance[j]+=(raw[i*516+j]-mean[j])**2/n;
 assert.deepEqual(variance.map(v=>Math.max(.02,Math.sqrt(v))),p.basis.scales);
 for(let c=0;c<p.centreIndices.length;c++){
  const values=Array.from(raw.subarray(p.centreIndices[c]*516,(p.centreIndices[c]+1)*516));assert.deepEqual(p.basis.centres[c].values,values);let nearest=Infinity;
  for(let i=0;i<p.basis.protectedCount;i++)nearest=Math.min(nearest,Context.distance(raw.subarray(i*516,(i+1)*516),values,p.basis.scales));assert.equal(p.basis.centres[c].radius,nearest*.75);
 }
 const loaded=Parent.load(p.modelFile),parent=Parent.createFromLoaded(loaded);let state=parent.state(),controls=0;const trace=crypto.createHash('sha256');
 while(!state.complete){assert.deepEqual(state.observation,Array.from(raw.subarray(controls*516,(controls+1)*516)));state=parent.step();controls++;trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');}
 assert.equal(controls,n);assert.equal(trace.digest('hex'),p.sourceFullTraceSha256);const parentCuda=Parent.stats();Parent.closeCuda();
 const native=Native.create({modelFile:p.modelFile,preparedFile,weights:Array(6).fill(0)}),zeroTrace=crypto.createHash('sha256');state=native.state();let zeroControls=0;
 while(!state.complete){state=native.step();zeroControls++;zeroTrace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');}
 assert.equal(zeroTrace.digest('hex'),p.sourceFullTraceSha256);assert.equal(Native.stats().cpuFallbacks,0);assert.equal(parentCuda.cpuFallbacks,0);
 const report={passed:true,preparedSha256:I.sha(fs.readFileSync(preparedFile)),parentModelSha256:loaded.sha256,actualNeuronalValuesReproduced:n*516,independentParentControls:controls,independentInstantZeroControls:zeroControls,zeroNativeTraceStillExact:true,parentCuda,zeroNativeCuda:Native.stats(),sources:I.collect(['work/verify-instant-neural-context-preparation.cjs','work/neural-instant-context-native.cjs']),boundary:'Independent raw observation replay, basis-statistic reconciliation and full native zero-correction proof. No learned driving improvement claim.'};
 fs.writeFileSync(proofFile,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,actualNeuronalValuesReproduced:n*516,zeroNativeTraceStillExact:true}));
}catch(error){fs.writeFileSync(path.join(dir,'verification-failed.json'),JSON.stringify({passed:false,error:error.stack},null,2),{flag:'wx'});console.error(error.stack);process.exitCode=1;}finally{Parent.closeCuda();Native.close();}
