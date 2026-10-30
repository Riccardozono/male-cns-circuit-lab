'use strict';
// Independent readback and numerical consistency checks; this is not a new run.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const dir=path.join(base,'saved-v3-progress7-safe-practice-ab-cuda-20261027-89'),file=path.join(dir,'report.json'),out=path.join(dir,'verification.json');
const copy=path.join(base,'saved-v3-moving-pace-copy-20261027-85/SPERIMENTALE-solo-dev-v3-monza-progress7-copia.malecns-save');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const prior=path.join(base,'saved-v3-moving-pace-copy-two-generations-20261027-86/report.json');
const phase=path.join(base,'saved-v3-practice-control-phase-audit-20261027-87/report.json');
const archivedSimulation=path.join(base,'saved-v3-practice-control-phase-audit-20261027-87/simulation-before.js');
const diagnostic=path.join(base,'saved-v3-terminal-practice-phase-selection-20261027-88/report.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),check=(v,m)=>{if(!v)throw Error(m);};
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
check(!fs.existsSync(out),'Refusing to overwrite verification');
const report=JSON.parse(fs.readFileSync(file,'utf8')),p=JSON.parse(fs.readFileSync(prior,'utf8')),
  ph=JSON.parse(fs.readFileSync(phase,'utf8')),d=JSON.parse(fs.readFileSync(diagnostic,'utf8'));
check(report.passed&&p.passed&&ph.passed&&d.passed,'Missing successful experiment or diagnostic');
check(sha(original)===report.originalSaveSha256&&sha(copy)===report.migratedCopySha256&&sha(prior)===report.referenceReportSha256&&sha(diagnostic)===report.diagnosticSha256,'Input hash changed');
check(ph.rows.length===12&&ph.rows.filter(r=>r.firstCommandDifferenceTick===1).length===10&&ph.rows.filter(r=>r.nextControlPhase===0).every(r=>r.firstCommandDifferenceTick===null)&&
  ph.rows.every(r=>r.phaseAwareMaxPositionErrorM===0),'Phase summary not supported by rows');
check(d.results.length===4&&d.results.filter(r=>r.selectedOld.reason==='urto').length===2&&d.results.every(r=>!r.selectionChanged),'Offline local-selection summary mismatch');
for(const [f,h] of Object.entries(report.sourceHashes.before)){
  const reference=f==='outputs/simulation.js'?archivedSimulation:path.join(root,f);
  check(h===report.sourceHashes.after[f]&&sha(reference)===h,'Source identity mismatch '+f);
}
check(report.control.rows.length===6&&report.treatment.rows.length===6&&report.pairs.length===6,'Incomplete natural generations');
for(const arm of [report.control,report.treatment])for(let i=0;i<arm.rows.length;i++){
  const row=arm.rows[i],outcomes=row.outcomes,safe=outcomes.filter(o=>o.safe);
  check(row.generation===64+i&&outcomes.length===40&&new Set(outcomes.map(o=>o.id)).size===40,'Invalid census');
  check(row.safeCount===safe.length&&row.collisionCount===outcomes.filter(o=>o.reason==='urto').length&&
    near(row.bestSafeProgressM,Math.max(...safe.map(o=>o.progressM)))&&row.maxSafeLaps===Math.max(...safe.map(o=>o.laps)),
    'Generation metrics do not follow the recorded outcomes');
  check(row.unsafeImprovementCount===row.practice.filter(q=>q.improved&&!q.best.safe).length,'Unsafe promotion count mismatch');
  if(arm===report.treatment)check(row.unsafeImprovementCount===0,'Unsafe promotion in treatment');
  if(i<2){const reference=p.copy.rows[i];check(row.ticks===reference.ticks,'Reference ticks differ');
    for(const a of outcomes){const b=reference.outcomes[a.id];check(a.id===b.id&&a.tick===b.tick&&a.reason===b.reason&&a.laps===b.laps&&a.safe===b.safe&&
      ['lifetime','x','y','heading','progressM','fitness'].every(k=>near(a[k],b[k]))&&a.outputs.every((v,j)=>near(v,b.outputs[j])),
      'Reference census differs for car '+a.id);}}
}
for(let i=0;i<6;i++){const a=report.control.rows[i],b=report.treatment.rows[i],pair=report.pairs[i];
  check(pair.generation===a.generation&&pair.generation===b.generation&&near(pair.safeProgressDeltaM,b.bestSafeProgressM-a.bestSafeProgressM)&&
    pair.controlLaps===a.maxSafeLaps&&pair.treatmentLaps===b.maxSafeLaps&&pair.controlCollisions===a.collisionCount&&pair.treatmentCollisions===b.collisionCount,'Pair mismatch');}
check(JSON.stringify(report.control.rows[0].outcomes)===JSON.stringify(report.treatment.rows[0].outcomes),'First paired generation differs');
check(report.gpu.gpuCalls>0&&report.gpu.controlGpuCalls>0&&report.gpu.treatmentGpuCalls>0&&report.gpu.cpuFallbacks===0&&
  report.gpu.controlGpuCalls+report.gpu.treatmentGpuCalls===report.gpu.gpuCalls&&report.gpu.device.name.includes('RTX 4060'),'CUDA evidence mismatch');
check(report.learningSucceeded===report.treatment.rows.some(r=>r.maxSafeLaps>=2),'Learning success field mismatch');
const summary={passed:true,reportSha256:sha(file),runnerSha256:sha(__filename),originalSha256:sha(original),migratedCopySha256:sha(copy),
  verifiedGenerations:12,verifiedCars:480,gpuCalls:report.gpu.gpuCalls,cpuFallbacks:report.gpu.cpuFallbacks,
  controlUnsafePromotions:report.control.rows.reduce((s,r)=>s+r.unsafeImprovementCount,0),
  treatmentUnsafePromotions:report.treatment.rows.reduce((s,r)=>s+r.unsafeImprovementCount,0),
  boundary:'Independent readback of recorded outcomes, hashes, practice summaries and GPU counters; not a fresh physical replay and not a cross-circuit generalization test.'};
fs.writeFileSync(out,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});console.log('SAFE_PRACTICE_GPU_VERIFY '+JSON.stringify({...summary,verification:out,verificationSha256:sha(out)}));
