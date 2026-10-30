'use strict';
const path=require('node:path'),fs=require('node:fs/promises');
const root=path.resolve(__dirname,'..'),Model=require('./neural-statehead-cuda-model.cjs'),{Coordinator}=require('./neural-statehead-cuda-coordinator.cjs');
async function main(){
  const selected=Model.defaultChoice(),coordinator=new Coordinator({modelFile:selected.file,population:4,mutation:.16,speedMultiplier:30,workers:4});
  let timeout;
  const nextGeneration=new Promise((resolve,reject)=>{
    timeout=setTimeout(()=>reject(Error('Timed out waiting for the next live generation')),180000);
    coordinator.on('snapshot',snapshot=>{
      if(snapshot.generation>=2&&snapshot.experiment.phase==='running'&&snapshot.learningStats.updates>=1){clearTimeout(timeout);resolve(snapshot);}
    });
    coordinator.on('error',error=>{clearTimeout(timeout);reject(error);});
  });
  try{
    const first=await coordinator.start();
    if(first.experiment.phase!=='paused'||first.running!==false||first.population!==4)throw Error('Initial population did not start paused');
    await coordinator.pause(true);
    const next=await nextGeneration;
    const report={passed:next.running===true,appVersion:'5.6.0',modelSha256:selected.modelSha256,baseline:selected.expected,
      initial:{generation:first.generation,population:first.population,phase:first.experiment.phase,running:first.running},
      afterOneCompletedGeneration:{generation:next.generation,phase:next.experiment.phase,running:next.running,updates:next.learningStats.updates,episodes:next.learningStats.episodes,history:next.history},
      gpu:{backend:next.experiment.modelFamily,workerCount:coordinator.workerCount,actualGpuCalls:coordinator.workers.reduce((sum,w)=>sum+(w.cuda?.gpuCalls||0),0),cpuFallbacks:coordinator.workers.reduce((sum,w)=>sum+(w.cuda?.cpuFallbacks||0),0)},
      boundary:'One 4-agent native generation test only. It verifies pause-on-open and continuous resume after an explicit start, not two-lap convergence or a faster model.'};
    const out=path.join(root,'.impeccable/review/neural-sacl/statehead-continuous-generation-20261020-01');
    await fs.mkdir(out,{recursive:false});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
    console.log('STATEHEAD_CONTINUOUS_GENERATION '+JSON.stringify({passed:report.passed,initial:report.initial,nextGeneration:next.generation,running:next.running,updates:next.learningStats.updates,episodes:next.learningStats.episodes,gpu:report.gpu}));
    if(!report.passed)throw Error('New generation did not remain in running state');
  }finally{clearTimeout(timeout);await coordinator.close();Model.closeCuda();}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
