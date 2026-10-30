'use strict';
// Research-only runtime hook: don't let stationary brake-hold samples become
// the most frequent neural context protected by safeMotorMutation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const F=require('../outputs/simulation.js'),Learning=require('../outputs/neural-learning.js');
const originalTick=F.Simulation.prototype.tick,originalRemember=Learning.rememberActivity;
let movingSamples=0,stationarySamples=0;
const thresholdMps=2;
Learning.rememberActivity=function(brain){
  if(brain?.__recordMovingPolicyContext){movingSamples++;return originalRemember(brain);}
  stationarySamples++;
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
  const report={format:'male-cns-v3-moving-only-policy-memory-intervention-v1',thresholdMps,
    movingSamples,stationarySamples,wrapperSha256,
    method:'At each simulation tick, count policy-activity memory only if the car speed from the previous physical step is at least 2 m/s. All neural inference, physics, reward, RNG and evolution code remain the same. This is an isolated in-memory research intervention; no production source is edited.'};
  fs.writeFileSync(path.join(out,'memory-policy-audit.json'),JSON.stringify(report,null,2),{flag:'wx'});
});
require('./continue-saved-v3-training-cuda.cjs');
