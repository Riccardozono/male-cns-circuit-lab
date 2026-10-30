'use strict';
// Independent readback of the paired combined-motor-focus CUDA benchmark.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml/progress7-combined-frontier-ab-cuda-20261027-110');
const reportFile=path.join(base,'report.json'),out=path.join(base,'verification.json');
const save=path.join(root,'.impeccable/review/learning-ml/progress7-continuation-copy-20261027-101/SPERIMENTALE-solo-dev-v3-monza-gen92-worker0.malecns-save');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const checkpoint='C:/Users/utente/Documents/Codex/2026-09-16/craimi-un-app-locale-tipo-questo/.impeccable/review/learning-ml/progress7-natural-continue-cuda-20261027-100/checkpoint-0.private.json';
const reference='C:/Users/utente/Documents/Codex/2026-09-16/craimi-un-app-locale-tipo-questo/.impeccable/review/learning-ml/progress7-natural-continue-cuda-20261027-100/report.json';
const runner=path.join(root,'work/benchmark_v3_progress7_combined_frontier_ab_109.cjs');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/dense-neural.js','work/cuda-exact-v3-pass.cjs'];
const currentSources=Object.fromEntries(sourceFiles.map(f=>[f,sha(path.join(root,f))]));
assert.equal(fs.existsSync(out),false,'refuse to overwrite');
const r=JSON.parse(fs.readFileSync(reportFile,'utf8'));
assert.equal(r.passed,true);assert.equal(r.approvedForApp,false);assert.equal(r.settings.model,'V3');assert.equal(r.settings.circuit,'Monza');
assert.equal(sha(original),r.originalSaveSha256);assert.equal(sha(save),r.copySha256);assert.equal(sha(checkpoint),r.checkpointSha256);assert.equal(sha(reference),r.referenceSha256);
assert.deepEqual(currentSources,r.sourceHashes.before);assert.deepEqual(currentSources,r.sourceHashes.after);
assert.equal(sha(runner),r.runnerSha256);assert.equal(r.settings.generationsPerArm,4);assert.equal(r.settings.population,40);assert.equal(r.settings.seed,7717);
assert.equal(r.firstPairedGenerationMatches,true);assert.equal(r.control.rows.length,4);assert.equal(r.treatment.rows.length,4);assert.equal(r.pairs.length,4);
for(let i=0;i<4;i++){
  const a=r.control.rows[i],b=r.treatment.rows[i],pair=r.pairs[i];assert.equal(a.generation,92+i);assert.equal(b.generation,92+i);
  assert.equal(a.outcomes.length,40);assert.equal(b.outcomes.length,40);
  assert.equal(a.safeCount,a.outcomes.filter(x=>x.safe).length);assert.equal(b.safeCount,b.outcomes.filter(x=>x.safe).length);
  assert.equal(a.collisionCount,a.outcomes.filter(x=>x.reason==='urto').length);assert.equal(b.collisionCount,b.outcomes.filter(x=>x.reason==='urto').length);
  assert.equal(a.maxSafeLaps,Math.max(...a.outcomes.filter(x=>x.safe).map(x=>x.laps)));
  assert.equal(b.maxSafeLaps,Math.max(...b.outcomes.filter(x=>x.safe).map(x=>x.laps)));
  assert.equal(a.mutation.focus,'longitudinal');assert.equal(b.mutation.focus,'combined');
  assert.equal(a.mutation.stagnantFrontier,true);assert.equal(b.mutation.stagnantFrontier,true);
  assert.equal(a.mutation.safeLeaderStopped,true);assert.equal(b.mutation.safeLeaderStopped,true);
  assert.equal(pair.controlBestM,a.bestSafeProgressM);assert.equal(pair.treatmentBestM,b.bestSafeProgressM);
  assert.equal(pair.deltaM,b.bestSafeProgressM-a.bestSafeProgressM);
  assert.equal(pair.controlLaps,a.maxSafeLaps);assert.equal(pair.treatmentLaps,b.maxSafeLaps);
  for(let j=0;j<40;j++)if(i===0){
    const x=a.outcomes[j],y=b.outcomes[j];assert.equal(x.id,j);assert.equal(y.id,j);
    for(const k of ['tick','reason','safe','laps','progressM','fitness','x','y','heading','lifetime'])assert.equal(x[k],y[k],'paired generation 92 '+k+' differs at id '+j);
    assert.deepEqual(x.outputs,y.outputs,'paired generation 92 actions differ at id '+j);
  }
}
const gpu=r.gpu;assert.ok(gpu.calls>0&&gpu.cpuFallbacks===0&&gpu.device.name.includes('RTX 4060'));
const result={passed:true,reportSha256:sha(reportFile),copySha256:sha(save),originalSaveSha256:sha(original),checkpointSha256:sha(checkpoint),
  runnerSha256:sha(runner),outcomes:320,generationsPerArm:4,firstPairedGenerationMatched:true,sourceHashesUnchanged:true,
  controlFocus:r.control.rows.map(x=>x.mutation.focus),treatmentFocus:r.treatment.rows.map(x=>x.mutation.focus),
  cuda:{calls:gpu.calls,controlCalls:gpu.controlGpuCalls,treatmentCalls:gpu.bandGpuCalls,cpuFallbacks:gpu.cpuFallbacks,device:gpu.device},pairs:r.pairs,
  learningSucceeded:r.learningSucceeded,boundary:'Integrity and paired physical outcome readback only. No second replay, multi-seed confirmation, app integration, or two-lap claim.'};
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('COMBINED_FRONTIER_READBACK '+JSON.stringify({...result,verificationSha256:sha(out),verification:out}));
