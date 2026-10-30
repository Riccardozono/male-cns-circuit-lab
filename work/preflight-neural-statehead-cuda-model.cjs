'use strict';
// Re-run the saved state-head from the line before replacing an active session.
const path=require('node:path'),crypto=require('node:crypto'),Model=require('./neural-statehead-cuda-model.cjs');
if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 required');
const modelFile=path.resolve(process.argv[2]);if(!process.argv[2])throw Error('State-head model file required');
const loaded=Model.load(modelFile),env=Model.createFromLoaded(loaded),trace=crypto.createHash('sha256'),started=performance.now();let state=env.state(),controls=0,overlap=0;
try{
  while(!state.complete&&performance.now()-started<600000){state=env.step();controls++;overlap+=Number(Math.min(state.car.outputs[1],state.car.outputs[2])!==0);trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');}
  const result=Object.fromEntries(['bestProgress','fitness','laps','reason','totalSimulationSeconds','complete','lapTimes'].map(k=>[k,state[k]])),actionTraceSha256=trace.digest('hex'),expected=loaded.data.expectedResult,passed=state.complete&&!overlap&&Model.stats().gpuCalls>=controls&&Model.stats().cpuFallbacks===0&&['bestProgress','fitness','laps','reason','totalSimulationSeconds','complete'].every(k=>result[k]===expected[k])&&JSON.stringify(result.lapTimes)===JSON.stringify(expected.lapTimes)&&actionTraceSha256===loaded.data.fullTraceSha256;
  const report={passed,modelFile,modelSha256:loaded.sha256,controls,overlap,result,actionTraceSha256,cuda:Model.stats(),wallSeconds:(performance.now()-started)/1000,boundary:'Current exact state-head CUDA full-trajectory proof before opening a private save; this is not evidence of multi-lap learning or app compatibility.'};console.log(JSON.stringify(report));if(!passed)process.exitCode=1;
}finally{Model.closeCuda();}
