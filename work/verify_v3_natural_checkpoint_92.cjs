'use strict';
// Read back the most recently completed private research checkpoint. This is
// a schema/restore check, not a replay or a five-worker application save.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.impeccable/review/learning-ml/progress7-natural-training-cuda-20261027-92');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const copy=path.join(root,'.impeccable/review/learning-ml/saved-v3-moving-pace-copy-20261027-85/SPERIMENTALE-solo-dev-v3-monza-progress7-copia.malecns-save');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js');
const data=require('../outputs/data/connectome.json'),circuits=require('../outputs/data/circuits.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const meta=JSON.parse(fs.readFileSync(path.join(dir,'metadata.json'),'utf8'));
const lines=fs.readFileSync(path.join(dir,'progress.ndjson'),'utf8').trim().split('\n').map(x=>JSON.parse(x)),last=lines.at(-1);
const completed=last.generation-meta.startGeneration+1,file=path.join(dir,'checkpoint-'+(completed%2)+'.private.json'),bytes=fs.readFileSync(file);
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),last.checkpointSha256,'checkpoint changed during read');
const cp=JSON.parse(bytes);assert.equal(cp.format,'private-v3-progress7-natural-checkpoint-v1');
assert.equal(cp.completedGenerations,completed);assert.equal(cp.lastGeneration,last.generation);assert.equal(cp.nextGeneration,last.generation+1);
assert.equal(cp.state.generation,cp.nextGeneration);assert.equal(cp.workerIndex,0);assert.equal(cp.state.population,40);
assert.equal(sha(original),cp.originalSaveSha256);assert.equal(sha(copy),cp.experimentalSaveSha256);
for(const [name,hash] of Object.entries(cp.sourceHashes))assert.equal(sha(path.join(root,name)),hash,name);
assert.equal(cp.runnerSha256,sha(path.join(root,'work/train_v3_progress7_natural_cuda_92.cjs')));
const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{population:40,modelId:'v3',circuitId:'monza',circuits,seed:cp.state.seed});
P.validateTraining(cp.state,sim.graph,sim.circuits);P.restore(sim,structuredClone(cp.state));assert.equal(sim.running,false);
assert.deepEqual(P.capture(sim),cp.state,'restored training state differs');
const result={passed:true,checkpoint:file,checkpointSha256:last.checkpointSha256,nextGeneration:cp.nextGeneration,
  completedGenerations:completed,population:cp.state.population,optimizerUpdates:cp.state.optimizer.updates,
  originalSaveSha256:sha(original),experimentalSaveSha256:sha(copy),runnerSha256:sha(__filename),
  boundary:'Private single-worker state was validated and restored in memory in a separate process. This is not a full episode replay, a five-worker export, or proof of improved learning.'};
const output=path.join(dir,'checkpoint-verification-gen'+cp.nextGeneration+'.json');fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('V3_NATURAL_CHECKPOINT_VERIFIED '+JSON.stringify({...result,output,verificationSha256:sha(output)}));
