'use strict';
// Readback audit of the A/B evidence; it does not rerun either population.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const dir=path.join(base,'saved-v3-moving-slow-recovery-2gen-ab-20261026-82');
const prior=path.join(base,'saved-v3-paired-sensor-longitudinal-4updates-cuda-20261026-01/report.json');
const research=path.join(base,'statehead-moving-slow-recovery-paired-20261026-81/report.json');
const save='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const ensure=(v,msg)=>{if(!v)throw Error(msg);},close=(a,b)=>Math.abs(a-b)<1e-8;
const reportFile=path.join(dir,'report.json'),r=read(reportFile),previous=read(prior);
ensure(r.save.sha256===sha(save)&&r.saveUnchanged,'Save identity mismatch');
ensure(r.priorReportSha256===sha(prior)&&r.researchReportSha256===sha(research),'Prior evidence identity mismatch');
ensure(r.runnerSha256===sha(path.join(root,'work/benchmark_saved_v3_moving_slow_recovery_82.cjs')),'Runner identity mismatch');
for(const [file,digest] of Object.entries(r.sourceHashes.before)){
  ensure(r.sourceHashes.after[file]===digest,'Source changed during run: '+file);
  ensure(sha(path.join(root,file))===digest,'Source changed after run: '+file);
}
ensure(r.prefixChecks.length===40&&new Set(r.prefixChecks.map(x=>x.id)).size===40&&
  r.prefixChecks.every(x=>x.matchingPrefix&&x.matchingStop&&x.matchedControls>0),'Paired prefixes incomplete');
for(let i=0;i<2;i++){
  const a=r.control.rows[i],b=r.treatment.rows[i];
  ensure(a.generation===64+i&&b.generation===64+i,'Wrong generation');
  for(const row of [a,b]){
    ensure(row.outcomes.length===40,'Incomplete outcomes');
    const safe=row.outcomes.filter(x=>x.safe);
    ensure(safe.length===row.safeAgentCount&&close(Math.max(...safe.map(x=>x.progressM)),row.bestSafeProgressM),'Summary does not match records');
    ensure(row.maxSafeLaps===Math.max(...safe.map(x=>x.laps)),'Lap summary does not match records');
  }
}
const priorById=new Map(previous.control.records[0].outcomes.map(x=>[x.id,x]));
for(const a of r.control.rows[0].outcomes){
  const b=priorById.get(a.id);ensure(b&&a.reason===b.reason&&a.safe===b.safe&&a.laps===b.laps&&
    close(a.progressM,b.progressM)&&close(a.fitness,b.fitness)&&close(a.outputs[0],b.steering)&&
    close(a.outputs[1],b.gas)&&close(a.outputs[2],b.brake),'Saved control differs from GPU reference');
}
for(const p of r.comparison.deferredGeneration64){
  ensure(p.control.reason==='troppo lenta / senza progresso'&&p.control.slowPenalty===1400,'Unexpected control stop');
  ensure(p.treatment.deferrals===1&&p.treatment.deferralEvents.length===1,'Unexpected deferral count');
  const e=p.treatment.deferralEvents[0];
  ensure(e.speedMps>=e.minimumMps&&close(e.progress,p.control.progressM)&&e.slowPenalty===1400,'Recovery evidence invalid');
  ensure(p.treatment.slowPenalty>=1400&&p.treatment.progressM>p.control.progressM,'Penalty or progress incorrect');
}
ensure(r.comparison.deferredGeneration64.length===2,'Unexpected number of continuing cars');
ensure(!r.learningSucceeded&&!r.approvedForApp&&r.treatment.rows.every(row=>row.maxSafeLaps===0),'Incorrect learning claim');
const out={passed:true,reportSha256:sha(reportFile),originalSaveSha256:sha(save),verifiedSourceCount:Object.keys(r.sourceHashes.before).length,
  generation64PrefixCount:r.prefixChecks.length,deferredCars:r.comparison.deferredGeneration64.map(x=>x.control.id),
  control:r.control.rows.map(x=>({generation:x.generation,safe:x.safeAgentCount,bestSafeProgressM:x.bestSafeProgressM,laps:x.maxSafeLaps})),
  treatment:r.treatment.rows.map(x=>({generation:x.generation,safe:x.safeAgentCount,bestSafeProgressM:x.bestSafeProgressM,laps:x.maxSafeLaps})),
  boundary:'Readback, source and consistency checks; prefix matches were recorded by the A/B runner, not independently rerun.'};
const output=path.join(dir,'verification.json');fs.writeFileSync(output,JSON.stringify(out,null,2)+'\n',{encoding:'utf8',flag:'wx'});
console.log(JSON.stringify({verification:output,sha256:sha(output),...out}));
