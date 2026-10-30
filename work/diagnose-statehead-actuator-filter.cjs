'use strict';
// Read-only 2x2 actuator-response ablation for the exact protected V3/Monza
// parent. Neural outputs, brain, rewards, track and tyre/vehicle physics stay
// fixed; first-order response is applied only at the physical command boundary.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Parent=require('./neural-frontier-chain.cjs');
const State=require('./neural-statehead.cjs');
const Live=require('./neural-command-live-cuda.cjs');
const Physics=require('../outputs/simulation.js');
const Learning=require('../outputs/neural-learning.js');
const output=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)||'');
const tau=Number(process.argv.find(a=>a.startsWith('--tau='))?.slice(6)||'.15');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function check(condition,message){if(!condition)throw Error(message);}
async function rollout(loaded,selected,steerTau,longTau){
  let filteredSteer=0,filteredLong=0;
  const interval=Physics.DT*Learning.CONTROL_INTERVAL;
  const alpha=t=>t===0?1:1-Math.exp(-interval/t);
  const aSteer=alpha(steerTau),aLong=alpha(longTau),brain=Parent.controller(loaded.core.parent),head=State.create(loaded.data);
  const env=Live.create(loaded.modelFile,{id:0,modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,modelSha256:loaded.sha256,
    onReset:()=>{filteredSteer=0;filteredLong=0;brain.reset();head.reset();},
    actionOverride:(_model,raw)=>{const prior=brain.observe(raw);head.observe(raw);return prior;},
    motorOverride:(_model,_raw,prior)=>{
      const action=head.compose(brain.compose(prior),loaded.data.weights);
      if(steerTau===0&&longTau===0)return action;
      filteredSteer+=aSteer*(action[0]-filteredSteer);
      filteredLong+=aLong*(action[1]-action[2]-filteredLong);
      return [filteredSteer,Math.max(0,filteredLong),Math.max(0,-filteredLong)];
    }});
  const trace=crypto.createHash('sha256');let state=env.state(),controls=0,postLap=0,gas=0,brake=0,overlap=0,nearLock=0,absSteer=0,lastSteer=null,steerFlips=0,lastLong=null,pedalFlips=0;
  try{
    while(!state.complete&&controls<20000){
      state=env.step();controls++;const car=state.car,[s,g,b]=car.outputs;trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,car.outputs])+'\n');
      if(state.laps>0){postLap++;gas+=Number(g>.01);brake+=Number(b>.01);overlap+=Number(g>.001&&b>.001);nearLock+=Number(Math.abs(s)>.8);absSteer+=Math.abs(s);if(lastSteer!==null&&Math.sign(lastSteer)!==Math.sign(s)&&Math.abs(lastSteer)>.25&&Math.abs(s)>.25)steerFlips++;const longitudinal=g-b;if(lastLong!==null&&Math.sign(lastLong)!==Math.sign(longitudinal)&&Math.abs(lastLong)>.15&&Math.abs(longitudinal)>.15)pedalFlips++;lastSteer=s;lastLong=longitudinal;}
    }
    return {steerTau,longTau,stepSeconds:interval,alphas:{steering:aSteer,longitudinal:aLong},complete:state.complete,progress:state.bestProgress,fitness:state.fitness,laps:state.laps,lapTimes:state.lapTimes.slice(),reason:state.reason,totalSimulationSeconds:state.totalSimulationSeconds,controls,actionTraceSha256:trace.digest('hex'),postLap:{controls:postLap,gasControls:gas,brakeControls:brake,overlapControls:overlap,nearLockFraction:postLap?nearLock/postLap:null,meanAbsSteering:postLap?absSteer/postLap:null,strongSteerFlipsPer100:postLap?100*steerFlips/postLap:null,strongPedalFlipsPer100:postLap?100*pedalFlips/postLap:null},gpu:Model.stats()};
  }finally{env.close?.();}
}
async function main(){
  check(process.versions.node==='24.19.0','Pinned Node 24.19.0 runtime required');
  check(output&&!await fs.stat(output).then(()=>true,()=>false),'A new --output directory is required; never overwrite evidence');
  check(Number.isFinite(tau)&&tau>=.05&&tau<=.5,'Tau must be 0.05–0.5 simulated seconds');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),modelSha=sha(await fs.readFile(selected.file)),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',saveSha=await fs.readFile(savePath).then(sha,()=>null);
  check(modelSha===selected.modelSha256,'Protected model checksum mismatch');
  const cases=[{name:'baseline',s:0,l:0},{name:'steering-only',s:tau,l:0},{name:'pedals-only',s:0,l:tau},{name:'both',s:tau,l:tau}],results=[];let gpu;
  try{
    for(const test of cases){const row=await rollout(loaded,selected,test.s,test.l);results.push({...test,row});console.log('STATEHEAD_ACTUATOR_FILTER '+JSON.stringify({name:test.name,...row}));
      if(test.name==='baseline')check(row.complete&&row.progress===selected.expected.bestProgress&&row.fitness===selected.expected.fitness&&row.laps===selected.expected.laps&&row.reason===selected.expected.reason&&row.totalSimulationSeconds===selected.expected.totalSimulationSeconds&&JSON.stringify(row.lapTimes)===JSON.stringify(selected.expected.lapTimes)&&row.actionTraceSha256===selected.actionTraceSha256,'Unmodified actuator case failed exact baseline reproduction');
    }
    gpu=Model.stats();
  }finally{gpu??=Model.stats();Model.closeCuda();}
  const report={format:'male-cns-statehead-actuator-filter-ablation-v1',appVersion:'5.6.0',model:{file:selected.file,sha256:modelSha,expected:selected.expected},settings:{circuit:'Monza',population:1,filter:'first-order response on final physical commands; scalar alpha=1-exp(-dt/tau)',tauSeconds:tau},method:'Deterministic 2x2 ablation: no filter, steering filter only, pedals filter only, both. Longitudinal action is filtered as signed gas-minus-brake and decoded back to mutually exclusive pedals. No raw outputs, brain weights, sensor routing, rewards or vehicle parameters are changed.',results,modelUnchanged:sha(await fs.readFile(selected.file))===modelSha,userSave:{path:savePath,sha256:saveSha,unchanged:saveSha===null?null:sha(await fs.readFile(savePath))===saveSha},gpu,boundary:'A deterministic actuator filter is not a learned policy. Any apparent gain requires exact repeat and independent starting conditions before integration; one Monza episode is not two-lap or cross-track generalization.'};
  await fs.mkdir(output,{recursive:false});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('STATEHEAD_ACTUATOR_FILTER_REPORT '+JSON.stringify({output:path.join(output,'report.json'),results:results.map(({name,row})=>({name,progress:row.progress,laps:row.laps,reason:row.reason,lapTimes:row.lapTimes,actionTraceSha256:row.actionTraceSha256,postLap:row.postLap})),modelUnchanged:report.modelUnchanged,saveUnchanged:report.userSave.unchanged,gpu}));
}
main().catch(error=>{console.error(error.stack||String(error));Model.closeCuda();process.exitCode=1;});
