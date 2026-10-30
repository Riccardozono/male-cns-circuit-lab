'use strict';
// Prove the desktop adapter itself, not only a checksum or a starting pose.
const Model=require('./neural-instant-desktop-model.cjs'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const loaded=Model.load(process.argv[2]),env=Model.createFromLoaded(loaded),trace=crypto.createHash('sha256'),start=performance.now();let state=env.state(),controls=0;
if(state.complete||state.totalSimulationSeconds!==0||state.bestProgress!==0||env.graph.n!==7721||env.graph.edgeCount!==242486)throw Error('Actual V3/Monza from-line model required');
while(!state.complete&&performance.now()-start<180000){state=env.step();controls++;if(Math.min(state.car.outputs[1],state.car.outputs[2])!==0)throw Error('Exclusive pedals required');trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');}
const actionTraceSha256=trace.digest('hex'),expected=loaded.data.verifiedFullResult;
if(!state.complete||!['bestProgress','fitness','laps','reason','totalSimulationSeconds'].every(k=>state[k]===expected[k])||JSON.stringify(state.lapTimes)!==JSON.stringify(expected.lapTimes)||actionTraceSha256!==loaded.inner.data.fullTraceSha256)throw Error('Complete physical replay differs from the independently verified neuronal model');
const cuda=Model.stats();if(cuda.gpuCalls!==controls||cuda.cpuFallbacks!==0)throw Error('Every actual neural control must run on CUDA');
const proof={passed:true,modelSha256:loaded.sha256,nodeVersion:process.versions.node,parameters:6,controls,actionTraceSha256,bestProgress:state.bestProgress,fitness:state.fitness,laps:state.laps,lapTimes:state.lapTimes,complete:true,wallSeconds:(performance.now()-start)/1000,cuda,engineIdentity:require('./neural-instant-save.cjs').identity()};
Model.closeCuda();
if(process.argv.includes('--record-default')){
 const fs=require('node:fs'),path=require('node:path'),original=JSON.parse(fs.readFileSync(path.join(__dirname,'../.impeccable/review/neural-sacl/verified-research-frontier-v2.json'),'utf8')).selected;
 if(original.modelSha256!==loaded.sha256)throw Error('Only the verified default can be registered');
 fs.writeFileSync(path.join(__dirname,'../.impeccable/review/neural-sacl/instant-desktop-preflight.json'),JSON.stringify(proof,null,2),{flag:'wx'});
}
console.log(JSON.stringify(proof));
