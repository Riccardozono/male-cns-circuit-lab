'use strict';
// Independent readback of the produced private, shareable five-worker copy.
// Verifies its actual contents, not a lap or GUI run.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const dir=path.join(base,'progress7-trained-copy-20261027-93'),reportFile=path.join(dir,'report.json'),out=path.join(dir,'verification.json');
const source=path.join(base,'saved-v3-moving-pace-copy-20261027-85/SPERIMENTALE-solo-dev-v3-monza-progress7-copia.malecns-save');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const checkpoint=path.join(base,'progress7-natural-training-cuda-20261027-92/checkpoint-0.private.json');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js');
const data=require('../outputs/data/connectome.json'),circuits=require('../outputs/data/circuits.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function main(){
  assert.equal(fs.existsSync(out),false,'refuse to overwrite');
  const report=JSON.parse(fs.readFileSync(reportFile,'utf8')),save=path.join(dir,report.copyFile),cp=JSON.parse(fs.readFileSync(checkpoint,'utf8'));
  assert.equal(report.passed,true);assert.equal(sha(save),report.copySha256);assert.equal(sha(source),report.sourceCopySha256);
  assert.equal(sha(original),report.originalSaveSha256);assert.equal(sha(checkpoint),report.checkpointSha256);
  assert.equal(sha(path.join(root,'work/prepare_v3_natural_trained_copy_93.cjs')),report.runnerSha256);
  const old=(await P.decode(fs.readFileSync(source,'utf8'),'5.6.0')).payload,current=(await P.decode(fs.readFileSync(save,'utf8'),'5.6.0')).payload;
  assert.equal(current.modelId,'v3');assert.equal(current.circuitId,'monza');assert.equal(current.workers.length,5);assert.equal(current.globalChampion,null);
  assert.deepEqual(current.workers[0].state,cp.state);assert.deepEqual(current.workers.slice(1),old.workers.slice(1));
  assert.equal(current.workers[0].state.rewardRevision,'progress-7-moving-pace');assert.equal(current.workers[0].state.generation,80);
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:40,circuitId:'monza',circuits,seed:cp.state.seed});
  P.validatePayload(current,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,structuredClone(current.workers[0].state));assert.equal(sim.running,false);
  assert.deepEqual(P.capture(sim),current.workers[0].state);
  const archive=cp.state.hallOfFame.slice().sort((a,b)=>b.bestProgress-a.bestProgress),best=archive[0];
  assert.ok(best&&Math.abs(best.bestProgress-report.researchBestSafeProgressM)<1e-8,'safe frontier missing from archive');
  const matching=cp.state.genomes.map((g,i)=>JSON.stringify(g)===JSON.stringify(best.genome)?i:null).filter(i=>i!==null);
  assert.ok(matching.length>0,'frontier genome missing from starting population');
  const verification={passed:true,copyFile:save,copySha256:sha(save),exportReportSha256:sha(reportFile),checkpointSha256:sha(checkpoint),
    originalSaveSha256:sha(original),sourceCopySha256:sha(source),nextGeneration:cp.state.generation,unchangedOtherWorkerGenerations:current.workers.slice(1).map(w=>w.state.generation),
    frontierArchivedM:best.bestProgress,frontierGenomesInStartingPopulation:matching,runnerSha256:sha(__filename),
    boundary:'Checks decoded file, worker equality, safe-frontier genotype, and in-memory restore; the separate export report documents the paused five-worker desktop engine round-trip. No fresh GUI interaction, two-lap result or generalization is claimed.'};
  fs.writeFileSync(out,JSON.stringify(verification,null,2)+'\n',{flag:'wx'});
  console.log('V3_NATURAL_SHAREABLE_COPY_VERIFIED '+JSON.stringify({...verification,verification:out,verificationSha256:sha(out)}));
}
main().catch(e=>{console.error('V3_NATURAL_SHAREABLE_COPY_VERIFY_FAILED '+(e.stack||e));process.exitCode=1;});
