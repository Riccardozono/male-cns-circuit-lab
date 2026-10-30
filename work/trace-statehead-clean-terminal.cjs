'use strict';
// Read-only exact replay of the protected clean state-head candidate. Captures
// dense terminal telemetry to distinguish controller oscillation, brake lock,
// and the pace rule. It never reads a user save or feeds data into training.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'.impeccable/review/learning-ml/statehead-terminal-dense-20261020');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const wrapAngle=value=>Math.atan2(Math.sin(value),Math.cos(value));
function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing terminal telemetry report');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),modelSha=sha(fs.readFileSync(selected.file));
  if(modelSha!==selected.modelSha256)throw Error('Selected verified model checksum changed');
  const env=Model.createFromLoaded(loaded,{id:0}),rows=[];let state=null,controls=0,previous=null;
  while(controls<12000){
    state=env.step();controls++;
    const car=state.car,ppm=car.pixelsPerMeter||1,progress=car.progress/ppm,bestProgress=state.bestProgress/ppm;
    if(bestProgress>=6250){
      const vehicle=car.vehicle||{},reward=car.rewardState||{},head=env.stateHeadSnapshot();
      const row={control:controls,timeS:state.totalSimulationSeconds,lap:state.laps,alive:car.alive,
        progressM:progress,bestProgressM:bestProgress,lastAlongM:Number.isFinite(car.lastAlong)?car.lastAlong/ppm:null,
        x:car.x/ppm,y:car.y/ppm,heading:car.heading,outputs:car.outputs.slice(),
        speedMps:vehicle.speedMps,longitudinalVelocityMps:vehicle.u,lateralVelocityMps:vehicle.v,
        yawRateRadS:vehicle.r,slipAngleRad:car.slipAngle,longitudinalG:car.longitudinalG,lateralG:car.lateralG,
        gear:vehicle.gear,rpm:vehicle.rpm,gate:head.gate,headFeatures:head.features,
        paceTimeS:reward.paceTime,paceProgressM:Number.isFinite(reward.paceProgress)?reward.paceProgress/ppm:null,
        safeHighWaterM:Number.isFinite(reward.highWater)?reward.highWater/ppm:null,
        brakeLockSeconds:reward.brakeLockSeconds||0,reason:state.reason||null};
      if(controls%5===0||controls===1)row.sensors=car.sensorVector.slice();
      if(previous){
        row.delta={dtS:row.timeS-previous.timeS,dxM:row.x-previous.x,dyM:row.y-previous.y,
          displacementM:Math.hypot(row.x-previous.x,row.y-previous.y),dProgressM:row.progressM-previous.progressM,
          dBestProgressM:row.bestProgressM-previous.bestProgressM,
          dHeadingRad:wrapAngle(row.heading-previous.heading)};
      }
      rows.push(row);previous=row;
    }
    if(state.complete)break;
  }
  const observed={bestProgress:state?.bestProgress,fitness:state?.fitness,laps:state?.laps,
    reason:state?.reason,totalSimulationSeconds:state?.totalSimulationSeconds,complete:state?.complete,
    lapTimes:state?.lapTimes};
  const expected=selected.expected,fields=['bestProgress','fitness','laps','reason','totalSimulationSeconds'];
  const exact=state?.complete===true&&fields.every(k=>observed[k]===expected[k])&&
    JSON.stringify(observed.lapTimes)===JSON.stringify(expected.lapTimes);
  if(!exact)throw Error('Dense replay did not exactly match the protected clean-model baseline: '+JSON.stringify(observed));
  const report={format:'male-cns-verified-statehead-dense-terminal-telemetry-v1',appVersion:'5.6.0',passed:true,
    model:{family:selected.family,sha256:modelSha,file:selected.file,proofFile:selected.proofFile,nodeVersion:process.versions.node},
    method:'One exact deterministic full from-line native CUDA replay. Telemetry is sampled after control steps once safe high-water reaches 6250m. Sensors are saved every fifth control; observations never enter training.',
    expected,observed,exactBaselineMatch:exact,controlSteps:controls,sampledControls:rows.length,
    trace:rows,sourceUnchanged:sha(fs.readFileSync(selected.file))===modelSha,
    boundary:'A deterministic one-seed replay diagnoses the failure location but does not establish general learning or two-lap completion.'};
  fs.mkdirSync(out,{recursive:false});
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  const tail=rows.slice(-12).map(r=>({control:r.control,timeS:+r.timeS.toFixed(2),progressM:+r.progressM.toFixed(2),
    bestProgressM:+r.bestProgressM.toFixed(2),speedKmh:+(r.speedMps*3.6).toFixed(2),
    velocity:[+r.longitudinalVelocityMps.toFixed(3),+r.lateralVelocityMps.toFixed(3)],
    outputs:r.outputs.map(v=>+v.toFixed(3)),slipDeg:+(r.slipAngleRad*180/Math.PI).toFixed(1),
    g:[+r.longitudinalG.toFixed(2),+r.lateralG.toFixed(2)],gear:r.gear,rpm:r.rpm,
    delta:r.delta&&{distance:+r.delta.displacementM.toFixed(3),dProgress:+r.delta.dProgressM.toFixed(3)},
    pace:[r.paceTimeS,r.paceProgressM],brakeLock:r.brakeLockSeconds,reason:r.reason}));
  console.log('STATEHEAD_DENSE_TERMINAL '+JSON.stringify({passed:true,exactBaselineMatch:exact,observed,
    sampledControls:rows.length,first:rows[0]&&{control:rows[0].control,timeS:rows[0].timeS,bestProgressM:rows[0].bestProgressM},
    tail,output:path.join(out,'report.json')}));
}
try{main();}catch(e){console.error(e.stack||e);process.exitCode=1;}finally{Model.closeCuda();}
