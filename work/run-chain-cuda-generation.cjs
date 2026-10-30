'use strict';
// Separate real diversity experiment, not the UI fixture's zero-mutation
// generation. All sixteen physical episodes start at the line.
const fs=require('node:fs'),path=require('node:path'),{Coordinator}=require('./neural-chain-cuda-coordinator.cjs'),Model=require('./neural-chain-cuda-model.cjs'),Save=require('./neural-chain-cuda-save.cjs');
const out=path.resolve(process.argv[2]||'.impeccable/review/neural-sacl/chain-cuda-diverse-first');fs.mkdirSync(out,{recursive:false});
let c,timer,settled=false;const start=Date.now();
async function main(){
 const selected=Model.defaultChoice();c=new Coordinator({modelFile:selected.file,population:16,mutation:.16,speedMultiplier:30,workers:4});
 const fail=error=>{if(!settled){settled=true;fs.writeFileSync(path.join(out,'failed.json'),JSON.stringify({passed:false,error:error.stack,wallSeconds:(Date.now()-start)/1000},null,2));process.exitCode=1;}};
 let error=null;c.on('error',e=>{error=e;});await c.start();
 const initial=await c.exportState(),uniqueWeights=new Set(initial.entries.map(e=>JSON.stringify(e.weights))).size;
 if(uniqueWeights!==16||c.running||c.snapshot().cars.some(car=>car.lifetime!==0))throw Error('Sixteen distinct genuine from-line paused candidates required');
 fs.writeFileSync(path.join(out,'initial.json'),JSON.stringify({modelSha256:selected.modelSha256,engineIdentity:Save.identity(),uniqueWeights,state:initial},null,2),{flag:'wx'});
 timer=setInterval(()=>fs.writeFileSync(path.join(out,'live-progress.json'),JSON.stringify({running:c.running,phase:c.phase,generation:c.generation,updates:c.updates,episodes:c.completedEpisodes,cars:c.snapshot().cars.map(x=>({id:x.id,lifetime:x.lifetime,progress:x.bestProgress,laps:x.laps,alive:x.alive})),cuda:c.workers.map(w=>w.cuda),wallSeconds:(Date.now()-start)/1000,timestamp:new Date().toISOString()},null,2)),2000);
 await c.pause(true);
 while(c.updates<1){if(error)throw error;if(Date.now()-start>900000)throw Error('Actual diverse generation exceeded the declared wall bound');await new Promise(r=>setTimeout(r,100));}
 await c.pause(false);const state=await c.exportState(),completed=structuredClone(c.lastCompletedResults),cuda=c.workers.map(w=>w.cuda);
 if(completed.length!==16||completed.some(r=>!r.complete||r.censored||r.overlap)||state.updates!==1||state.completedEpisodes!==16||cuda.some(r=>!r.gpuCalls||r.cpuFallbacks!==0))throw Error('Complete real CUDA generation required');
 const baseline=completed.find(r=>r.id===0);if(baseline.actionTraceSha256!==selected.actionTraceSha256)throw Error('Protected baseline trace changed');
 const modelText=fs.readFileSync(c.modelFile,'utf8'),encoded=Save.encode(modelText,state);if(JSON.stringify(Save.parse(encoded).state)!==JSON.stringify(state))throw Error('Roundtrip changed the real training state');
 fs.writeFileSync(path.join(out,'generation2.malecns-chain-cuda-dev'),encoded,{flag:'wx'});
 const report={passed:true,experiment:'actual-sixteen-distinct-neuronal-candidates',uniqueInitialWeights:uniqueWeights,initialModelSha256:selected.modelSha256,engineIdentity:Save.identity(),wallSeconds:(Date.now()-start)/1000,history:state.history,completed,cuda,champion:state.archive.champion,improved:state.archive.champion.progress>selected.result.bestProgress&&state.archive.champion.fitness>selected.result.fitness,boundary:'One actual generation with sixteen distinct gene pairs, not proof of two-lap convergence or all-model/track performance.'};
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2),{flag:'wx'});settled=true;console.log(JSON.stringify({passed:true,uniqueWeights,episodes:16,improved:report.improved,champion:report.champion,wallSeconds:report.wallSeconds}));
}
main().catch(error=>{fs.writeFileSync(path.join(out,'failed.json'),JSON.stringify({passed:false,error:error.stack},null,2));console.error(error.stack);process.exitCode=1;}).finally(async()=>{clearInterval(timer);await c?.close();});
