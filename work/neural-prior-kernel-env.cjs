'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks'),Native=require('./neural-prior-kernel-native.cjs'),Motors=require('./neural-prior-kernel-motors.cjs'),R8=require('./neural-prior-training-objective-r8.cjs');
function create(){
 const env=Native.create(),metadata=env.metadata();let s=env.state();const prefixHash=crypto.createHash('sha256'),started=performance.now();
 while(!s.complete&&s.bestProgress<6350&&performance.now()-started<180000){s=env.step(metadata.initialWeights);prefixHash.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,s.car.outputs])+'\n');}
 assert.ok(!s.complete&&s.bestProgress>=6350&&s.laps===1,'Actually reached prior checkpoint required');
 const checkpoint=env.capture(),checkpointInfo={progress:s.bestProgress,controls:s.controls,laps:s.laps,simulationSeconds:s.totalSimulationSeconds};
 function evaluate(weights,mode='practice'){
  Motors.validate(weights);assert.ok(['full','practice'].includes(mode));s=mode==='full'?env.reset():env.restore(checkpoint);
  const start={kind:mode==='full'?'line':'actual-neuronal-prefix',progress:s.bestProgress,controls:s.controls,laps:s.laps,simulationSeconds:s.totalSimulationSeconds},hash=mode==='full'?crypto.createHash('sha256'):prefixHash.copy(),t=performance.now();let overlap=0;
  while(!s.complete&&performance.now()-t<180000){s=env.step(weights);hash.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,s.car.outputs])+'\n');overlap+=Number(Math.min(s.car.outputs[1],s.car.outputs[2])>0);}
  const result={bestProgress:s.bestProgress,fitness:s.fitness,laps:s.laps,reason:s.reason,complete:s.complete,totalSimulationSeconds:s.totalSimulationSeconds,lapTimes:s.lapTimes.slice(),controls:s.controls};
  return {result,complete:s.complete,censored:!s.complete,overlap,validationMode:mode==='full'?'full-from-line':'restored-prior-checkpoint',episodeStart:start,actualNewControls:s.controls-start.controls,actualNewProgress:s.bestProgress-start.progress,actualNewLapGates:s.laps-start.laps,actualNewSimulationSeconds:s.totalSimulationSeconds-start.simulationSeconds,trainingFitness:R8.fitness(result),actionTraceSha256:hash.digest('hex'),boundary:mode==='full'?'Actual full policy drive from line.':'Hash includes historical prior prefix, not this candidate driving the prefix. Restored first lap is NOT a newly learned lap. Requires separate full-from-line validation.'};
 }
 return {evaluate,metadata:()=>({...metadata,checkpoint:checkpointInfo,cuda:{identity:require('./cuda-exact-v3-packed-runtime.cjs').identity(),stats:Native.stats()}})};
}
if(require.main===module){let env;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{if(line.length>32768)throw Error('Bounded request required');const m=JSON.parse(line);id=m.id;let result;if(m.op==='init'){if(env)throw Error('Already initialized');env=create();result=env.metadata();}else if(!env)throw Error('Initialize first');else if(m.op==='evaluate')result=env.evaluate(m.weights,m.mode);else if(m.op==='metadata')result=env.metadata();else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');}catch(e){process.stdout.write(JSON.stringify({id,error:e.stack})+'\n');}});}
module.exports={create};
