'use strict';
// Research-only A/B branch: moving-only policy-context memory plus coordinated
// steering/longitudinal exploration for a stopped safe frontier.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const F=require('../outputs/simulation.js'),Learning=require('../outputs/neural-learning.js');
const originalTick=F.Simulation.prototype.tick,originalRemember=Learning.rememberActivity,originalMutation=Learning.safeMotorMutation;
let movingSamples=0,stationarySamples=0,longitudinalFocusOverrides=0,otherFocusCalls=0;
const thresholdMps=2;
Learning.rememberActivity=function(brain){
  if(brain?.__recordMovingPolicyContext){movingSamples++;return originalRemember(brain);}
  stationarySamples++;
};
Learning.safeMotorMutation=function(graph,values,r,amount,experience,focus=null){
  if(focus==='longitudinal'){longitudinalFocusOverrides++;focus='combined';}
  else otherFocusCalls++;
  return originalMutation(graph,values,r,amount,experience,focus);
};
F.Simulation.prototype.tick=function(...args){
  if(this.mode==='connectome'&&this.learningEnabled)for(const car of this.cars){
    if(car?.brain)car.brain.__recordMovingPolicyContext=Math.abs(Number(car.vehicle?.speedMps)||0)>=thresholdMps;
  }
  return originalTick.apply(this,args);
};
const wrapperSha256=crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
const outArg=process.argv.slice(2).find(s=>s.startsWith('--out='));
const out=outArg?path.resolve(__dirname,'..',outArg.slice(6)):null;
process.on('exit',()=>{
  if(!out||!fs.existsSync(out))return;
  const audit={format:'male-cns-v3-moving-memory-combined-focus-v1',thresholdMps,
    movingSamples,stationarySamples,longitudinalFocusOverrides,otherFocusCalls,wrapperSha256,
    method:'At each simulation tick, only record policy-activity memory when speed from the previous physical step is at least 2 m/s. In addition, redirect safeMotorMutation calls focused on a stopped safe frontier from longitudinal to combined steering+longitudinal. All interventions are runtime-only; inference, dynamics, rewards, RNG and all other mutation paths remain unchanged. No production source is edited.'};
  fs.writeFileSync(path.join(out,'combined-intervention-audit.json'),JSON.stringify(audit,null,2),{flag:'wx'});
});
require('./continue-saved-v3-training-cuda.cjs');
