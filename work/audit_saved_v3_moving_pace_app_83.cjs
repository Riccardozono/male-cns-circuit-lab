'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const dir=path.join(base,'saved-v3-moving-pace-app-verification-20261026-83');
const reportPath=path.join(dir,'report.json'),priorPath=path.join(base,'saved-v3-moving-slow-recovery-2gen-ab-20261026-82/report.json');
const oldPath=path.join(base,'saved-v3-moving-slow-recovery-2gen-ab-20261026-82/rewards-before.js');
const save='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const check=(x,msg)=>{if(!x)throw Error(msg);},near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-8;
const r=read(reportPath),prior=read(priorPath),old=require(oldPath),current=require('../outputs/rewards.js');
check(r.originalSaveSha256===sha(save)&&r.priorAbSha256===sha(priorPath)&&r.originalRewardSnapshotSha256===sha(oldPath),'Evidence identity mismatch');
check(r.runnerSha256===sha(path.join(root,'work/verify_saved_v3_moving_pace_app_83.cjs')),'Runner identity mismatch');
for(const [p,d] of Object.entries(r.sourceHashes))check(sha(path.join(root,p))===d,'Application source changed: '+p);
check(current.REVISION==='progress-7-moving-pace'&&!old.SUPPORTED_REVISIONS.includes(current.REVISION),'Old revision compatibility check failed');
check(current.SUPPORTED_REVISIONS.includes('progress-3')&&current.SUPPORTED_REVISIONS.includes(old.REVISION),'Historical revisions unavailable');
for(const [name,baseline,fitness] of [['historical',prior.control.rows[0].outcomes,true],['updated',prior.treatment.rows[0].outcomes,false]]){
  const rows=r[name].outcomes;check(rows.length===40&&baseline.length===40,'Wrong agent count');
  for(let i=0;i<40;i++){
    const a=rows[i],b=baseline[i];
    check(a.id===b.id&&a.tick===b.tick&&a.laps===b.laps&&a.safe===b.safe&&a.reason===b.reason&&a.slowPenalty===b.slowPenalty,'Different recorded outcome');
    for(const k of ['lifetime','x','y','heading','progressM','speedMps'])check(near(a[k],b[k]),'Different '+k);
    check(a.outputs.every((v,j)=>near(v,b.outputs[j])),'Different control');if(fitness)check(near(a.fitness,b.fitness),'Different historical fitness');
  }
}
check(!r.learningSucceeded&&r.historical.summary.maxSafeLaps===0&&r.updated.summary.maxSafeLaps===0,'Incorrect lap claim');
const out={passed:true,reportSha256:sha(reportPath),priorAbSha256:sha(priorPath),originalSaveSha256:sha(save),
  sourceCount:Object.keys(r.sourceHashes).length,agentsPerArm:40,historical:r.historical.summary,updated:r.updated.summary,
  boundary:'Independent consistency and source readback; these checks are not a second replay or training study.'};
const target=path.join(dir,'verification.json');fs.writeFileSync(target,JSON.stringify(out,null,2)+'\n',{encoding:'utf8',flag:'wx'});
console.log(JSON.stringify({verification:target,sha256:sha(target),...out}));
