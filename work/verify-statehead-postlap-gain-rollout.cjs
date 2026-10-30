'use strict';
// Isolated physical replay of the prepared post-lap neural-context model.
// No production source, application profile, or user save is modified.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const root=path.resolve(__dirname,'..');
const candidate=path.join(root,'.impeccable/review/neural-sacl/statehead-cuda-post-lap-gate-20261019-01/statehead-post-lap-low-gain-research-only.malecns-statehead.json');
const out=path.join(root,'.impeccable/review/learning-ml/statehead-postlap-gain-rollout-20261020-01');
const hash=crypto.createHash('sha256');
function result(env){const s=env.state();return {progress:s.bestProgress,fitness:s.fitness,laps:s.laps,lapTimes:s.lapTimes,reason:s.reason,seconds:s.totalSimulationSeconds,controls:s.ticks,complete:s.complete};}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing rollout report');
  const parent=Model.defaultChoice(),loaded=Model.loadResearch(candidate,{expectedParentModelSha256:parent.modelSha256});
  if(!Array.isArray(loaded.data.migratedWeights)||loaded.data.migratedWeights.length!==18)throw Error('Prepared post-lap candidate weights are missing');
  const env=Model.createFromLoaded(loaded,{weights:loaded.data.migratedWeights,id:0});
  let state,controls=0,firstGate=null,peakGate=0,overlap=0,lastProgress=0;
  const samples=[];
  try{
    while(controls<18000){
      state=env.step();controls++;
      const car=state.car,gate=env.stateHeadSnapshot().gate;
      if(firstGate===null&&gate>1e-8)firstGate={control:controls,lap:car.laps,progress:car.bestProgress,value:gate};
      peakGate=Math.max(peakGate,gate);
      overlap+=Number(car.outputs[1]>1e-9&&car.outputs[2]>1e-9);
      hash.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,car.outputs])+'\n');
      if(controls%1000===0||car.laps!==lastProgress){samples.push({control:controls,progress:car.bestProgress,laps:car.laps,speedMps:car.vehicle.speedMps,outputs:car.outputs.slice(),gate,reason:car.reason||''});lastProgress=car.laps;}
      if(state.complete)break;
    }
    const report={format:'male-cns-statehead-postlap-low-gain-physical-rollout-v1',appVersion:'5.6.0',candidateSha256:loaded.sha256,parentModelSha256:parent.modelSha256,
      candidateProvenance:loaded.data.provenance,method:'One actual deterministic V3/Monza CUDA episode from the line using the prepared post-first-lap neural-context gate and its declared 0.2 motor-correction gain. No training, route/action labels, or intervention.',
      result:result(env),actionTraceSha256:hash.digest('hex'),firstGate,peakGate,throttleBrakeOverlapTicks:overlap,samples,gpu:Model.stats(),
      boundary:'Research-only isolated replay; not a trained improvement, app integration, save migration, or two-lap proof.'};
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('STATEHEAD_POSTLAP_ROLLOUT '+JSON.stringify({result:report.result,firstGate,peakGate,overlap,actionTraceSha256:report.actionTraceSha256,gpu:report.gpu,report:path.join(out,'report.json')}));
  }finally{Model.closeCuda();}
}
main().catch(error=>{console.error(error.stack||error);Model.closeCuda();process.exitCode=1;});
