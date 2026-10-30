'use strict';
// Independent reconciliation of the completed worker records, not another
// physical replay and not proof of improved driving by itself.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),Save=require('./neural-chain-cuda-save.cjs'),Model=require('./neural-chain-cuda-model.cjs');
const out=path.resolve(process.argv[2]||'.impeccable/review/neural-sacl/chain-cuda-diverse-first'),read=name=>JSON.parse(fs.readFileSync(path.join(out,name),'utf8')),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const r=read('verification.json'),initial=read('initial.json'),selection=Model.defaultChoice();
assert(r.passed);assert.equal(r.engineIdentity,Save.identity());assert.equal(r.initialModelSha256,selection.modelSha256);assert.equal(initial.engineIdentity,r.engineIdentity);
assert.equal(r.completed.length,16);assert.equal(new Set(r.completed.map(x=>x.id)).size,16);assert.equal(new Set(initial.state.entries.map(x=>JSON.stringify(x.weights))).size,16);
for(const result of r.completed){assert.deepEqual(result.weights,initial.state.entries.find(x=>x.id===result.id).weights);assert(result.complete&&!result.censored&&!result.overlap);assert(result.controls>0);assert.equal(result.lapTimes.length,result.laps);assert(result.laps<=2);assert(Number.isFinite(result.fitness));}
const baseline=r.completed.find(x=>x.id===0);assert.equal(baseline.actionTraceSha256,selection.actionTraceSha256);assert.equal(baseline.progress,selection.result.bestProgress);assert.equal(baseline.fitness,selection.result.fitness);
const state=Save.parse(fs.readFileSync(path.join(out,'generation2.malecns-chain-cuda-dev'),'utf8')).state;
assert.equal(state.updates,1);assert.equal(state.generation,2);assert.equal(state.completedEpisodes,16);assert.deepEqual(state.history,r.history);assert.deepEqual(state.archive.champion,r.champion);
const history=state.history[0],fitness=r.completed.map(x=>x.fitness);assert.equal(history.best,Math.max(...fitness));assert(Math.abs(history.mean-fitness.reduce((a,b)=>a+b,0)/16)<1e-9);assert.equal(history.bestProgress,Math.max(...r.completed.map(x=>x.progress)));assert.equal(history.maxLaps,Math.max(...r.completed.map(x=>x.laps)));
assert.equal(r.improved,r.champion.progress>selection.result.bestProgress&&r.champion.fitness>selection.result.fitness);assert(r.cuda.length===4&&r.cuda.every(x=>x.gpuCalls>0&&x.cpuFallbacks===0));
const verified={passed:true,reportSha256:hash(fs.readFileSync(path.join(out,'verification.json'))),sourceSha256:hash(fs.readFileSync(__filename)),engineIdentity:r.engineIdentity,actualCompleteEpisodes:16,actualUpdates:1,uniqueInitialWeights:16,uniqueActionTraces:new Set(r.completed.map(x=>x.actionTraceSha256)).size,maxLaps:history.maxLaps,cleanChampionImproved:r.improved,boundary:'Record/source/save reconciliation, not an independent physical replay of all mutated candidates.'};
fs.writeFileSync(path.join(out,'independent-verification.json'),JSON.stringify(verified,null,2),{flag:'wx'});console.log(JSON.stringify(verified));
