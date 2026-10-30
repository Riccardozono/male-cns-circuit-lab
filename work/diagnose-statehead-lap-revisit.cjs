'use strict';
// Read-only, deterministic replay comparing the same Monza segment on lap 1
// and lap 2. Captures real neural commands, sensors, vehicle state and gate.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const out=path.resolve(__dirname,'../.impeccable/review/learning-ml/statehead-lap-revisit-telemetry-20261020-01');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite previous lap-revisit telemetry');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),env=Model.createFromLoaded(loaded,{id:0});
  const segments={lap1:[],lap2:[]},events=[],trace=crypto.createHash('sha256');let trackLength=null,controls=0,state=null;
  try{
    while(controls<12000){
      state=env.step();controls++;
      trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');
      const car=env.currentCar(),lap=car.laps,progress=car.progress;
      if(lap===1&&trackLength===null){trackLength=progress;events.push({event:'first-lap-line-crossing',control:controls,progress,seconds:car.lifetime});}
      const along=trackLength===null?progress:progress-lap*trackLength;
      const segment=along>=650&&along<=900?(lap===0?'lap1':lap===1?'lap2':null):null;
      if(segment&&controls%5===0){
        const head=env.stateHeadSnapshot(),vehicle=car.vehicle||{};
        segments[segment].push({control:controls,seconds:car.lifetime,lap,progress,along,x:car.x,y:car.y,heading:car.heading,
          speedMps:vehicle.speedMps??car.speed??0,outputs:car.outputs.slice(),gate:head.gate,features:head.features,
          sensors:car.inputs.slice(),physicsInputs:car.physicsInputs?.slice()||[],longitudinalG:car.longitudinalG,lateralG:car.lateralG,
          reason:car.reason});
      }
      if(state.complete)break;
    }
    const result=state&&{progress:state.bestProgress,laps:state.laps,lapTimes:state.lapTimes,fitness:state.fitness,
      reason:state.reason,seconds:state.totalSimulationSeconds,complete:state.complete};
    const report={format:'male-cns-statehead-lap-revisit-telemetry-v1',appVersion:'5.6.0',modelSha256:loaded.sha256,
      selectedActionTraceSha256:selected.actionTraceSha256,observedActionTraceSha256:trace.digest('hex'),
      method:'One deterministic from-line replay. Same agent’s sensor/controller/physics state is sampled every five controls between 650 and 900 m on the first two laps; no intervention or training.',
      trackLength,controls,result,events,segments,gpu:Model.stats(),boundary:'This diagnostic locates and compares the first repeated segment; it does not change policy, reward, physics, saved models or the running app.'};
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    const summarize=rows=>({samples:rows.length,first:rows[0]&&{progress:rows[0].progress,along:rows[0].along,speedMps:rows[0].speedMps,outputs:rows[0].outputs,gate:rows[0].gate},last:rows.at(-1)&&{progress:rows.at(-1).progress,along:rows.at(-1).along,speedMps:rows.at(-1).speedMps,outputs:rows.at(-1).outputs,gate:rows.at(-1).gate}});
    console.log('STATEHEAD_LAP_REVISIT_RESULT '+JSON.stringify({result,trackLength,controls,traceMatches:report.selectedActionTraceSha256===report.observedActionTraceSha256,
      lap1:summarize(segments.lap1),lap2:summarize(segments.lap2),gpu:report.gpu,output:path.join(out,'report.json')}));
  }finally{Model.closeCuda();}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
