'use strict';
const fs=require('node:fs'),path=require('node:path'),{Worker}=require('node:worker_threads'),Head=require('./neural-json-head.cjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.impeccable/review/neural-sacl/context-memory-first');
fs.mkdirSync(dir,{recursive:true});if(fs.existsSync(path.join(dir,'progress.json')))throw Error('Preserve existing search');
const workers=Array.from({length:4},()=>new Worker(path.join(__dirname,'context-memory-trial-worker.cjs')));let sequence=0;
function trial(worker,parameters){return new Promise((resolve,reject)=>{const id=++sequence,receive=m=>{if(m.id!==id)return;worker.off('message',receive);m.error?reject(Error(m.error)):resolve(m.result);};worker.on('message',receive);worker.postMessage({id,parameters});});}
(async()=>{
  const baseline=await trial(workers[0],{steeringDecay:0,longitudinalDecay:0});
  if(baseline.result.bestProgress!==1990.41260481475||baseline.result.fitness!==-2331.9036376601734)throw Error('Zero memory does not preserve verified neural model');
  let champion={parameters:{steeringDecay:0,longitudinalDecay:0},episode:baseline},explorer=champion;const records=[];
  const candidates=[0,.25,.5,.75].flatMap(steeringDecay=>[0,.2,.5,.8,.9,.95].map(longitudinalDecay=>({steeringDecay,longitudinalDecay})));
  for(let i=0;i<candidates.length;i+=4){
    const batch=candidates.slice(i,i+4),results=await Promise.all(batch.map((p,j)=>trial(workers[j],p)));
    for(let j=0;j<results.length;j++){
      const row={parameters:batch[j],episode:results[j]};records.push(row);
      if(row.episode.gasBrakeOverlapSteps)throw Error('Motor commands overlap');
      if(!row.episode.censored){
        if(row.episode.result.fitness>champion.episode.result.fitness)champion=row;
        if((row.episode.result.laps>explorer.episode.result.laps)||row.episode.result.laps===explorer.episode.result.laps&&row.episode.result.bestProgress>explorer.episode.result.bestProgress)explorer=row;
      }
    }
    fs.writeFileSync(path.join(dir,'progress.json'),JSON.stringify({baseline,champion,explorer,records},null,2));
    console.log('CONTEXT_MEMORY_BATCH '+JSON.stringify({trials:records.length,champion,explorer}));
  }
  const repeat=await trial(workers[0],champion.parameters);if(JSON.stringify(repeat)!==JSON.stringify(champion.episode))throw Error('Independent memory trial differs');
  const report={passed:true,baseline,champion,explorer,records,independentChampionRepeat:repeat,sourceSha256:Head.sha(fs.readFileSync(__filename,'utf8')),
    memoryRuntimeSha256:Head.sha(fs.readFileSync(path.join(__dirname,'neural-context-memory-live.cjs'),'utf8')),
    boundary:'Two artificial motor-memory decays selected by actual full-episode reward. Same old learned coefficients and anatomical graph. Zero decay preserves old controller exactly. No route, clock, target speed or manual gas rule. Private incompatible decoder experiment.'};
  fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log('CONTEXT_MEMORY_DONE '+JSON.stringify({passed:true,champion,explorer}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await Promise.all(workers.map(w=>w.terminate()));});
