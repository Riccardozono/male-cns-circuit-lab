'use strict';
// Physical actuator diagnostics on copies of actual reached states only.
// These counterfactual commands are NEVER policy targets or training examples.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),Model=require('./neural-statehead-cuda-packed-runtime.cjs'),I=require('./neural-research-source-identity.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/neural-sacl'),out=path.join(base,'actual-native-braking-diagnostic-first');fs.mkdirSync(out,{recursive:false});
try{
 const loaded=Model.load(path.join(base,'neuronal-statehead-6584-cma-search/clean.malecns-statehead.json')),env=Model.createFromLoaded(loaded),checkpoints=new Set([7000,7727,7900,8200,8400]),records=[],trace=crypto.createHash('sha256');let state=env.state(),controls=0;
 function speed(car){return car.vehicle?.speedMps??car.speed/(car.pixelsPerMeter||1);}
 function probe(car,label,commands){
  const body=structuredClone(car),start=speed(body),telemetryBefore=env.runtime.Vehicle.telemetry(body.vehicle,true);let steps=0;
  for(let k=0;k<15&&body.alive;k++){env.runtime.drive(env.track,body,commands,env.runtime.DT);steps++;}
  return {label,commands,actualPhysicsSteps:steps,elapsed:steps*env.runtime.DT,initialSpeedMps:start,finalSpeedMps:speed(body),alive:body.alive,reason:body.reason,telemetryBefore,telemetryAfter:env.runtime.Vehicle.telemetry(body.vehicle,true)};
 }
 while(!state.complete){
  state=env.step();controls++;trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');
  if(checkpoints.has(controls)){
   const car=state.car,steer=car.outputs[0],before=JSON.stringify(car),cases=[probe(car,'coast',[steer,0,0]),probe(car,'full-brake',[steer,0,1]),probe(car,'full-throttle',[steer,1,0])];
   assert.equal(JSON.stringify(car),before,'Diagnostics must not alter the actual neuronal car');
   records.push({controls,actualProgress:state.bestProgress,actualSimulationSeconds:state.totalSimulationSeconds,actualLearnedCommands:car.outputs.slice(),cases});
  }
 }
 assert.equal(trace.digest('hex'),loaded.data.fullTraceSha256);assert.equal(records.length,5);assert.equal(Model.stats().cpuFallbacks,0);
 const unimpeded=records.filter(r=>r.cases.every(c=>c.alive&&c.actualPhysicsSteps===15));
 assert(unimpeded.length>0);for(const r of unimpeded)assert(r.cases[1].finalSpeedMps<r.cases[0].finalSpeedMps,'Brake must slow more than coast in unimpeded actually reached states');
 const report={passed:true,records,unimpededStates:unimpeded.length,modelSha256:loaded.sha256,fullNativeParentTraceStillExact:true,cuda:Model.stats(),sources:I.collect(['work/probe-neural-native-braking.cjs','work/neural-statehead-cuda-packed-runtime.cjs']),boundary:'Short fixed-command physical counterfactuals only, not a driving controller, demonstrations, data used in learning or real-world Porsche validation.'};fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,unimpededStates:unimpeded.length,summary:records.map(r=>({controls:r.controls,progress:r.actualProgress,cases:r.cases.map(c=>({label:c.label,initial:c.initialSpeedMps,final:c.finalSpeedMps,alive:c.alive}))}))}));
}catch(error){fs.writeFileSync(path.join(out,'failed.json'),JSON.stringify({passed:false,error:error.stack},null,2),{flag:'wx'});console.error(error.stack);process.exitCode=1;}finally{Model.closeCuda();}
