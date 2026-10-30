'use strict';
// Read-only recording of the actually applied neural gate/parent commands.
// Algebraic correction bounds are diagnostics, never action labels or a pilot.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),Native=require('./neural-ppo-authority-diagnostic.cjs'),I=require('./neural-research-source-identity.cjs');
const base=path.resolve('.impeccable/review/neural-sacl'),out=path.join(base,'actual-neural-motor-authority-first');fs.mkdirSync(out,{recursive:false});
try{
 const p=JSON.parse(fs.readFileSync(path.join(base,'neuronal-ppo-normalized520-first/initial-policy.json'),'utf8')),origin=JSON.parse(JSON.parse(fs.readFileSync(p.identity.originFile,'utf8')).payloadJson),env=Native.create({modelFile:p.identity.originFile,preparedFile:p.identity.preparedFile,normalizationFile:p.identity.normalizationFile,weights:p.weights}),rows=[],hash=crypto.createHash('sha256');let state=env.state(),controls=0;
 while(!state.complete){state=env.step();controls++;hash.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');const a=env.inspectMotorAuthority(),long=a.parent[1]-a.parent[2];
  rows.push({controls,progress:state.bestProgress,seconds:state.totalSimulationSeconds,speedMps:state.car.vehicle.speedMps,gate:a.gate,parentCommands:a.parent,proposedAction:a.proposedAction,
   minimumPossibleLong:Math.max(-1,long-2*a.gate),maximumPossibleLong:Math.min(1,long+2*a.gate)});
 }
 assert.equal(hash.digest('hex'),origin.fullTraceSha256);assert.equal(env.cudaStats().cpuFallbacks,0);
 const active=rows.filter(r=>r.gate>0),cannotBrake=active.filter(r=>r.minimumPossibleLong>1e-10),cannotAccelerate=active.filter(r=>r.maximumPossibleLong < -1e-10);
 const report={passed:true,controls,actualActivatedControls:active.length,firstActivatedControl:active[0]?.controls,maxActualGate:Math.max(...rows.map(r=>r.gate)),
  activeRowsUnableToReachBrakeEvenAtMaxNegativeProposal:cannotBrake.length,activeRowsUnableToReachThrottleEvenAtMaxPositiveProposal:cannotAccelerate.length,
  lastActualRows:rows.slice(-20),actualRows:rows,fullParentTraceStillExact:true,cuda:env.cudaStats(),sources:I.collect(['work/audit-actual-neural-motor-authority.cjs','work/neural-ppo-authority-diagnostic.cjs']),
  boundary:'Actual unmodified protected trajectory with algebraic bounds on its declared direct motor correction. Not a proof that a different physically altered trajectory has the same gates or that this alone causes failed learning.'};
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,controls,active:active.length,first:active[0]?.controls,maxGate:report.maxActualGate,cannotBrake:cannotBrake.length,cannotAccelerate:cannotAccelerate.length,last:rows.slice(-3)}));
}catch(error){fs.writeFileSync(path.join(out,'failed.json'),JSON.stringify({passed:false,error:error.stack},null,2),{flag:'wx'});console.error(error.stack);process.exitCode=1;}finally{Native.close();}
