'use strict';
// Validate and restore the latest completed private continuation checkpoint.
// The alternating slot may later be reused by a subsequent generation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml'),dir=path.join(base,'progress7-natural-continue-cuda-20261027-100');
const saved=path.join(base,'progress7-trained-copy-20261027-93/SPERIMENTALE-solo-dev-v3-monza-gen80-worker0.malecns-save');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js');
const data=require('../outputs/data/connectome.json'),circuits=require('../outputs/data/circuits.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const meta=JSON.parse(fs.readFileSync(path.join(dir,'metadata.json'),'utf8'));
const rows=fs.readFileSync(path.join(dir,'progress.ndjson'),'utf8').trim().split('\n').map(JSON.parse),last=rows.at(-1);
const count=last.generation-meta.startGeneration+1,file=path.join(dir,'checkpoint-'+(count%2)+'.private.json'),bytes=fs.readFileSync(file);
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),last.checkpointSha256,'checkpoint changed during read');
const cp=JSON.parse(bytes);assert.equal(cp.format,'private-v3-progress7-continuation-checkpoint-v1');
assert.equal(cp.completedGenerations,count);assert.equal(cp.nextGeneration,last.generation+1);assert.equal(cp.state.generation,cp.nextGeneration);
assert.equal(cp.workerIndex,0);assert.equal(cp.state.population,40);assert.equal(sha(saved),cp.inputSaveSha256);assert.equal(sha(original),cp.originalSaveSha256);
assert.equal(sha(path.join(root,'work/train_v3_progress7_continue_cuda_100.cjs')),cp.runnerSha256);
for(const [f,h] of Object.entries(cp.sourceHashes))assert.equal(sha(path.join(root,f)),h,f);
const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:40,circuitId:'monza',circuits,seed:cp.state.seed});
P.validateTraining(cp.state,sim.graph,sim.circuits);P.restore(sim,structuredClone(cp.state));assert.equal(sim.running,false);assert.deepEqual(P.capture(sim),cp.state);
const result={passed:true,checkpoint:file,checkpointSha256:last.checkpointSha256,nextGeneration:cp.nextGeneration,completedGenerations:count,
  population:cp.state.population,optimizerUpdates:cp.state.optimizer.updates,inputSaveSha256:sha(saved),originalSaveSha256:sha(original),runnerSha256:sha(__filename),
  boundary:'Readback and restore of one private worker checkpoint; slot may later be overwritten. No full episode replay, five-worker export or learning claim.'};
const output=path.join(dir,'checkpoint-verification-gen'+cp.nextGeneration+'.json');fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('V3_CONTINUE_CHECKPOINT_VERIFIED '+JSON.stringify({...result,output,verificationSha256:sha(output)}));
