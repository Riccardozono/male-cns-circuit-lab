'use strict';
// These are actually re-executed but repeated transitions, not new experience.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const base=path.resolve('.impeccable/review/neural-sacl'),old=path.join(base,'neuronal-ppo-normalized520-first'),next=path.join(base,'neuronal-ppo-normalized520-cuda-long'),hash=x=>crypto.createHash('sha256').update(x).digest('hex'),batches=[];
for(let k=1;k<=64;k++){
 const name='rollout-'+String(k).padStart(3,'0')+'.json',a=fs.readFileSync(path.join(old,name)),b=fs.readFileSync(path.join(next,name));assert.deepEqual(JSON.parse(b),JSON.parse(a),name);batches.push({name,cpuSha256:hash(a),cudaSha256:hash(b)});
}
const before=JSON.parse(fs.readFileSync(path.join(old,'training.json'))),after=JSON.parse(fs.readFileSync(path.join(next,'training.json')));
for(let k=0;k<64;k++)for(const field of ['update','actualTransitions','completedPracticeEpisodes','loss','epochKL','nodeTorchMaxMeanError','changedActorParameters','std'])assert.deepEqual(after.events[k][field],before.events[k][field],field+' @'+(k+1));
const result={passed:true,sourceSha256:hash(fs.readFileSync(__filename)),batchesCompared:64,repeatedPhysicalTransitions:16384,allObservationsActionsRewardsAndNextObservationsEqual:true,all64UpdateMetricsEqual:true,batches,boundary:'Actual CPU-to-CUDA repeat identity for the first64 updates, not16,384 novel informational samples or a trained native-policy convergence proof.'};
fs.writeFileSync(path.join(next,'prefix64-equivalence.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,batches:64,repeatedPhysicalTransitions:16384}));
