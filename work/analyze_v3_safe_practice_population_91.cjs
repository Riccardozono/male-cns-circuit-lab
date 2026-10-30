'use strict';
// Post-hoc paired population analysis of completed reports. It does not run
// another simulation or claim a particular genetic lineage without weights.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const gpu=path.join(base,'saved-v3-progress7-safe-practice-ab-cuda-20261027-89/report.json');
const cpu=path.join(base,'saved-v3-progress7-practice-fixes-app-cpu-20261027-90/report.json');
const out=path.join(base,'saved-v3-safe-practice-population-analysis-20261027-91');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),check=(x,m)=>{if(!x)throw Error(m);};
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
check(!fs.existsSync(out),'Refusing to overwrite analysis');
check(sha(gpu)==='be28eaccf32aae8f6a4c80d1640fabb077165810dcf848a94a8daad81bf66f40'&&
 sha(cpu)==='8ce8abbb543f7b21bb5801d9e8ec688b7959c1a212d3bd8c948e8fe3c1e59df2','Input reports differ from verified experiments');
const g=JSON.parse(fs.readFileSync(gpu,'utf8')),c=JSON.parse(fs.readFileSync(cpu,'utf8'));
check(g.passed&&c.passed&&g.control.rows.length===6&&g.treatment.rows.length===6&&c.rows.length===6,'Incomplete experiment');
function summary(row){const safe=row.outcomes.filter(v=>v.safe);return {safeCount:safe.length,collisionCount:row.outcomes.filter(v=>v.reason==='urto').length,
  bestSafeProgressM:Math.max(...safe.map(v=>v.progressM)),meanSafeProgressM:safe.reduce((sum,v)=>sum+v.progressM,0)/safe.length,
  safeAtLeast500M:safe.filter(v=>v.progressM>=500).length,maxSafeLaps:Math.max(...safe.map(v=>v.laps))};}
function samePhysical(a,b){return a.id===b.id&&a.tick===b.tick&&a.reason===b.reason&&a.safe===b.safe&&a.laps===b.laps&&
  ['lifetime','x','y','heading','progressM','fitness'].every(k=>near(a[k],b[k]))&&a.outputs.every((v,i)=>near(v,b.outputs[i]));}
const rows=[];
for(let i=0;i<6;i++){
  const control=g.control.rows[i],filtered=g.treatment.rows[i],actual=c.rows[i];
  check(control.generation===filtered.generation&&control.generation===actual.generation&&control.outcomes.length===40&&filtered.outcomes.length===40&&actual.outcomes.length===40,'Census mismatch');
  for(let j=0;j<40;j++)check(filtered.outcomes[j].id===j&&actual.outcomes[j].id===j&&samePhysical(filtered.outcomes[j],actual.outcomes[j]),
    'Combined CPU replay differs from filter-only GPU result for generation '+control.generation+' car '+j);
  const differences=control.outcomes.map((a,j)=>({control:a,treatment:filtered.outcomes[j]})).filter(({control:a,treatment:b})=>!samePhysical(a,b)).map(({control:a,treatment:b})=>({
    id:a.id,control:{progressM:a.progressM,reason:a.reason,safe:a.safe},treatment:{progressM:b.progressM,reason:b.reason,safe:b.safe},deltaProgressM:b.progressM-a.progressM}));
  const a=summary(control),b=summary(filtered);
  rows.push({generation:control.generation,control:a,filtered:b,actualMatchesFilteredOnAllForty:true,
    meanSafeDeltaM:b.meanSafeProgressM-a.meanSafeProgressM,safeAtLeast500Delta:b.safeAtLeast500M-a.safeAtLeast500M,differences});
}
check(rows.slice(0,5).every(x=>x.differences.length===0),'Unexpected divergence before generation 69');
check(rows[5].differences.length===2&&rows[5].differences.some(v=>v.id===20&&v.control.safe&&v.treatment.safe&&v.deltaProgressM>700),'Expected paired population change absent');
const report={passed:true,gpuReportSha256:sha(gpu),cpuReportSha256:sha(cpu),runnerSha256:sha(__filename),model:'V3',circuit:'Monza',worker:0,seed:7717,
  settings:{population:40,generations:6,comparison:'same-start paired outcomes with and without local safe-promotion filter'},rows,
  boundary:'Post-hoc analysis of one seed and one worker. Both arms finish with zero safe laps and the same best safe progress. The two different car slots are not proof of genetic lineage because the reports do not record complete child weight identities. CPU with the combined fixes reproduces the filter-only GPU physical outcomes in these six generations; this is not proof of multi-seed or multi-track learning.'};
fs.mkdirSync(out,{recursive:false});const file=path.join(out,'analysis.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log('PRACTICE_POPULATION_ANALYSIS '+JSON.stringify({file,sha256:sha(file),last:rows[5],learningSucceeded:false}));
