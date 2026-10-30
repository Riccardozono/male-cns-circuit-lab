'use strict';
// Paired actual CUDA/physics rollout of an explicitly research-only early gate
// against the same V3 parent with zero state-head coefficients.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const Research=require('./neural-statehead-earlygate-research.cjs');

async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Use the pinned Node 24.19.0 runtime');
  const option=(name,fallback)=>{const value=process.argv.find(item=>item.startsWith(`--${name}=`));return value?value.slice(name.length+3):fallback;};
  const modelFile=path.resolve(option('model','')),output=path.resolve(option('output',''));
  if(!modelFile||!output||await fs.stat(output).then(()=>true,()=>false))throw Error('Provide a research model and a new output directory');
  const loaded=Research.loadResearch(modelFile),active=Research.createFromLoaded(loaded,{id:0}),parent=Research.createFromLoaded(loaded,{id:0,sharedTopology:active.topology,weights:Array(18).fill(0)});
  const traces={active:crypto.createHash('sha256'),parent:crypto.createHash('sha256')},samples=[];
  let activeSteps=0,parentSteps=0,firstGateControl=null,firstGateValue=null,firstOutputDivergenceControl=null,firstDifferenceBeforeLap=false,maxDelta=0,lastActiveLaps=0,lastParentLaps=0;
  const maxControls=18000,magnitude=values=>Math.max(...values.map(Math.abs));
  while((active.currentCar().alive&&activeSteps<maxControls)||(parent.currentCar().alive&&parentSteps<maxControls)){
    let activeState=null,parentState=null,gate=active.stateHeadSnapshot().gate,delta=null;
    if(active.currentCar().alive&&activeSteps<maxControls){activeState=active.step();activeSteps++;gate=active.stateHeadSnapshot().gate;traces.active.update(JSON.stringify([activeState.bestProgress,activeState.totalSimulationSeconds,activeState.car.outputs])+'\n');if(firstGateControl===null&&gate>1e-8){firstGateControl=activeSteps;firstGateValue=gate;}}
    if(parent.currentCar().alive&&parentSteps<maxControls){parentState=parent.step();parentSteps++;traces.parent.update(JSON.stringify([parentState.bestProgress,parentState.totalSimulationSeconds,parentState.car.outputs])+'\n');}
    if(activeState&&parentState){delta=magnitude(activeState.car.outputs.map((value,index)=>value-parentState.car.outputs[index]));maxDelta=Math.max(maxDelta,delta);if(firstOutputDivergenceControl===null&&delta>1e-8){firstOutputDivergenceControl=activeSteps;firstDifferenceBeforeLap=(activeState.car.laps??0)===0;}}
    const control=Math.max(activeSteps,parentSteps);
    const activeLaps=active.currentCar().laps,parentLaps=parent.currentCar().laps;
    if(control%500===0||activeLaps!==lastActiveLaps||parentLaps!==lastParentLaps){samples.push({control,active:{progress:active.currentCar().bestProgress,laps:activeLaps,alive:active.currentCar().alive,gate,outputs:active.currentCar().outputs.slice()},parent:{progress:parent.currentCar().bestProgress,laps:parentLaps,alive:parent.currentCar().alive,outputs:parent.currentCar().outputs.slice()},outputDelta:delta});lastActiveLaps=activeLaps;lastParentLaps=parentLaps;}
    if(control%2000===0)console.log('STATEHEAD_EARLY_GATE_ROLLOUT_PROGRESS '+JSON.stringify({control,activeProgress:active.currentCar().bestProgress,activeLaps:active.currentCar().laps,activeGate:gate,parentProgress:parent.currentCar().bestProgress,parentLaps:parent.currentCar().laps}));
  }
  const a=active.state(),b=parent.state(),modelSha256=crypto.createHash('sha256').update(await fs.readFile(modelFile)).digest('hex');
  const report={passed:activeSteps>0&&parentSteps>0,model:{file:modelFile,sha256:modelSha256,parentCleanModelSha256:loaded.data.provenance.parentCleanModelSha256,gateRevision:loaded.data.provenance.earlyGateRevision,protectedFraction:loaded.data.provenance.protectedFraction},runtime:process.versions.node,controls:{active:activeSteps,parent:parentSteps},firstGateControl,firstGateSeconds:firstGateControl===null?null:firstGateControl*.1,firstGateValue,firstOutputDivergenceControl,firstDifferenceBeforeFirstLap:firstDifferenceBeforeLap,maxOutputDelta:maxDelta,active:{progress:a.bestProgress,laps:a.laps,lapTimes:a.lapTimes,reason:a.reason,totalSimulationSeconds:a.totalSimulationSeconds,traceSha256:traces.active.digest('hex')},frozenParent:{progress:b.bestProgress,laps:b.laps,lapTimes:b.lapTimes,reason:b.reason,totalSimulationSeconds:b.totalSimulationSeconds,traceSha256:traces.parent.digest('hex')},samples,gpu:Research.stats(),interpretation:'Same-seed real physics and exact CUDA compare the early-gate research decoder with zero correction on the identical V3 parent. One rollout is causal evidence for this seed only, not generalization or a clean-release proof.'};
  await fs.mkdir(output,{recursive:false});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('STATEHEAD_EARLY_GATE_ROLLOUT '+JSON.stringify({passed:report.passed,firstGateControl,firstOutputDivergenceControl,firstDifferenceBeforeLap,active:report.active,frozenParent:report.frozenParent,gpu:report.gpu,report:path.join(output,'report.json')}));
  Research.closeCuda();
}
main().catch(error=>{console.error(error.stack||String(error));Research.closeCuda();process.exitCode=1;});
