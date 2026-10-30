'use strict';
// Independent readback of continuation outcomes and identity. No new replay.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const dir=path.join(base,'progress7-natural-continue-cuda-20261027-100'),file=path.join(dir,'report.json'),out=path.join(dir,'verification.json');
const reference=path.join(base,'progress7-live-practice-checkpoint-ab-cuda-20261027-94/report.json');
const checkpoint=path.join(base,'progress7-natural-training-cuda-20261027-92/checkpoint-0.private.json');
const saved=path.join(base,'progress7-trained-copy-20261027-93/SPERIMENTALE-solo-dev-v3-monza-gen80-worker0.malecns-save');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),check=(x,m)=>{if(!x)throw Error(m);};
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
check(!fs.existsSync(out),'Refusing to overwrite verification');
const r=JSON.parse(fs.readFileSync(file,'utf8')),prior=JSON.parse(fs.readFileSync(reference,'utf8'));
check(r.passed&&!r.diagnosticGuardExceeded&&r.rows.length>=2&&r.rows.length<=12&&r.generationsCompleted===r.rows.length&&prior.passed,'Incomplete run');
for(const [f,h] of [[reference,r.referenceReportSha256],[checkpoint,r.inputCheckpointSha256],[saved,r.inputSaveSha256],[original,r.originalSaveSha256]])check(sha(f)===h,'Input hash mismatch');
check(sha(path.join(root,'work/train_v3_progress7_continue_cuda_100.cjs'))===r.runnerSha256,'Runner differs');
for(const [f,h] of Object.entries(r.sourceHashes.before))check(r.sourceHashes.after[f]===h&&sha(path.join(root,f))===h,'Source mismatch: '+f);
const progress=fs.readFileSync(path.join(dir,'progress.ndjson'),'utf8').trim().split('\n').map(JSON.parse);
check(progress.length===r.rows.length,'Progress log incomplete');
const ref=prior.control.rows.filter(x=>x.generation===80||x.generation===81);check(ref.length===2,'Missing prior control');
for(let i=0;i<r.rows.length;i++){
  const row=r.rows[i],safe=row.outcomes.filter(a=>a.safe),line=progress[i];
  check(row.generation===80+i&&line.generation===row.generation&&row.outcomes.length===40&&new Set(row.outcomes.map(a=>a.id)).size===40,'Census mismatch');
  check(safe.length===row.safeCount&&safe.length>0&&near(Math.max(...safe.map(a=>a.progressM)),row.bestSafeProgressM)&&
    near(safe.reduce((sum,a)=>sum+a.progressM,0)/safe.length,row.meanSafeProgressM)&&Math.max(...safe.map(a=>a.laps))===row.maxSafeLaps&&
    safe.filter(a=>a.progressM>=500).length===row.safeAtLeast500M&&row.outcomes.filter(a=>a.reason==='urto').length===row.collisionCount,'Recorded metrics do not match outcomes');
  check(row.unsafePromotions===0&&row.ticks===line.ticks&&near(row.bestSafeProgressM,line.bestSafeProgressM)&&row.optimizerUpdates===line.optimizerUpdates,'Progress log mismatch');
  if(i<2){const expected=ref[i];check(row.generation===expected.generation&&row.ticks===expected.ticks,'Reference shape mismatch');
    for(const a of row.outcomes){const b=expected.outcomes[a.id];check(a.id===b.id&&a.tick===b.tick&&a.reason===b.reason&&a.safe===b.safe&&a.laps===b.laps&&
      ['lifetime','x','y','heading','progressM','fitness'].every(k=>near(a[k],b[k]))&&a.outputs.every((v,j)=>near(v,b.outputs[j])),'Reference terminal mismatch');}}
}
for(const item of r.checkpoints)check(path.dirname(path.resolve(item.file))===path.resolve(dir)&&sha(item.file)===item.sha256,'Checkpoint mismatch');
const latest=path.join(dir,'checkpoint-'+(r.rows.length%2)+'.private.json'),cp=JSON.parse(fs.readFileSync(latest,'utf8'));
check(cp.state.generation===r.rows.at(-1).generation+1&&cp.completedGenerations===r.rows.length&&sha(latest)===progress.at(-1).checkpointSha256,'Latest checkpoint differs');
check(r.gpu.gpuCalls===r.gpu.calls&&r.gpu.gpuCalls>0&&r.gpu.cpuFallbacks===0&&r.gpu.device.name.includes('RTX 4060'),'CUDA counters mismatch');
check(r.learningSucceeded===r.rows.some(g=>g.maxSafeLaps>=2),'Invalid success flag');
const result={passed:true,reportSha256:sha(file),referenceSha256:sha(reference),runnerSha256:sha(__filename),generations:r.rows.length,
  outcomes:r.rows.reduce((s,x)=>s+x.outcomes.length,0),referenceOutcomes:80,gpuCalls:r.gpu.gpuCalls,cpuFallbacks:r.gpu.cpuFallbacks,
  bestSafeProgressM:Math.max(...r.rows.map(x=>x.bestSafeProgressM)),maxSafeLaps:Math.max(...r.rows.map(x=>x.maxSafeLaps)),
  nextGeneration:cp.state.generation,latestCheckpointSha256:sha(latest),
  boundary:'Readback of existing numerical outcomes, hashes and CUDA counters. No new physical replay or multi-circuit/model generalization.'};
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log('V3_CONTINUE_GPU_VERIFIED '+JSON.stringify({...result,verification:out,verificationSha256:sha(out)}));
