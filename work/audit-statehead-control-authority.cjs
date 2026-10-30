'use strict';
// Measure where the trained head has any causal authority; never a driver.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),M=require('./neural-statehead-cuda-model.cjs');
const root=path.resolve(__dirname,'..'),tag=process.argv[2],sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if(!tag||!/^[a-zA-Z0-9-]+$/.test(tag))throw Error('Scoped audit required');
const out=path.join(root,'.impeccable/review/learning-ml',tag);fs.mkdirSync(out);
try{
 const dir=path.join(root,'.impeccable/review/learning-ml/statehead-best-fresh-replay-20261025-01'),f=path.join(dir,'observations.private.json'),proof=JSON.parse(fs.readFileSync(path.join(dir,'report.json')));
 if(!proof.passed||sha(f)!==proof.observationsSha256)throw Error('Measured protected trajectory identity required');
 const rows=JSON.parse(fs.readFileSync(f)),zero=rows.filter(r=>r.stateHead.gate===0),active=rows.filter(r=>r.stateHead.gate>0),
   aggressiveBefore=zero.filter(r=>Math.abs(r.commands[0])>.25);
 function reversals(values){let previous=0,count=0;for(const r of values){const sign=Math.abs(r.commands[0])>.02?Math.sign(r.commands[0]):0;if(sign&&previous&&sign!==previous)count++;if(sign)previous=sign;}return count;}
 const choice=M.defaultChoice(),loaded=M.load(choice.file),kicks=[];let topology=null;
 for(const angle of [-.00125,.00125]){
   const env=M.createFromLoaded(loaded,{sharedTopology:topology});topology=env.topology;env.currentCar().heading+=angle;
   let state=env.state(),controls=0,maxGate=0,firstActive=null;
   while(!state.complete){state=env.step();controls++;const g=env.stateHeadSnapshot().gate;maxGate=Math.max(maxGate,g);if(g>0&&firstActive===null)firstActive=controls;}
   kicks.push({headingKickRad:angle,controls,maximumHeadGate:maxGate,firstActiveControl:firstActive,result:{bestProgress:state.bestProgress,fitness:state.fitness,laps:state.laps,reason:state.reason}});
 }
 const report={format:'private-statehead-causal-authority-audit-v1',passed:true,learningSucceeded:false,
   measuredRows:rows.length,zeroGateRows:zero.length,activeGateRows:active.length,
   firstActiveRow:active.length?{control:active[0].control,progressAfterStep:active[0].progress,speedAfterStepMps:active[0].speedMps,gate:active[0].stateHead.gate}:null,
   firstAbsSteeringAbove025WhileZero:aggressiveBefore.length?{control:aggressiveBefore[0].control,progressAfterStep:aggressiveBefore[0].progress,commands:aggressiveBefore[0].commands,speedAfterStepMps:aggressiveBefore[0].speedMps}:null,
   steeringReversalsWhileZero:reversals(zero),strongSteeringRowsWhileZero:aggressiveBefore.length,
   headingKickCases:kicks,allKickedFailuresBeforeAnyHeadAuthority:kicks.every(k=>k.result.laps===0&&k.maximumHeadGate===0),
   cuda:M.stats(),sourceSha256:sha(__filename),observationSha256:sha(f),parentSha256:choice.modelSha256,
   bound:'For this fixed neuronal gate, output difference between any two bounded18-weight heads is at most4*gate per motor axis, because each tanh is bounded and the final clamp is1-Lipschitz. At gate0 the difference is exactly0. Variance sampling in the research sampler is also disabled there.',
   boundary:'Proves no authority of this particular late head in observed zero-gate regions and both physical kick failures. Does not prove MaleCNS or other motor decoders cannot learn. Existing neuronal gate is not a route/clock input, but its narrow support limits adaptation; changing it invalidates the zero-prefix reuse proof.'};
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});fs.copyFileSync(__filename,path.join(out,'auditor-at-run.cjs'));console.log('STATEHEAD_AUTHORITY_AUDIT '+JSON.stringify(report));
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:error.stack},null,2),{flag:'wx'});throw error;}
finally{M.closeCuda();}
