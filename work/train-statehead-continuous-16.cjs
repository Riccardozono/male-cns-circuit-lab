'use strict';
const path=require('node:path'),fs=require('node:fs/promises');
const root=path.resolve(__dirname,'..'),Model=require('./neural-statehead-cuda-model.cjs'),{Coordinator}=require('./neural-statehead-cuda-coordinator.cjs');
async function main(){
  const selected=Model.defaultChoice(),coordinator=new Coordinator({modelFile:selected.file,population:16,mutation:.16,speedMultiplier:30,workers:4});
  let timeout,latest,lastLoggedGeneration=0;
  const fourGenerations=new Promise((resolve,reject)=>{
    timeout=setTimeout(()=>reject(Error(`Timed out waiting for four complete 16-agent generations; latest=${JSON.stringify(latest&&{generation:latest.generation,running:latest.running,phase:latest.experiment?.phase,history:latest.history?.slice(-4).map(g=>({generation:g.generation,bestProgress:g.bestProgress,meanProgress:g.meanProgress,maxLaps:g.maxLaps,bestLapTime:g.bestLapTime})),updates:latest.learningStats?.updates,episodes:latest.learningStats?.episodes})}`)),900000);
    coordinator.on('snapshot',snapshot=>{
      latest=snapshot;
      if(snapshot.generation!==lastLoggedGeneration){lastLoggedGeneration=snapshot.generation;console.log('GENERATION_PROGRESS '+JSON.stringify({generation:snapshot.generation,running:snapshot.running,phase:snapshot.experiment?.phase,history:snapshot.history?.slice(-2).map(g=>({generation:g.generation,bestProgress:g.bestProgress,meanProgress:g.meanProgress,maxLaps:g.maxLaps,bestLapTime:g.bestLapTime})),updates:snapshot.learningStats?.updates,episodes:snapshot.learningStats?.episodes}));}
      if(snapshot.generation>=5&&snapshot.experiment.phase==='running'&&snapshot.learningStats.updates>=4){clearTimeout(timeout);resolve(snapshot);}
    });
    coordinator.on('error',error=>{clearTimeout(timeout);reject(error);});
  });
  try{
    const initial=await coordinator.start();
    if(initial.experiment.phase!=='paused'||initial.running!==false||initial.population!==16)throw Error('Initial 16-agent population did not start paused');
    await coordinator.pause(true);
    const final=await fourGenerations,history=final.history.slice(-4);
    const report={passed:final.running===true&&history.length===4&&history.every((entry,index)=>entry.generation===index+1&&entry.actualEpisodes===16),appVersion:'5.6.0',modelSha256:selected.modelSha256,
      settings:{circuitId:'monza',population:16,mutation:.16,speedMultiplier:30,workers:4,seed:151216,rewardRevision:history[0]?.rewardRevision},
      baseline:selected.expected,initial:{generation:initial.generation,population:initial.population,phase:initial.experiment.phase,running:initial.running},
      generations:history,summary:{bestObservedProgress:Math.max(selected.expected.bestProgress,...history.map(g=>g.bestProgress)),bestLaps:Math.max(selected.expected.laps,...history.map(g=>g.maxLaps)),bestLapTime:Math.min(selected.expected.lapTimes[0],...history.map(g=>g.bestLapTime??Infinity)),nextGenerationRunning:final.running,updates:final.learningStats.updates,episodes:final.learningStats.episodes},
      gpu:{backend:final.experiment.modelFamily,workerCount:coordinator.workerCount,actualGpuCalls:coordinator.workers.reduce((sum,w)=>sum+(w.cuda?.gpuCalls||0),0),cpuFallbacks:coordinator.workers.reduce((sum,w)=>sum+(w.cuda?.cpuFallbacks||0),0)},
      boundary:'One controlled Monza run with one seed and four 16-agent generations. It measures real model outputs, but does not establish generalization, two-lap convergence, or improvement on other sessions.'};
    const out=path.join(root,'.impeccable/review/neural-sacl/statehead-continuous-16-20261020-01');
    await fs.mkdir(out,{recursive:false});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
    console.log('STATEHEAD_CONTINUOUS_16 '+JSON.stringify({passed:report.passed,baselineProgress:report.baseline.bestProgress,generations:history.map(g=>({generation:g.generation,bestProgress:g.bestProgress,meanProgress:g.meanProgress,maxLaps:g.maxLaps,bestLapTime:g.bestLapTime})),summary:report.summary,gpu:report.gpu}));
    if(!report.passed)throw Error('Incomplete controlled generation run');
  }finally{clearTimeout(timeout);await coordinator.close();Model.closeCuda();}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
