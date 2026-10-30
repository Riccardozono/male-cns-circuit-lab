'use strict';
// Reread the six-generation run and cross-check recorded outcomes, source and
// save identities. This is not another physical simulation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const dir=path.join(base,'saved-v3-progress7-practice-fixes-app-cpu-20261027-90');
const file=path.join(dir,'report.json'),output=path.join(dir,'verification.json');
const reference=path.join(base,'saved-v3-progress7-safe-practice-ab-cuda-20261027-89/report.json');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const copy=path.join(base,'saved-v3-moving-pace-copy-20261027-85/SPERIMENTALE-solo-dev-v3-monza-progress7-copia.malecns-save');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),check=(x,m)=>{if(!x)throw Error(m);};
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
check(!fs.existsSync(output),'Refusing to overwrite verification');
const r=JSON.parse(fs.readFileSync(file,'utf8')),prior=JSON.parse(fs.readFileSync(reference,'utf8'));
check(r.passed&&prior.passed&&sha(original)===r.originalSaveSha256&&sha(copy)===r.migratedCopySha256&&sha(reference)===r.referenceReportSha256,'Input mismatch');
check(r.runnerSha256===sha(path.join(root,'work/verify_v3_practice_app6_90.cjs')),'Runner identity mismatch');
for(const [f,h] of Object.entries(r.sourceHashes.before))check(r.sourceHashes.after[f]===h&&sha(path.join(root,f))===h,'Source mismatch: '+f);
check(r.rows.length===6&&r.comparison.length===6&&r.terminalSnapshotsWithPhase===240,'Incomplete generations');
for(let i=0;i<r.rows.length;i++){
  const row=r.rows[i],safe=row.outcomes.filter(a=>a.safe),p=r.comparison[i];
  check(row.generation===64+i&&row.outcomes.length===40&&new Set(row.outcomes.map(a=>a.id)).size===40,'Invalid outcome census');
  check(row.outcomes.every(a=>Number.isInteger(a.nextControlPhase)&&a.nextControlPhase>=0&&a.nextControlPhase<6),'Invalid recorded phase');
  check(safe.length===row.safeCount&&safe.length>0&&near(Math.max(...safe.map(a=>a.progressM)),row.bestSafeProgressM)&&
    Math.max(...safe.map(a=>a.laps))===row.maxSafeLaps&&row.outcomes.filter(a=>a.reason==='urto').length===row.collisionCount,'Metrics do not match outcomes');
  check(row.unsafePromotions===0&&row.practice.every(a=>!a.improved||a.best.safe===true),'Unsafe local improvement promoted');
  check(p.generation===row.generation&&near(p.currentSafeProgressM,row.bestSafeProgressM)&&near(p.previousSafeProgressM,prior.control.rows[i].bestSafeProgressM)&&
    near(p.filteredOnlySafeProgressM,prior.treatment.rows[i].bestSafeProgressM)&&p.currentLaps===row.maxSafeLaps,'Comparison mismatch');
  if(i<2){const old=prior.control.rows[i];check(old.ticks===row.ticks,'Reference ticks differ');for(const a of row.outcomes){
    const b=old.outcomes[a.id];check(a.id===b.id&&a.tick===b.tick&&a.reason===b.reason&&a.safe===b.safe&&a.laps===b.laps&&
      ['lifetime','x','y','heading','progressM','fitness'].every(k=>near(a[k],b[k]))&&a.outputs.every((v,j)=>near(v,b.outputs[j])),
      'GPU reference differs for car '+a.id);
  }}
}
check(r.learningSucceeded===r.rows.some(g=>g.maxSafeLaps>=2),'Incorrect learning-success flag');
const result={passed:true,reportSha256:sha(file),runnerSha256:sha(__filename),originalSha256:sha(original),copySha256:sha(copy),
  generations:r.rows.length,outcomes:r.rows.reduce((s,x)=>s+x.outcomes.length,0),
  bestSafeProgressM:Math.max(...r.rows.map(x=>x.bestSafeProgressM)),maxSafeLaps:Math.max(...r.rows.map(x=>x.maxSafeLaps)),
  practiceEvaluations:r.rows.reduce((s,x)=>s+x.practiceEvaluations,0),unsafePromotions:r.rows.reduce((s,x)=>s+x.unsafePromotions,0),
  boundary:'Readback and identity/metric checks of an existing report, including recorded GPU-reference outcomes. No new physical replay or cross-model generalization.'};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log('APP6_RESULT_VERIFIED '+JSON.stringify({...result,verification:output,sha256:sha(output)}));
