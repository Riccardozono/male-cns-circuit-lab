'use strict';
// Independent report/readback audit. It does not rerun the physical simulation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const dir=path.join(base,'saved-v3-moving-pace-copy-two-generations-20261027-86'),reportPath=path.join(dir,'report.json');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const copy=path.join(base,'saved-v3-moving-pace-copy-20261027-85/SPERIMENTALE-solo-dev-v3-monza-progress7-copia.malecns-save');
const prior=path.join(base,'saved-v3-moving-slow-recovery-2gen-ab-20261026-82/report.json');
const previousPhysical=path.join(base,'saved-v3-moving-pace-app-verification-20261026-83/report.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const check=(x,msg)=>{if(!x)throw Error(msg);},near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-8;
const r=read(reportPath),ref=read(prior),physical=read(previousPhysical);
check(r.passed&&sha(original)===r.originalSaveSha256&&sha(copy)===r.migratedCopySha256,'Save identity differs');
check(sha(prior)===r.priorControlReportSha256&&sha(previousPhysical)===r.appPhysicalReportSha256,'Reference report differs');
check(sha(path.join(root,'work/benchmark_migrated_v3_two_generations_86.cjs'))===r.runnerSha256,'Benchmark source differs');
for(const [name,digest] of Object.entries(r.sourceHashes))check(sha(path.join(root,name))===digest,'Application source differs: '+name);
function compare(a,b,fitness){
  check(a.length===40&&b.length===40,'Incomplete population');
  for(let i=0;i<40;i++){
    const x=a[i],y=b[i];
    check(x.id===y.id&&x.tick===y.tick&&x.reason===y.reason&&x.laps===y.laps&&x.safe===y.safe&&x.slowPenalty===y.slowPenalty,'Outcome differs for car '+i);
    for(const k of ['lifetime','x','y','heading','progressM'])check(near(x[k],y[k]),k+' differs for car '+i);
    check(x.outputs.every((v,j)=>near(v,y.outputs[j])),'Motor command differs for car '+i);
    if(fitness)check(near(x.fitness,y.fitness),'Historical fitness differs for car '+i);
  }
}
for(let g=0;g<2;g++){
  const a=r.control.rows[g],b=r.copy.rows[g];check(a.generation===64+g&&b.generation===64+g,'Generation mismatch');
  compare(a.outcomes,ref.control.rows[g].outcomes,true);
  for(const row of [a,b]){
    const safe=row.outcomes.filter(x=>x.safe);
    check(safe.length===row.safeCount&&near(Math.max(...safe.map(x=>x.progressM)),row.bestSafeProgressM)&&
      Math.max(...safe.map(x=>x.laps))===row.maxSafeLaps&&row.outcomes.filter(x=>x.reason==='urto').length===row.collisionCount,'Outcome summary mismatch');
  }
  check(near(r.comparison.bestSafeProgressDeltas[g],b.bestSafeProgressM-a.bestSafeProgressM)&&
    r.comparison.safeCountDeltas[g]===b.safeCount-a.safeCount&&r.comparison.collisionDeltas[g]===b.collisionCount-a.collisionCount,'Comparison differs');
}
compare(r.copy.rows[0].outcomes,physical.updated.outcomes,false);
check(r.learningSucceeded===r.copy.rows.some(x=>x.maxSafeLaps>=2)&&!r.approvedForApp,'Invalid learning flag');
const snapshots={};for(const [source,name] of [['work/benchmark_migrated_v3_two_generations_86.cjs','runner-source.cjs'],
  ['work/verify_migrated_v3_two_generations_86.cjs','verifier-source.cjs']]){
  const target=path.join(dir,name);fs.writeFileSync(target,fs.readFileSync(path.join(root,source)),{flag:'wx'});
  check(sha(target)===sha(path.join(root,source)),'Snapshot differs');snapshots[name]=sha(target);
}
const summary=arm=>arm.rows.map(({outcomes,...row})=>row);
const result={passed:true,reportSha256:sha(reportPath),originalSaveSha256:sha(original),migratedCopySha256:sha(copy),
  control:summary(r.control),copy:summary(r.copy),comparison:r.comparison,
  sourceCount:Object.keys(r.sourceHashes).length,populationPerGeneration:40,sourceSnapshots:snapshots,
  learningSucceeded:r.learningSucceeded,approvedForApp:false,
  boundary:'Independent report and source consistency audit; not an additional physical replay, other worker/track/model test, or convergence proof.'};
const destination=path.join(dir,'verification.json');fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('MIGRATED_COPY_BENCHMARK_VERIFIED '+JSON.stringify({verification:destination,sha256:sha(destination),...result}));
