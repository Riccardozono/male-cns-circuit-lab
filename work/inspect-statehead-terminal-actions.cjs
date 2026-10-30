'use strict';
// Read-only replay instrumentation for the verified state-head model.
const crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const selected=Model.defaultChoice(),loaded=Model.load(selected.file),env=Model.createFromLoaded(loaded,{id:0});
const trace=crypto.createHash('sha256');let controls=0,maxGate=0,gateSum=0,activeGate=0,maxResidual=0,ring=[];
try{
  let state;
  while(controls<12000){
    state=env.step();controls++;
    trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');
    const snap=env.stateHeadSnapshot(),gate=snap.gate,features=snap.features||[];
    maxGate=Math.max(maxGate,gate);gateSum+=gate;if(gate>1e-8)activeGate++;
    maxResidual=Math.max(maxResidual,...features.slice(1).map(Math.abs));
    ring.push({control:controls,seconds:Number(state.totalSimulationSeconds.toFixed(2)),progress:Number(state.bestProgress.toFixed(2)),
      laps:state.laps,speedMps:Number((state.car.vehicle?.speedMps||0).toFixed(3)),outputs:state.car.outputs.map(v=>Number(v.toFixed(3))),
      gate:Number(gate.toFixed(6)),projectionFeatures:features.map(v=>Number(v.toFixed(6))),
      maxAbsProjectionFeature:Number(Math.max(0,...features.slice(1).map(Math.abs)).toFixed(6))});
    if(ring.length>12)ring.shift();
    if(state.complete)break;
  }
  console.log(JSON.stringify({format:'male-cns-statehead-terminal-actions-v1',modelSha256:loaded.sha256,
    selectedResult:state&&{progress:state.bestProgress,laps:state.laps,lapTimes:state.lapTimes,fitness:state.fitness,reason:state.reason,
      simulationSeconds:state.totalSimulationSeconds,complete:state.complete},controls,
    expectedActionTraceSha256:selected.actionTraceSha256,observedActionTraceSha256:trace.digest('hex'),
    gate:{max:maxGate,mean:gateSum/Math.max(1,controls),activeControls:activeGate,activeFraction:activeGate/Math.max(1,controls)},
    maxAbsProjectionFeature:maxResidual,last40Controls:ring},null,2));
}finally{Model.closeCuda();}
