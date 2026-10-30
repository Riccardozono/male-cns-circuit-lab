'use strict';
const Model=require('./neural-statehead-model.cjs'),crypto=require('node:crypto'),path=require('node:path'),{performance}=require('node:perf_hooks');
function execute(config){
  if(process.versions.node!=='24.19.0')throw Error('Pinned numerical runtime required');const model=Model.load(path.resolve(config.file),{allowResearch:config.allowResearch===true}),env=Model.createFromLoaded(model),trace=crypto.createHash('sha256'),start=performance.now();let state=env.state(),controls=0,overlap=0;
  while(!state.complete&&performance.now()-start<180000){state=env.step();controls++;overlap+=Number(Math.min(state.car.outputs[1],state.car.outputs[2])!==0);trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');}
  const result=Object.fromEntries(['bestProgress','fitness','laps','reason','totalSimulationSeconds','complete','lapTimes'].map(k=>[k,state[k]])),actionTraceSha256=trace.digest('hex');
  const passed=state.complete&&!overlap&&['bestProgress','fitness','laps','reason','totalSimulationSeconds'].every(k=>result[k]===model.data.expectedResult[k])&&JSON.stringify(result.lapTimes)===JSON.stringify(model.data.expectedResult.lapTimes)&&actionTraceSha256===model.data.fullTraceSha256;
  return {passed,complete:state.complete,censored:!state.complete,modelSha256:model.sha256,result,actionTraceSha256,overlap,actualActorControls:controls,wallSeconds:(performance.now()-start)/1000,boundary:'Actual complete independently loaded native state-dependent neuronal model from the line, no cached physics or teacher. A zero-seed match proves identity, NOT a trained improvement.'};
}
if(require.main===module){const r=execute(JSON.parse(process.argv[2]));console.log(JSON.stringify(r));if(!r.passed)process.exitCode=1;}
module.exports={execute};
