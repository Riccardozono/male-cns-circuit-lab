'use strict';
// Independent readback of the recorded A/B, including its reference replay.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const dir=path.join(base,'progress7-live-practice-checkpoint-ab-cuda-20261027-94'),file=path.join(dir,'report.json'),out=path.join(dir,'verification.json');
const prior=path.join(base,'progress7-natural-training-cuda-20261027-92/report.json');
const anchor=path.join(base,'progress7-moving-practice-anchor-20261027-94/anchor.private.json');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const copy=path.join(base,'saved-v3-moving-pace-copy-20261027-85/SPERIMENTALE-solo-dev-v3-monza-progress7-copia.malecns-save');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),check=(x,m)=>{if(!x)throw Error(m);};
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
const same=(a,b)=>a.id===b.id&&a.tick===b.tick&&a.reason===b.reason&&a.safe===b.safe&&a.laps===b.laps&&
  ['lifetime','x','y','heading','progressM','fitness'].every(k=>near(a[k],b[k]))&&a.outputs.every((v,j)=>near(v,b.outputs[j]));
check(!fs.existsSync(out),'Refusing to overwrite');
const r=JSON.parse(fs.readFileSync(file,'utf8')),previous=JSON.parse(fs.readFileSync(prior,'utf8')),cp=JSON.parse(fs.readFileSync(anchor,'utf8'));
check(r.passed&&previous.passed&&sha(anchor)===r.anchorSha256&&sha(original)===r.originalSaveSha256&&sha(copy)===r.experimentalSaveSha256&&sha(prior)===r.referenceReportSha256,'Input identity mismatch');
check(sha(path.join(root,'work/benchmark_v3_progress7_live_practice_94.cjs'))===r.runnerSha256&&cp.state.generation===78&&cp.state.stagnation>=3,'Runner or checkpoint mismatch');
for(const [f,h] of Object.entries(r.sourceHashes.before))check(r.sourceHashes.after[f]===h&&sha(path.join(root,f))===h,'Source mismatch '+f);
check(r.control.rows.length===4&&r.treatment.rows.length===4&&r.pairs.length===4,'Incomplete A/B');
for(const arm of [r.control,r.treatment])for(let i=0;i<4;i++){
  const row=arm.rows[i],safe=row.outcomes.filter(a=>a.safe);
  check(row.generation===78+i&&row.outcomes.length===40&&new Set(row.outcomes.map(a=>a.id)).size===40,'Census mismatch');
  check(safe.length===row.safeCount&&safe.length>0&&near(Math.max(...safe.map(a=>a.progressM)),row.bestSafeProgressM)&&
    near(safe.reduce((s,a)=>s+a.progressM,0)/safe.length,row.meanSafeProgressM)&&Math.max(...safe.map(a=>a.laps))===row.maxSafeLaps&&
    row.outcomes.filter(a=>a.reason==='urto').length===row.collisionCount,'Outcome metric mismatch');
  check(row.movingPracticeCount===row.practice.filter(p=>Math.abs(p.context.speedMps)>1).length&&row.practice.every(p=>!p.improved||p.best.safe===true),'Practice summary mismatch');
}
for(let i=0;i<4;i++){const a=r.control.rows[i],b=r.treatment.rows[i],pair=r.pairs[i];
  check(pair.generation===a.generation&&pair.generation===b.generation&&near(pair.safeProgressDeltaM,b.bestSafeProgressM-a.bestSafeProgressM)&&
    pair.controlLaps===a.maxSafeLaps&&pair.treatmentLaps===b.maxSafeLaps,'Pair mismatch');}
check(r.control.rows[0].outcomes.every((a,i)=>same(a,r.treatment.rows[0].outcomes[i])),'Initial physical generation differs');
for(let i=0;i<2;i++){const observed=r.control.rows[i],reference=previous.rows.find(x=>x.generation===observed.generation);
  check(reference&&reference.ticks===observed.ticks&&observed.outcomes.every((a,j)=>same(a,reference.outcomes[j])),'Natural-run reference differs');}
check(r.gpu.gpuCalls===r.gpu.calls&&r.gpu.gpuCalls>0&&r.gpu.cpuFallbacks===0&&r.gpu.device.name.includes('RTX 4060')&&
  r.gpu.controlGpuCalls+r.gpu.treatmentGpuCalls===r.gpu.gpuCalls,'CUDA counters mismatch');
const differences=r.control.rows.map((a,i)=>({generation:a.generation,differentTerminalCars:a.outcomes.filter((x,j)=>!same(x,r.treatment.rows[i].outcomes[j])).length,
  controlMeanSafeM:a.meanSafeProgressM,treatmentMeanSafeM:r.treatment.rows[i].meanSafeProgressM}));
const result={passed:true,reportSha256:sha(file),runnerSha256:sha(__filename),anchorSha256:sha(anchor),generations:8,recordedOutcomes:320,
  referenceOutcomes:80,controlMovingContexts:r.control.rows.reduce((s,x)=>s+x.movingPracticeCount,0),
  treatmentMovingContexts:r.treatment.rows.reduce((s,x)=>s+x.movingPracticeCount,0),gpuCalls:r.gpu.gpuCalls,cpuFallbacks:r.gpu.cpuFallbacks,
  maxSafeLaps:Math.max(...r.treatment.rows.map(x=>x.maxSafeLaps)),differences,
  boundary:'Independent readback of existing terminal outcomes, hashes and CUDA counters, not a fresh replay or a multi-seed/circuit generalization test.'};
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log('V3_LIVE_PRACTICE_VERIFIED '+JSON.stringify({...result,verification:out,verificationSha256:sha(out)}));
