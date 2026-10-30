'use strict';
// Read-only observation of the ACTUAL native controller gates. No gate,
// action, source model or vehicle state is modified by the diagnostic.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks'),Model=require('./neural-frontier-chain.cjs'),Live=require('./neural-command-live.cjs');
function audit(file,out){
  if(process.versions.node!=='24.19.0')throw Error('Pinned runtime required');const loaded=Model.load(file,{allowExploration:true}),brain=Model.controller(loaded),records=loaded.data.stages.map(()=>({firstActiveControl:null,positiveControls:0,peak:0}));let controls=0;
  const env=Live.create(file,{modelOverride:loaded.anchor.parent.parent.parent.model,onReset:()=>brain.reset(),actionOverride:(_m,raw)=>brain.observe(raw),motorOverride:(_m,_raw,prior)=>{const commands=brain.compose(prior),state=brain.capture();state.stages.forEach((g,i)=>{if(g.gate>0){records[i].positiveControls++;if(records[i].firstActiveControl===null)records[i].firstActiveControl=controls;}records[i].peak=Math.max(records[i].peak,g.gate);});return commands;}});
  const trace=crypto.createHash('sha256'),started=performance.now();let s=env.state(),overlap=0;
  while(!s.complete&&performance.now()-started<180000){s=env.step();controls++;overlap+=Number(Math.min(s.car.outputs[1],s.car.outputs[2])!==0);trace.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,s.car.outputs])+'\n');}
  const digest=trace.digest('hex'),keys=['bestProgress','fitness','laps','reason','totalSimulationSeconds'];
  if(!s.complete||overlap||keys.some(k=>s[k]!==loaded.data.expectedResult[k])||loaded.data.fullTraceSha256&&digest!==loaded.data.fullTraceSha256)throw Error('Diagnostic must reproduce the actual entire loaded-model trace');
  const result={passed:true,modelFile:file,modelSha256:loaded.sha256,actualControls:controls,result:Object.fromEntries(keys.map(k=>[k,s[k]])),actionTraceSha256:digest,stages:records,wallSeconds:(performance.now()-started)/1000,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    boundary:'Actual native gate activations and complete identical command trace, not ideal actions, a route or an optimizer example. An inactive cue indicates unused capacity on this one trajectory, not a universal cause of learning failure.'};
  fs.writeFileSync(out,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));return result;
}
if(require.main===module){if(process.argv.length!==4)throw Error('Actual numeric model and NEW diagnostic output file required');audit(path.resolve(process.argv[2]),path.resolve(process.argv[3]));}
module.exports={audit};
