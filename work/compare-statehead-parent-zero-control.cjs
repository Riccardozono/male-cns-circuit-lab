'use strict';
// Read-only counterfactual: replay the exact protected V3 parent with the
// experimental state-head weights zeroed, without changing either saved model.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/learning-ml/statehead-parent-zero-control-20261020');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite a previous parent-control report');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),modelSha=sha(fs.readFileSync(selected.file));
  if(modelSha!==selected.modelSha256)throw Error('Selected model changed during the diagnostic');
  const parentExpected=loaded.core.parent.data.expectedResult;
  const env=Model.createFromLoaded(loaded,{id:0,weights:Array(18).fill(0)});
  const samples=[];let state=null,controls=0,firstStop=null,brakeAtStop=null,lastSampleControl=-1;
  while(controls<12000){
    state=env.step();controls++;
    const car=state.car,ppm=car.pixelsPerMeter||1,progress=car.progress/ppm;
    if(progress>=6400){
      const row={control:controls,timeS:state.totalSimulationSeconds,progressM:progress,
        bestProgressM:state.bestProgress/ppm,speedKmh:car.vehicle.speedMps*3.6,
        outputs:car.outputs.slice(),gate:env.stateHeadSnapshot().gate,
        x:car.x/ppm,y:car.y/ppm,reason:state.reason||null};
      if(samples.length<1||controls-lastSampleControl>=10||!car.alive){samples.push(row);lastSampleControl=controls;}
      if(firstStop===null&&car.vehicle.speedMps<.05){firstStop=row;if(row.outputs[2]>.2)brakeAtStop=row.outputs[2];}
    }
    if(state.complete)break;
  }
  const fields=['bestProgress','fitness','laps','reason','totalSimulationSeconds'];
  const exact=state?.complete===true&&fields.every(key=>state[key]===parentExpected[key])&&
    JSON.stringify(state.lapTimes)===JSON.stringify(parentExpected.lapTimes);
  if(!exact)throw Error('Zero-head replay did not match exact protected V3-parent outcome: '+JSON.stringify({observed:state,parentExpected}));
  const report={format:'male-cns-statehead-parent-zero-control-v1',appVersion:'5.6.0',passed:true,
    method:'Exact from-line native CUDA replay using the same verified V3 parent with all 18 experimental decoder coefficients set to zero in memory. No file/model/save is changed.',
    model:{family:selected.family,file:selected.file,sha256:modelSha,parentSha256:loaded.core.parent.data.parentSha256||null,
      proofFile:selected.proofFile,nodeVersion:process.versions.node},expected:parentExpected,
    observed:{bestProgress:state.bestProgress,fitness:state.fitness,laps:state.laps,reason:state.reason,
      totalSimulationSeconds:state.totalSimulationSeconds,complete:state.complete,lapTimes:state.lapTimes},
    exactParentMatch:exact,controlSteps:controls,firstStop,brakeAtFirstStop:brakeAtStop,sampledControls:samples.length,
    trace:samples,sourceUnchanged:sha(fs.readFileSync(selected.file))===modelSha,
    boundary:'An exact zero-head replay isolates the correction head from its parent for this one seed; it does not prove broad V3 learning.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('STATEHEAD_PARENT_ZERO_CONTROL '+JSON.stringify({passed:true,exactParentMatch:exact,
    observed:report.observed,firstStop,brakeAtFirstStop:brakeAtStop,sampledControls:samples.length,
    output:path.join(out,'report.json')}));
}
try{main();}catch(e){console.error(e.stack||e);process.exitCode=1;}finally{Model.closeCuda();}
