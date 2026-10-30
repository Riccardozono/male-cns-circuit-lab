'use strict';
// Research-only runtime intervention: allow steering and longitudinal readout
// mutations together when the safe frontier is stopped without throttle.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Learning=require('../outputs/neural-learning.js'),originalMutation=Learning.safeMotorMutation;
let longitudinalFocusOverrides=0,otherFocusCalls=0;
Learning.safeMotorMutation=function(graph,values,r,amount,experience,focus=null){
  if(focus==='longitudinal'){longitudinalFocusOverrides++;focus='combined';}
  else otherFocusCalls++;
  return originalMutation(graph,values,r,amount,experience,focus);
};
const wrapperSha256=crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
const outArg=process.argv.slice(2).find(s=>s.startsWith('--out='));
const out=outArg?path.resolve(__dirname,'..',outArg.slice(6)):null;
process.on('exit',()=>{
  if(!out||!fs.existsSync(out))return;
  const audit={format:'male-cns-v3-stalled-frontier-combined-mutation-v1',
    longitudinalFocusOverrides,otherFocusCalls,wrapperSha256,
    method:'Only in the in-memory research process, redirect safeMotorMutation calls explicitly focused on a stopped safe frontier from longitudinal to combined steering+longitudinal. Neural inference, physical dynamics, rewards, RNG and all other mutation paths are unchanged. No production source is edited.'};
  fs.writeFileSync(path.join(out,'mutation-focus-audit.json'),JSON.stringify(audit,null,2),{flag:'wx'});
});
require('./continue-saved-v3-training-cuda.cjs');
