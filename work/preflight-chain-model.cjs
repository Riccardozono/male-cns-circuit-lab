'use strict';
// Prove the desktop adapter itself, not only a checksum or a starting pose.
const Model=require('./neural-chain-desktop-model.cjs'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const loaded=Model.load(process.argv[2]),env=Model.createFromLoaded(loaded),trace=crypto.createHash('sha256'),start=performance.now();let state=env.state(),controls=0;
if(state.complete||state.totalSimulationSeconds!==0||state.bestProgress!==0||env.graph.n!==7721||env.graph.edgeCount!==242486)throw Error('Actual V3/Monza from-line model required');
while(!state.complete&&performance.now()-start<180000){state=env.step();controls++;if(Math.min(state.car.outputs[1],state.car.outputs[2])!==0)throw Error('Exclusive pedals required');trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');}
const actionTraceSha256=trace.digest('hex'),expected=loaded.data.verifiedFullResult;
if(!state.complete||!['bestProgress','fitness','laps','reason','totalSimulationSeconds'].every(k=>state[k]===expected[k])||JSON.stringify(state.lapTimes)!==JSON.stringify(expected.lapTimes)||actionTraceSha256!==loaded.inner.data.fullTraceSha256)throw Error('Complete physical replay differs from the independently verified neuronal model');
console.log(JSON.stringify({passed:true,modelSha256:loaded.sha256,nodeVersion:process.versions.node,parameters:2,controls,actionTraceSha256,bestProgress:state.bestProgress,fitness:state.fitness,laps:state.laps,lapTimes:state.lapTimes,complete:true,wallSeconds:(performance.now()-start)/1000}));
