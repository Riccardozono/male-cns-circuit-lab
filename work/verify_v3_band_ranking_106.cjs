'use strict';
// Independent readback of the completed A/B: checks persisted terminal
// outcomes, recorded parent ranking, hashes and GPU counters. No new replay.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml'),dir=path.join(base,'progress7-band-ranking-ab-cuda-20261027-106');
const file=path.join(dir,'report.json'),out=path.join(dir,'verification.json');
const save=path.join(base,'progress7-continuation-copy-20261027-101/SPERIMENTALE-solo-dev-v3-monza-gen92-worker0.malecns-save');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const checkpoint=path.join(base,'progress7-natural-continue-cuda-20261027-100/checkpoint-0.private.json');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js');
const {makeRanker}=require('./experimental-progress-band-ranker-106.cjs'),data=require('../outputs/data/connectome.json'),circuits=require('../outputs/data/circuits.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
function samePhysical(a,b){return a.id===b.id&&a.tick===b.tick&&a.reason===b.reason&&a.safe===b.safe&&a.laps===b.laps&&
  ['lifetime','x','y','heading','progressM','fitness'].every(k=>near(a[k],b[k]))&&a.outputs.every((v,i)=>near(v,b.outputs[i]));}
async function main(){
  assert.equal(fs.existsSync(out),false,'refuse to overwrite');
  const r=JSON.parse(fs.readFileSync(file,'utf8')),payload=(await P.decode(fs.readFileSync(save,'utf8'),'5.6.0')).payload;
  const state=payload.workers[0].state,sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:40,circuitId:'monza',circuits,seed:state.seed});
  assert.equal(r.passed,true);assert.equal(sha(save),r.copySha256);assert.equal(sha(original),r.originalSaveSha256);
  assert.equal(sha(checkpoint),r.checkpointSha256);assert.equal(sha(path.join(root,'work/benchmark_v3_progress7_band_ranking_106.cjs')),r.runnerSha256);
  for(const [f,h] of Object.entries(r.sourceHashes.before))assert.equal(sha(path.join(root,f)),h);
  assert.deepEqual(r.sourceHashes.before,r.sourceHashes.after);
  assert.equal(r.settings.startGeneration,92);assert.equal(r.settings.population,40);assert.equal(r.settings.generationsPerArm,4);
  assert.equal(r.gpu.cpuFallbacks,0);assert.ok(r.gpu.controlGpuCalls>0&&r.gpu.bandGpuCalls>0&&r.gpu.device.name.includes('RTX 4060'));
  assert.equal(r.gpu.controlGpuCalls+r.gpu.bandGpuCalls,r.gpu.gpuCalls);
  const ppm=sim.track.pixelsPerMeter||1;let records=0,rankingChecks=0;
  for(const [arm,comparison] of [[r.control,'control'],[r.treatment,'band']]){
    assert.equal(arm.rows.length,4);
    for(let i=0;i<arm.rows.length;i++){
      const row=arm.rows[i],cars=row.outcomes.map(c=>({...c,bestProgress:c.progressM*ppm}));
      assert.equal(row.generation,92+i);assert.equal(cars.length,40);assert.equal(new Set(cars.map(c=>c.id)).size,40);
      for(const c of cars)assert.equal(F.isSafeLearningOutcome(c),c.safe);
      const safe=cars.filter(F.isSafeLearningOutcome),best=Math.max(...safe.map(c=>c.progressM));
      assert.equal(row.safeCount,safe.length);assert.equal(row.collisionCount,cars.filter(c=>c.reason==='urto').length);
      assert.ok(near(row.bestSafeProgressM,best));assert.ok(near(row.meanSafeProgressM,safe.reduce((a,c)=>a+c.progressM,0)/safe.length));
      assert.equal(row.safeAtLeast500M,safe.filter(c=>c.progressM>=500).length);assert.equal(row.maxSafeLaps,Math.max(...safe.map(c=>c.laps)));
      assert.equal(row.unsafePromotions,0);
      const compare=comparison==='control'?F.compareLearningAgents:makeRanker(safe,ppm,F,5);
      const expected=safe.slice().sort(compare).slice(0,4);
      for(let j=0;j<expected.length;j++){
        assert.equal(row.selected.ranked[j].id,expected[j].id,'recorded parent ranking');
        assert.ok(near(row.selected.ranked[j].progressM,expected[j].progressM));
        assert.ok(near(row.selected.ranked[j].fitness,expected[j].fitness));
      }
      records+=cars.length;rankingChecks+=expected.length;
    }
  }
  assert.ok(r.control.rows[0].outcomes.every((a,i)=>samePhysical(a,r.treatment.rows[0].outcomes[i])));
  for(let i=0;i<4;i++){
    const p=r.pairs[i],c=r.control.rows[i],t=r.treatment.rows[i];
    assert.equal(p.generation,c.generation);assert.equal(p.generation,t.generation);
    assert.ok(near(p.deltaM,t.bestSafeProgressM-c.bestSafeProgressM));
    assert.equal(p.controlCollisions,c.collisionCount);assert.equal(p.bandCollisions,t.collisionCount);
    assert.equal(p.controlLaps,c.maxSafeLaps);assert.equal(p.bandLaps,t.maxSafeLaps);
  }
  const progress=fs.readFileSync(path.join(dir,'progress.ndjson'),'utf8').trim().split('\n').map(JSON.parse);
  for(const name of ['control','band']){
    const last=progress.filter(x=>x.arm===name).at(-1),cp=path.join(dir,name+'-checkpoint-0.private.json');
    assert.equal(sha(cp),last.checkpointSha256);const saved=JSON.parse(fs.readFileSync(cp,'utf8'));
    assert.equal(saved.arm,name);assert.equal(saved.completedGenerations,4);assert.equal(saved.nextGeneration,96);
    P.validateTraining(saved.state,sim.graph,sim.circuits);
  }
  const result={passed:true,reportSha256:sha(file),copySha256:sha(save),originalSaveSha256:sha(original),checkpointSha256:sha(checkpoint),
    runnerSha256:sha(__filename),outcomes:records,rankingEntriesChecked:rankingChecks,firstPairedGenerationMatched:true,
    generationsPerArm:4,controlGpuCalls:r.gpu.controlGpuCalls,bandGpuCalls:r.gpu.bandGpuCalls,cpuFallbacks:r.gpu.cpuFallbacks,pairs:r.pairs,
    boundary:'Readback of prior numerical outcomes, rankings, checkpoints, hashes and CUDA counters; no second physical replay or generalization claim.'};
  fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log('BAND_RANK_READBACK '+JSON.stringify({...result,verification:out,verificationSha256:sha(out)}));
}
main().catch(e=>{console.error('BAND_RANK_READBACK_FAILED '+(e.stack||e));process.exitCode=1;});
