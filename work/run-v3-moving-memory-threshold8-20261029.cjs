'use strict';
// Research-only threshold comparison: retain mutation contexts only above 8m/s.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Learning=require('../outputs/neural-learning.js'),originalRemember=Learning.rememberActivity;
const thresholdMps=8;let movingSamples=0,excludedSlowerSamples=0;
Learning.rememberActivity=function(brain,speedMps){
  if(Number.isFinite(speedMps)&&Math.abs(speedMps)>=thresholdMps){movingSamples++;return originalRemember(brain,speedMps);}
  excludedSlowerSamples++;return false;
};
const wrapperSha256=crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
const outArg=process.argv.slice(2).find(s=>s.startsWith('--out=')),out=outArg?path.resolve(__dirname,'..',outArg.slice(6)):null;
process.on('exit',()=>{
  if(!out||!fs.existsSync(out))return;
  fs.writeFileSync(path.join(out,'memory-threshold-audit.json'),JSON.stringify({
    format:'male-cns-v3-policy-memory-speed-threshold-v1',thresholdMps,movingSamples,excludedSlowerSamples,wrapperSha256,
    method:'Runtime-only memory filter: record policy contexts only at absolute speed >= 8 m/s. Physical control still follows the unmodified neural output; inference, physics, rewards, RNG and mutation rules are otherwise unchanged.'
  },null,2),{flag:'wx'});
});
require('./continue-saved-v3-training-cuda.cjs');
