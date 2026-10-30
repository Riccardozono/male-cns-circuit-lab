'use strict';
// Three complete 16-agent generations from the verified V3/Monza model,
// isolated from the visible paused training copy and all existing saves.
const fs=require('node:fs'),path=require('node:path'),{Coordinator}=require('./neural-chain-cuda-coordinator.cjs'),Model=require('./neural-chain-cuda-model.cjs'),Save=require('./neural-chain-cuda-save.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/neural-sacl/chain-cuda-current-three-generation');
fs.mkdirSync(out,{recursive:false});let coordinator,timer,error=null;const started=Date.now();
async function main(){
  const selected=Model.defaultChoice();coordinator=new Coordinator({modelFile:selected.file,population:16,mutation:.16,speedMultiplier:30,workers:4});
  coordinator.on('error',e=>{error=e;});
  await coordinator.start();
  const initial=await coordinator.exportState(),uniqueInitialWeights=new Set(initial.entries.map(e=>JSON.stringify(e.weights))).size;
  if(uniqueInitialWeights!==16||coordinator.running||coordinator.snapshot().cars.some(c=>c.lifetime!==0||c.bestProgress!==0))throw Error('Expected 16 distinct verified-model candidates, paused at the actual start line');
  timer=setInterval(()=>{
    const cars=coordinator.snapshot().cars;
    fs.writeFileSync(path.join(out,'live-progress.json'),JSON.stringify({generation:coordinator.generation,updates:coordinator.updates,completedEpisodes:coordinator.completedEpisodes,phase:coordinator.phase,running:coordinator.running,alive:cars.filter(c=>c.alive).length,maxLaps:Math.max(...cars.map(c=>c.laps)),maxProgress:Math.max(...cars.map(c=>c.bestProgress)),wallSeconds:(Date.now()-started)/1000,updatedAt:new Date().toISOString()},null,2));
  },2000);
  await coordinator.pause(true);
  const deadline=Date.now()+15*60*1000;
  while(coordinator.updates<3){
    if(error)throw error;
    if(Date.now()>deadline)throw Error('Three actual generations exceeded the 15 minute wall bound');
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  await coordinator.pause(false);
  const state=await coordinator.exportState(),cuda=coordinator.workers.map(w=>w.cuda),champion=state.archive.champion;
  if(state.updates!==3||state.completedEpisodes!==48||state.history.slice(-3).some(h=>h.actualEpisodes!==16)||cuda.some(x=>!x.gpuCalls||x.cpuFallbacks!==0))throw Error('Expected three complete 16-agent generations with actual CUDA inference');
  const report={format:'male-cns-chain-cuda-current-three-generation-v1',appVersion:'5.6.0',engineIdentity:Save.identity(),modelSha256:selected.modelSha256,sourceProofFile:selected.proofFile,
    configuration:{population:16,mutation:.16,speedMultiplier:30,workers:4,startingGeneration:1,updates:state.updates,completedEpisodes:state.completedEpisodes,uniqueInitialWeights},
    verifiedStartingChampion:selected.result,
    generations:state.history.slice(-3),
    finalCleanChampion:{fitness:champion.fitness,progress:champion.progress,laps:champion.laps,reason:champion.reason,lapTimes:champion.lapTimes,weights:champion.weights},
    championImproved:champion.fitness>selected.result.fitness&&champion.progress>=selected.result.bestProgress&&champion.laps>=selected.result.laps,
    cuda,wallSeconds:(Date.now()-started)/1000,
    boundary:'Three consecutive complete real generations from the independently verified one-lap warm start. Does not demonstrate two laps, cold-start learning, all models/tracks, or population-level convergence. The visible application and every prior save were untouched.'};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({report:path.join(out,'report.json'),generations:state.history.slice(-3),champion:report.finalCleanChampion,championImproved:report.championImproved,wallSeconds:report.wallSeconds},null,2));
}
main().catch(error=>{fs.writeFileSync(path.join(out,'failed.json'),JSON.stringify({passed:false,error:error.stack,wallSeconds:(Date.now()-started)/1000},null,2),{flag:'wx'});console.error(error.stack);process.exitCode=1;}).finally(async()=>{clearInterval(timer);await coordinator?.close();});
