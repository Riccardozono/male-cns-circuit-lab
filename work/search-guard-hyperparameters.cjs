'use strict';
const fs=require('node:fs'),path=require('node:path'),G=require('./guard-memory-runtime.cjs'),H=require('./guard-memory-checkpoint.cjs'),{TrialPool}=require('./neural-trial-pool.cjs'),{F,C}=G;
const source=path.join(G.root,'.impeccable/review/neural-local-rbf/coverage-guard4-next/checkpoint.json'),{saved,sim,original}=H.load(source),sourceHash=C.hashFile(source),output=path.join(G.root,'.impeccable/review/neural-local-rbf/hyperparameters-guard4');
if(fs.existsSync(path.join(output,'report.json')))throw Error('Existing hyperparameter experiment');fs.mkdirSync(output,{recursive:true});let pool;
async function main(){
  const baseline=G.replay(sim,saved.baseGenome,saved.centres,saved.championWeights,{decay:saved.decay}).result,candidates=[],p=sim.graph.learning;
  for(const baseContextGain of [0,.5,1])for(const decay of [.9,.95,.98,.99])for(const scale of [.5,1,2]){
    const genome=F.cloneGenome(saved.baseGenome);for(let k=p.contextWeightOffset;k<p.centreOffset;k++)genome.policyWeights[k]*=baseContextGain;
    const weights=saved.championWeights.map(v=>Math.max(-8,Math.min(8,v*scale)));candidates.push({baseContextGain,decay,scale,genome,weights});
  }
  pool=new TrialPool(2);const started=performance.now();let index=0,completed=0;
  await Promise.all(pool.slots.map(async slot=>{while(index<candidates.length){const c=candidates[index++];c.episode=await pool.one(slot,{genome:c.genome,centres:saved.centres,weights:c.weights,decay:c.decay,state:null,startTicks:0});completed++;
    console.log('GUARD_HYPERPARAMETER '+JSON.stringify({completed,baseContextGain:c.baseContextGain,decay:c.decay,scale:c.scale,result:c.episode.result,wallSeconds:(performance.now()-started)/1000}));
    fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify({baseline,completed,total:candidates.length,bestProgress:Math.max(...candidates.filter(x=>x.episode).map(x=>x.episode.result.bestProgress))},null,2));
  }}));
  const completedCases=candidates.filter(c=>c.episode.result.complete),champion=completedCases.toSorted((a,b)=>b.episode.result.fitness-a.episode.result.fitness)[0],explorer=completedCases.toSorted((a,b)=>b.episode.result.laps-a.episode.result.laps||b.episode.result.bestProgress-a.episode.result.bestProgress)[0];
  const policy=c=>({genome:c.genome,centres:saved.centres,weights:c.weights,decay:c.decay,baseContextGain:c.baseContextGain,scale:c.scale,result:c.episode.result});
  for(const c of [champion,explorer]){const replay=G.replay(sim,c.genome,saved.centres,c.weights,{decay:c.decay}).result;if(JSON.stringify(replay)!==JSON.stringify(c.episode.result))throw Error('Hyperparameter full replay mismatch');}
  const report={passed:true,sourceUnchanged:C.hashFile(source)===sourceHash,originalUnchanged:C.hashFile(original)===saved.legacySourceSha256,objectiveRevision:F.Rewards.REVISION,baseline,champion:policy(champion),explorer:policy(explorer),trials:candidates.length,cases:candidates.map(c=>({baseContextGain:c.baseContextGain,decay:c.decay,scale:c.scale,result:c.episode.result})),wallSeconds:(performance.now()-started)/1000,boundary:'All candidates are actual complete-start-line evaluations; no cached prefix assumed after base-policy or memory changes. No path/teacher input, unchanged anatomy/physics, explicit experimental objective.'};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('GUARD_HYPERPARAMETERS_DONE '+JSON.stringify({...report,champion:{...policy(champion),genome:undefined,centres:undefined,weights:undefined},explorer:{...policy(explorer),genome:undefined,centres:undefined,weights:undefined},cases:undefined}));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await pool?.close();});
