'use strict';
// Isolated V3/Monza physical A/B: original neural steering vs a 0.70 actuator gain.
// Throttle, brake, brain, sensors, reward, seed and physics remain unchanged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/learning-ml/statehead-steering-gain-070-20261020-02');
const trace=()=>crypto.createHash('sha256');
function result(env){const c=env.currentCar();return {progress:c.bestProgress,fitness:c.fitness,laps:c.laps,lapTimes:c.lapTimes,reason:c.alive?'':c.reason,seconds:c.lifetime};}
function attachGain(env,gain){const original=env.runtime.drive,targetCar=env.currentCar();env.runtime.drive=function(track,car,commands,dt){const adjusted=car===targetCar?[commands[0]*gain,commands[1],commands[2]]:commands;return original.call(this,track,car,adjusted,dt);};}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite existing steering test');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),weights=Array(18).fill(0);
  const base=Model.createFromLoaded(loaded,{weights,id:0});
  const reduced=Model.createFromLoaded(loaded,{weights,id:0,sharedTopology:base.topology});attachGain(reduced,.7);
  const agents=[{name:'V3 original steering',env:base,hash:trace(),overlap:0},{name:'V3 steering x 0.70',env:reduced,hash:trace(),overlap:0}];
  const captures=Object.fromEntries(agents.map(a=>[a.name,{lap1:[],lap2:[]}]));let control=0;
  try{
    while(control<12000&&agents.some(a=>a.env.currentCar().alive)){
      control++;
      for(const a of agents){if(!a.env.currentCar().alive)continue;const s=a.env.step(),c=s.car;
        a.hash.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,c.outputs])+'\n');
        a.overlap+=Number(c.outputs[1]>1e-9&&c.outputs[2]>1e-9);
        const lap=c.laps,along=lap===0?c.bestProgress:c.bestProgress-lap*base.track.total,key=lap===0?'lap1':lap===1?'lap2':null;
        if(key&&control%20===0&&along>=650&&along<=900)captures[a.name][key].push({control,lap,along,speedMps:c.vehicle.speedMps,outputs:c.outputs.slice(),longitudinalG:c.longitudinalG,lateralG:c.lateralG});
      }
      if(control%2000===0)console.log('STATEHEAD_STEERING_GAIN_PROGRESS '+JSON.stringify({control,base:result(base),reduced:result(reduced)}));
    }
    const reports=agents.map(a=>({name:a.name,result:result(a.env),actionTraceSha256:a.hash.digest('hex'),throttleBrakeOverlapTicks:a.overlap,
      windows:captures[a.name]}));
    const report={format:'male-cns-v3-steering-gain-ab-v1',appVersion:'5.6.0',parentModelSha256:loaded.data.parentSha256||null,
      baseActionTraceExpectedSha256:loaded.core.parent.data.fullTraceSha256,method:'Same-seed lockstep physical comparison using the protected V3 parent with zero state-head weights. Only the steering actuator request in one branch is multiplied by 0.70; longitudinal commands and all neural computations remain unchanged.',
      controlsPerEpisode:control,results:reports,gpu:Model.stats(),boundary:'Single diagnostic seed. This multiplier is not Porsche actuator calibration and is not promoted or integrated into the app.'};
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('STATEHEAD_STEERING_GAIN_RESULT '+JSON.stringify({controls:control,results:reports.map(r=>({name:r.name,result:r.result,trace:r.actionTraceSha256,overlap:r.throttleBrakeOverlapTicks,lap1Samples:r.windows.lap1.length,lap2Samples:r.windows.lap2.length,lap2Start:r.windows.lap2[0],lap2End:r.windows.lap2.at(-1)})),gpu:report.gpu,report:path.join(out,'report.json')}));
  }finally{Model.closeCuda();}
}
main().catch(error=>{console.error(error.stack||error);Model.closeCuda();process.exitCode=1;});
