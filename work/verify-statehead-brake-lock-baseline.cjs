'use strict';
// One deterministic, single-agent baseline replay. It verifies that the
// scoring overlay changes fitness only, then records a versioned baseline
// needed to seed the isolated learning archive fairly.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Overlay=require('./neural-statehead-brake-lock-overlay.cjs');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'.impeccable/review/learning-ml/statehead-brake-lock-cuda-20261020');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing brake-lock baseline proof');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),modelSha=sha(fs.readFileSync(selected.file));
  if(modelSha!==selected.modelSha256)throw Error('Selected verified model checksum changed');
  const env=Overlay.attach(Model.createFromLoaded(loaded,{id:0}));
  const trace=crypto.createHash('sha256');let state=null,controls=0;
  while(controls<12000){
    state=env.step();controls++;
    trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');
    if(state.complete)break;
  }
  const original=selected.expected,observed={bestProgress:state?.bestProgress,fitness:state?.fitness,
    laps:state?.laps,reason:state?.reason,totalSimulationSeconds:state?.totalSimulationSeconds,
    complete:state?.complete,lapTimes:state?.lapTimes};
  const samePhysicalResult=state?.complete===true&&
    ['bestProgress','laps','reason','totalSimulationSeconds'].every(k=>observed[k]===original[k])&&
    JSON.stringify(observed.lapTimes)===JSON.stringify(original.lapTimes);
  const actionTraceSha256=trace.digest('hex');
  if(!samePhysicalResult||actionTraceSha256!==selected.actionTraceSha256)
    throw Error('Brake-lock overlay changed the physical trajectory or neural action trace: '+JSON.stringify({samePhysicalResult,actionTraceSha256,expectedActionTrace:selected.actionTraceSha256,observed}));
  const overlay=env.brakeLockSnapshot(),baselinePenalty=original.fitness-observed.fitness;
  if(!Number.isFinite(baselinePenalty)||baselinePenalty<0||Math.abs(baselinePenalty-overlay.totalPenalty)>1e-6)
    throw Error('Recomputed baseline score and accumulated brake-lock penalty disagree');
  const report={format:'male-cns-statehead-brake-lock-baseline-v1',appVersion:'5.6.0',passed:true,
    model:{sha256:modelSha,file:selected.file,sourceProof:selected.proofFile},
    overlay:{revision:Overlay.REVISION,rules:Overlay.RULES},
    original,observed,baselinePenalty,brakeLock:overlay,actionTraceSha256,
    controls,physicsTrajectoryUnchanged:samePhysicalResult,neuralActionsUnchanged:actionTraceSha256===selected.actionTraceSha256,
    boundary:'One exact deterministic replay qualifies only this verified V3/Monza seed; it is not evidence of general learning or two-lap completion.'};
  fs.mkdirSync(out,{recursive:false});
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('STATEHEAD_BRAKE_LOCK_BASELINE '+JSON.stringify({passed:true,baselinePenalty,originalFitness:original.fitness,newFitness:observed.fitness,brakeLock:overlay,actionTraceSha256,output:path.join(out,'report.json')}));
}
try{main();}catch(error){console.error(error.stack||error);process.exitCode=1;}finally{Model.closeCuda();}
