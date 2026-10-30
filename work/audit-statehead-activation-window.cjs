'use strict';
// Paired actual-physics audit: when do the learned state-head coefficients
// first change the real motor output compared with the frozen parent?
const fs=require('node:fs/promises');
const path=require('node:path');
const Model=require('./neural-statehead-cuda-model.cjs');

async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Use the pinned Node 24.19.0 runtime');
  const arg=process.argv.find(value=>value.startsWith('--output='));
  if(!arg)throw Error('An explicit new --output directory is required');
  const output=path.resolve(arg.slice('--output='.length));
  if(await fs.stat(output).then(()=>true,()=>false))throw Error('Preserve existing output; choose a new directory');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file);
  const active=Model.createFromLoaded(loaded,{id:0,weights:loaded.data.weights});
  const parent=Model.createFromLoaded(loaded,{id:0,sharedTopology:active.topology,weights:Array(18).fill(0)});
  const samples=[],maxControls=10000;
  let firstGateControl=null,firstGateValue=null,firstOutputDivergenceControl=null,maxDelta=0,steps=0;
  let outputDivergenceBeforeLap=false;
  const magnitude=values=>Math.max(...values.map(Math.abs));
  for(let i=0;i<maxControls;i++){
    if(!active.currentCar().alive||!parent.currentCar().alive)break;
    const a=active.step(),b=parent.step();steps=i+1;
    const gate=active.stateHeadSnapshot().gate;
    const delta=magnitude(a.car.outputs.map((value,j)=>value-b.car.outputs[j]));
    maxDelta=Math.max(maxDelta,delta);
    if(firstGateControl===null&&gate>1e-8){firstGateControl=steps;firstGateValue=gate;}
    if(firstOutputDivergenceControl===null&&delta>1e-8){firstOutputDivergenceControl=steps;outputDivergenceBeforeLap=(a.car.laps??0)===0;}
    if(steps%500===0||a.car.laps>0){samples.push({control:steps,simulatedSeconds:a.car.lifetime,progress:a.car.bestProgress,laps:a.car.laps,gate,outputDelta:delta});}
    if(steps%2000===0)console.log('STATEHEAD_AUDIT_PROGRESS '+JSON.stringify({control:steps,simulatedSeconds:a.car.lifetime,progress:a.car.bestProgress,laps:a.car.laps,gate,outputDelta:delta}));
    if(a.car.laps>=2||!a.car.alive||!b.car.alive)break;
  }
  const actual=active.state(),frozen=parent.state();
  const report={passed:steps>0,model:{file:selected.file,sha256:selected.modelSha256},runtime:process.versions.node,controlsCompared:steps,firstGateControl,firstGateSimulatedSeconds:firstGateControl===null?null:firstGateControl*.1,firstGateValue,firstOutputDivergenceControl,firstOutputDivergenceSimulatedSeconds:firstOutputDivergenceControl===null?null:firstOutputDivergenceControl*.1,outputDivergenceBeforeFirstLap:outputDivergenceBeforeLap,maxOutputDelta:maxDelta,active:{progress:actual.bestProgress,laps:actual.laps,lapTimes:actual.lapTimes,reason:actual.reason,totalSimulationSeconds:actual.totalSimulationSeconds},frozenParent:{progress:frozen.bestProgress,laps:frozen.laps,lapTimes:frozen.lapTimes,reason:frozen.reason,totalSimulationSeconds:frozen.totalSimulationSeconds},samples,gpu:Model.stats(),interpretation:'Paired deterministic rollouts isolate whether the new coefficients affect motor outputs and physical progress early enough to influence the first lap. This is a single same-seed diagnostic, not evidence of generalization.'};
  await fs.mkdir(output,{recursive:false});
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('STATEHEAD_ACTIVATION_AUDIT '+JSON.stringify({passed:report.passed,controlsCompared:steps,firstGateControl,firstOutputDivergenceControl,outputDivergenceBeforeFirstLap:outputDivergenceBeforeLap,active:report.active,frozenParent:report.frozenParent,gpu:report.gpu,report:path.join(output,'report.json')}));
  Model.closeCuda();
}
main().catch(error=>{console.error(error.stack||String(error));Model.closeCuda();process.exitCode=1;});
