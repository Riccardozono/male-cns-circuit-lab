'use strict';
// Deterministic from-line steering-sensitivity sweep for the protected
// V3/Monza state-head. Only the final steering command is scaled; neural
// sensors, weights, brake/gas, route, reward and vehicle physics stay fixed.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Parent=require('./neural-frontier-chain.cjs');
const State=require('./neural-statehead.cjs');
const Live=require('./neural-command-live-cuda.cjs');
const output=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)||'');
const gains=(process.argv.find(a=>a.startsWith('--gains='))?.slice(8)||'0.6,0.8,0.9,1').split(',').map(Number);
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function requireValid(condition,message){if(!condition)throw Error(message);}
function makeEnv(loaded,weights,gain,id=0){
  const brain=Parent.controller(loaded.core.parent),head=State.create(loaded.data);
  return Live.create(loaded.modelFile,{id,modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,modelSha256:loaded.sha256,
    actionOverride:(_model,raw)=>{const prior=brain.observe(raw);head.observe(raw);return prior;},
    motorOverride:(_model,_raw,prior)=>{const command=head.compose(brain.compose(prior),weights);return [command[0]*gain,command[1],command[2]];}});
}
async function run(loaded,selected,gain){
  const env=makeEnv(loaded,loaded.data.weights,gain),trace=crypto.createHash('sha256');let state=env.state(),controls=0;
  let postLapControls=0,brakeControls=0,gasControls=0,overlapControls=0,steeringAbs=0,nearLock=0,lastSteer=null,steerSignChanges=0;
  try{
    while(!state.complete&&controls<20000){
      state=env.step();controls++;
      const car=state.car,[steer,gas,brake]=car.outputs;
      trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,car.outputs])+'\n');
      if(state.laps>0){postLapControls++;brakeControls+=Number(brake>.01);gasControls+=Number(gas>.01);overlapControls+=Number(gas>.001&&brake>.001);steeringAbs+=Math.abs(steer);nearLock+=Number(Math.abs(steer)>.8);if(lastSteer!==null&&Math.sign(lastSteer)!==Math.sign(steer)&&Math.abs(lastSteer)>.25&&Math.abs(steer)>.25)steerSignChanges++;lastSteer=steer;}
    }
    const actionTraceSha256=trace.digest('hex'),observed={complete:state.complete,bestProgress:state.bestProgress,fitness:state.fitness,laps:state.laps,reason:state.reason,totalSimulationSeconds:state.totalSimulationSeconds,lapTimes:state.lapTimes.slice(),controls,actionTraceSha256};
    const baselineExact=gain===1?observed.complete===true&&observed.bestProgress===selected.expected.bestProgress&&observed.fitness===selected.expected.fitness&&observed.laps===selected.expected.laps&&observed.reason===selected.expected.reason&&observed.totalSimulationSeconds===selected.expected.totalSimulationSeconds&&JSON.stringify(observed.lapTimes)===JSON.stringify(selected.expected.lapTimes)&&actionTraceSha256===selected.actionTraceSha256:null;
    return {gain,...observed,postLap:{controls:postLapControls,gasControls,brakeControls,overlapControls,nearLockFraction:postLapControls?nearLock/postLapControls:null,meanAbsSteering:postLapControls?steeringAbs/postLapControls:null,strongSignChangesPer100Controls:postLapControls?steerSignChanges*100/postLapControls:null},baselineExact};
  }finally{env.close?.();}
}
async function main(){
  requireValid(process.versions.node==='24.19.0','Pinned Node 24.19.0 runtime required');
  requireValid(output&&!await fs.stat(output).then(()=>true,()=>false),'A new --output directory is required; existing evidence is never overwritten');
  requireValid(gains.length>=2&&gains.length<=6&&gains.every(x=>Number.isFinite(x)&&x>=.4&&x<=1.2)&&gains.includes(1),'Use 2–6 gains from 0.4 to 1.2, including baseline 1');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),saveFile='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
  const modelSha=sha(await fs.readFile(selected.file)),saveSha=await fs.readFile(saveFile).then(sha,()=>null);
  requireValid(modelSha===selected.modelSha256,'Protected parent checksum mismatch');
  const results=[];
  let gpu;
  try{for(const gain of gains){const r=await run(loaded,selected,gain);r.gpu=Model.stats();results.push(r);console.log('STATEHEAD_STEERING_GAIN '+JSON.stringify({gain,progress:r.bestProgress,laps:r.laps,reason:r.reason,lapTimes:r.lapTimes,postLap:r.postLap,baselineExact:r.baselineExact,gpu:r.gpu}));if(gain===1)requireValid(r.baselineExact,'Unmodified 1.0 steering control failed exact deterministic baseline replay');}gpu=Model.stats();}
  finally{gpu??=Model.stats();Model.closeCuda();}
  const report={format:'male-cns-statehead-steering-gain-sweep-v1',appVersion:'5.6.0',model:{file:selected.file,sha256:modelSha,expected:selected.expected},settings:{circuit:'Monza',gains,order:'same neural policy and exact physics; independent start-line replay for each gain'},method:'Only final steering command is multiplied by a fixed scalar. The MaleCNS state, V3 head weights, throttle/brake outputs, 992 GT3 physics, reward, sensors, and track remain unchanged. Every episode runs to its natural physical termination.',results,modelUnchanged:sha(await fs.readFile(selected.file))===modelSha,userSave:{path:saveFile,sha256:saveSha,unchanged:saveSha===null?null:sha(await fs.readFile(saveFile))===saveSha},gpu,boundary:'Gain 1.0 must exactly reproduce the protected model. A better isolated steering gain is a calibration signal, not a learned policy or evidence of two-lap generalization.'};
  await fs.mkdir(output,{recursive:false});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('STATEHEAD_STEERING_GAIN_REPORT '+JSON.stringify({output:path.join(output,'report.json'),results:results.map(r=>({gain:r.gain,progress:r.bestProgress,laps:r.laps,reason:r.reason,lapTimes:r.lapTimes,baselineExact:r.baselineExact,postLap:r.postLap})),modelUnchanged:report.modelUnchanged,saveUnchanged:report.userSave.unchanged,gpu:report.gpu}));
}
main().catch(error=>{console.error(error.stack||String(error));Model.closeCuda();process.exitCode=1;});
