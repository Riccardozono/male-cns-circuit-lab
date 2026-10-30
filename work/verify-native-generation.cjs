'use strict';
const fs=require('node:fs'),path=require('node:path'),{Coordinator}=require('./neural-native-coordinator.cjs');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'.impeccable/review/neural-sacl/native-training'),coordinator=new Coordinator({modelFile:path.join(root,'.impeccable/review/neural-sacl/diversity-native-model/model.malecns-neural-diversity.json'),bootstrapFile:path.join(directory,'bootstrap.json'),population:4,mutation:.16,speedMultiplier:30,workers:4});
let failure=null;coordinator.on('error',e=>{failure=e;});const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(predicate,label,limit=180000){const start=Date.now();while(!predicate()){if(failure)throw failure;if(Date.now()-start>limit)throw Error('Timeout '+label);await wait(100);}}
async function main(){
  try{
    await coordinator.start();const initial=coordinator.snapshot(),genes=initial.experiment.genesHash;
    if(initial.cars.length!==4||initial.cars.some(c=>c.lifetime!==0||c.bestProgress!==0)||initial.running)throw Error('Four actual paused from-line agents required');
    const paused=JSON.stringify(initial.cars);await wait(300);if(paused!==JSON.stringify(coordinator.snapshot().cars))throw Error('Paused native agents advance');
    await coordinator.pause(true);await until(()=>coordinator.history.length>0&&coordinator.generation>=2,'one full native generation');await coordinator.pause(false);
    const final=coordinator.snapshot(),history=final.history[0];
    if(history.actualEpisodes!==4||history.maxLaps>2||final.learningStats.updates<1||final.learningStats.episodes!==4||genes===final.experiment.genesHash||final.experiment.mode!=='native-training-from-line')throw Error('Actual completed episodes and changed learned weights required');
    if(final.cars.length!==4||final.cars.some(c=>Math.min(c.outputs[1],c.outputs[2])!==0))throw Error('Exclusive real motor pedals required');
    const report={passed:true,initial:{generation:initial.generation,agents:initial.cars.length,genesHash:genes},completedGeneration:history,nextGeneration:{generation:final.generation,genesHash:final.experiment.genesHash},learningStats:final.learningStats,workers:coordinator.workerCount,
      boundary:'Four real Node 24.19.0 native workers; every agent starts physically at the line. One entire population actually terminates before selection/mutation. A ended generation is not two completed laps. No cached practice, forced commands, fake lap/position or reported training from an inference-only replay.'};
    fs.writeFileSync(path.join(directory,'generation-verification.json'),JSON.stringify(report,null,2));console.log('NATIVE_GENERATION_VERIFIED '+JSON.stringify(report));
  }finally{await coordinator.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
