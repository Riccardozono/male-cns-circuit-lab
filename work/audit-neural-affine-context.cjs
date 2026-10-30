'use strict';
// Report-only audit of existing learned neural gate values on the exact
// independently verified V3/Monza clean episode. Gate/time bins are labels,
// never controller inputs or reward targets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const Model=require('./neural-chain-desktop-model.cjs'),Chain=require('./neural-frontier-chain.cjs'),Live=require('./neural-command-live.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/neural-affine-motor-20261020-01/neural-context-audit.json');
if(fs.existsSync(out))throw Error('Context audit exists; refusing to overwrite.');
const choice=Model.defaultChoice(),loaded=Model.load(choice.file),brain=Chain.controller(loaded.inner),gates=[],trace=crypto.createHash('sha256');
const env=Live.create(choice.file,{modelOverride:loaded.inner.anchor.parent.parent.parent.model,modelSha256:loaded.sha256,
  onReset:()=>brain.reset(),actionOverride:(_model,raw)=>{const result=brain.observe(raw);gates.push(brain.lastGate());return result;},
  motorOverride:(_model,_raw,prior)=>brain.compose(prior,loaded.data.weights)});
try{
  let state;
  while(!env.currentCar().alive){throw Error('Verified agent did not start alive.');}
  while(env.currentCar().alive){state=env.step();trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');if(gates.length>30000)throw Error('Audit control guard exceeded.');}
  const actualTrace=trace.digest('hex');assert.deepEqual({bestProgress:state.bestProgress,fitness:state.fitness,laps:state.laps,reason:state.reason,totalSimulationSeconds:state.totalSimulationSeconds,complete:state.complete,lapTimes:state.lapTimes},choice.result);
  assert.equal(actualTrace,choice.actionTraceSha256,'exact verified motor trace');
  if(!gates.length||gates.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('Neural gate output must be a finite value in [0, 1].');
  const thresholds=[1e-9,.01,.1,.25,.5,.9],counts=Object.fromEntries(thresholds.map(t=>[String(t),gates.filter(v=>v>=t).length]));
  const sorted=gates.slice().sort((a,b)=>a-b),quantile=q=>sorted[Math.min(sorted.length-1,Math.floor(q*(sorted.length-1)))];
  const bins=Array.from({length:8},(_,bin)=>{const start=Math.floor(bin*gates.length/8),end=Math.floor((bin+1)*gates.length/8),values=gates.slice(start,end);return {controlBin:bin+1,controls:values.length,nonZero:values.filter(v=>v>1e-9).length,max:Math.max(...values),mean:values.reduce((s,v)=>s+v,0)/values.length};});
  const report={format:'male-cns-verified-neural-affine-context-audit-v1',passed:true,modelSha256:choice.modelSha256,actionTraceSha256:actualTrace,verifiedResult:state&&{bestProgress:state.bestProgress,fitness:state.fitness,laps:state.laps,reason:state.reason,totalSimulationSeconds:state.totalSimulationSeconds,lapTimes:state.lapTimes},
    gate:{name:'last existing neuronal-chain context gate',controls:gates.length,min:sorted[0],p50:quantile(.5),p90:quantile(.9),max:sorted.at(-1),countsByThreshold:counts,bins},
    boundary:'Read-only internal signal audit over actual verified neural states. Control bins are report labels only; no timing, route, progress, lap count, or gate value is introduced into motor control. This does not prove a gated mutation will improve learning.'};
  fs.writeFileSync(out,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});console.log(JSON.stringify({passed:true,reportFile:out,modelSha256:report.modelSha256,actionTraceSha256:actualTrace,result:report.verifiedResult,gate:report.gate},null,2));
}finally{env.close?.();}
