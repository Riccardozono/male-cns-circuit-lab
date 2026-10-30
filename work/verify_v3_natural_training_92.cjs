'use strict';
// Independent readback of natural training report, observed terminal outcomes,
// CUDA counters, alternating final checkpoints and source identities.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const dir=path.join(base,'progress7-natural-training-cuda-20261027-92'),file=path.join(dir,'report.json'),out=path.join(dir,'verification.json');
const reference=path.join(base,'saved-v3-progress7-practice-fixes-app-cpu-20261027-90/report.json');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const copy=path.join(base,'saved-v3-moving-pace-copy-20261027-85/SPERIMENTALE-solo-dev-v3-monza-progress7-copia.malecns-save');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),check=(x,m)=>{if(!x)throw Error(m);};
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
check(!fs.existsSync(out),'Refusing to overwrite verification');
const r=JSON.parse(fs.readFileSync(file,'utf8')),prior=JSON.parse(fs.readFileSync(reference,'utf8'));
check(r.passed&&!r.diagnosticGuardExceeded&&r.rows.length===16&&r.generationsCompleted===16&&prior.passed,'Incomplete run');
check(sha(original)===r.originalSaveSha256&&sha(copy)===r.experimentalSaveSha256&&sha(reference)===r.referenceSha256,'Input identity mismatch');
check(sha(path.join(root,'work/train_v3_progress7_natural_cuda_92.cjs'))===r.runnerSha256,'Training runner changed');
for(const [f,h] of Object.entries(r.sourceHashes.before))check(h===r.sourceHashes.after[f]&&sha(path.join(root,f))===h,'Source changed: '+f);
const progress=fs.readFileSync(path.join(dir,'progress.ndjson'),'utf8').trim().split('\n').map(JSON.parse);
check(progress.length===r.rows.length,'Progress log incomplete');
for(let i=0;i<r.rows.length;i++){
  const row=r.rows[i],safe=row.outcomes.filter(a=>a.safe),line=progress[i];
  check(row.generation===64+i&&line.generation===row.generation&&row.outcomes.length===40&&new Set(row.outcomes.map(a=>a.id)).size===40,'Generation census mismatch');
  check(safe.length===row.safeCount&&safe.length>0&&Math.max(...safe.map(a=>a.laps))===row.maxSafeLaps&&
    near(Math.max(...safe.map(a=>a.progressM)),row.bestSafeProgressM)&&near(safe.reduce((s,a)=>s+a.progressM,0)/safe.length,row.meanSafeProgressM)&&
    safe.filter(a=>a.progressM>=500).length===row.safeAtLeast500M&&row.outcomes.filter(a=>a.reason==='urto').length===row.collisionCount,'Outcome metric mismatch');
  check(row.unsafePromotions===0&&near(row.bestSafeProgressM,line.bestSafeProgressM)&&row.ticks===line.ticks&&row.optimizerUpdates===line.optimizerUpdates,'Progress or practice mismatch');
  if(i<6){const expected=prior.rows[i];check(row.generation===expected.generation&&row.ticks===expected.ticks,'CPU reference shape mismatch');
    for(const a of row.outcomes){const b=expected.outcomes[a.id];check(a.id===b.id&&a.tick===b.tick&&a.reason===b.reason&&a.safe===b.safe&&a.laps===b.laps&&
      ['lifetime','x','y','heading','progressM','fitness'].every(k=>near(a[k],b[k]))&&a.outputs.every((v,j)=>near(v,b.outputs[j])),'CPU reference terminal mismatch');}}
}
for(const cp of r.checkpoints)check(path.dirname(path.resolve(cp.file))===path.resolve(dir)&&sha(cp.file)===cp.sha256,'Final checkpoint mismatch');
const last=r.rows.at(-1),latestFile=path.join(dir,'checkpoint-'+(r.rows.length%2)+'.private.json'),cp=JSON.parse(fs.readFileSync(latestFile,'utf8'));
check(cp.state.generation===last.generation+1&&cp.completedGenerations===r.rows.length&&sha(latestFile)===progress.at(-1).checkpointSha256,'Latest saved generation mismatch');
check(r.gpu.gpuCalls===r.gpu.calls&&r.gpu.gpuCalls>0&&r.gpu.cpuFallbacks===0&&r.gpu.device.name.includes('RTX 4060'),'CUDA counters mismatch');
check(r.learningSucceeded===r.rows.some(g=>g.maxSafeLaps>=2),'Invalid success flag');
const result={passed:true,reportSha256:sha(file),referenceSha256:sha(reference),runnerSha256:sha(__filename),generations:r.rows.length,
  recordedOutcomes:r.rows.reduce((s,x)=>s+x.outcomes.length,0),firstSixReferenceOutcomes:240,gpuCalls:r.gpu.gpuCalls,cpuFallbacks:r.gpu.cpuFallbacks,
  bestSafeProgressM:Math.max(...r.rows.map(g=>g.bestSafeProgressM)),maxSafeLaps:Math.max(...r.rows.map(g=>g.maxSafeLaps)),
  nextGeneration:cp.state.generation,latestCheckpointSha256:sha(latestFile),
  boundary:'Independent report, numerical outcome and identity readback, not a new physical simulation, GUI test or generalization claim.'};
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log('V3_NATURAL_GPU_VERIFIED '+JSON.stringify({...result,verification:out,verificationSha256:sha(out)}));
