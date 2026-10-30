'use strict';
// Isolated CUDA A/B. Equalizes steering-vs-longitudinal search amplitude in
// generated state-head candidates only; physics, sensor inputs, neural policy,
// reward, saved model and the Windows app remain unchanged.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs'),{Coordinator}=require('./neural-statehead-cuda-coordinator.cjs');
const root=path.resolve(__dirname,'..');
function option(name,fallback){const x=process.argv.find(a=>a.startsWith(`--${name}=`));return x?x.slice(name.length+3):fallback;}
const population=Number(option('population','16')),mutation=Number(option('mutation','0.16')),speed=Number(option('speed','30'));
const seed=Number(option('seed','151216')),generations=Number(option('generations','3')),wallMinutes=Number(option('wall-minutes','8'));
const gain=Number(option('steering-gain','6.6666666667')),out=path.resolve(option('output',''));
const clamp=x=>Math.max(-8,Math.min(8,x));
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(!Number.isInteger(population)||population<4||population>100||!Number.isInteger(generations)||generations<1||generations>10||!Number.isFinite(mutation)||mutation<0||mutation>.35||!Number.isFinite(gain)||gain<1||gain>8||!Number.isInteger(seed)||seed<0||!Number.isInteger(wallMinutes)||wallMinutes<2||wallMinutes>30||!out)throw Error('Invalid isolated benchmark settings');
  if(await fs.stat(out).then(()=>true,()=>false))throw Error('Output already exists; refusing overwrite');
  const selected=Model.defaultChoice();
  const coordinator=new Coordinator({modelFile:selected.file,population,mutation,speedMultiplier:speed,workers:4});
  const originalAsk=coordinator.archive.ask.bind(coordinator.archive),designs=[];
  coordinator.archive.ask=function(random,settings){
    const sampled=originalAsk(random,settings).map(candidate=>({...candidate,weights:candidate.weights.slice()}));
    const record={generation:coordinator.generation,candidates:[]};
    for(const candidate of sampled){
      const before=candidate.parentWeights?.slice()||candidate.weights.slice();
      if(candidate.parentWeights&&['steering','joint'].includes(candidate.block)){
        for(let j=0;j<candidate.weights.length;j+=2)candidate.weights[j]=clamp(before[j]+(candidate.weights[j]-before[j])*gain);
      }
      const delta=candidate.weights.map((v,j)=>v-before[j]);
      record.candidates.push({kind:candidate.kind||'protected-champion',block:candidate.block||null,sign:candidate.sign??null,steeringDeltaRms:Math.sqrt(delta.filter((_,j)=>j%2===0).reduce((s,v)=>s+v*v,0)/9),longitudinalDeltaRms:Math.sqrt(delta.filter((_,j)=>j%2===1).reduce((s,v)=>s+v*v,0)/9)});
    }
    designs.push(record);return sampled;
  };
  coordinator.random=require('../outputs/simulation.js').rng(seed);
  const records=[],historyOffset=0,started=Date.now();let resolving=false,interval,timer;
  const summary=()=>{const s=coordinator.snapshot();return {phase:s.experiment.phase,generation:s.generation,updates:s.learningStats.updates,episodes:s.learningStats.episodes,archiveCells:s.experiment.archiveCells,gpu:{workers:coordinator.workers.length,actualGpuCalls:coordinator.workers.reduce((n,w)=>n+(w.cuda?.gpuCalls||0),0),cpuFallbacks:coordinator.workers.reduce((n,w)=>n+(w.cuda?.cpuFallbacks||0),0)}};};
  const done=new Promise((resolve,reject)=>{
    coordinator.on('error',e=>{if(!resolving){resolving=true;reject(e);}});
    coordinator.on('snapshot',snapshot=>{
      if(resolving||!snapshot.history?.length||snapshot.history.length<=historyOffset+records.length||snapshot.experiment.phase!=='paused'||snapshot.running)return;
      try{
        const history=structuredClone(coordinator.history.at(-1)),results=coordinator.lastCompletedResults;
        if(!results||results.length!==population)throw Error('Expected full natural generation results');
        const sorted=results.slice().sort((a,b)=>b.laps-a.laps||b.progress-a.progress||b.fitness-a.fitness);
        records.push({history,progressLeader:{id:sorted[0].id,progress:sorted[0].progress,laps:sorted[0].laps,fitness:sorted[0].fitness,reason:sorted[0].reason,lapTimes:sorted[0].lapTimes},topFour:sorted.slice(0,4).map(r=>({id:r.id,progress:r.progress,laps:r.laps,fitness:r.fitness,reason:r.reason,lapTimes:r.lapTimes})),design:designs.find(d=>d.generation===history.generation+1)||null});
        console.log('STEERING_BALANCE_GENERATION '+JSON.stringify({generation:history.generation,bestProgress:history.bestProgress,meanProgress:history.meanProgress,maxLaps:history.maxLaps,progressLeader:sorted[0].progress,progressLeaderLaps:sorted[0].laps,reason:sorted[0].reason}));
      }catch(e){resolving=true;reject(e);return;}
      if(records.length>=generations){resolving=true;resolve('completed');}
      else setImmediate(()=>coordinator.pause(true).catch(e=>{if(!resolving){resolving=true;reject(e);}}));
    });
  });
  const wallGuard=new Promise(resolve=>{timer=setTimeout(()=>{if(!resolving){resolving=true;console.log('STEERING_BALANCE_WALL_GUARD '+JSON.stringify(summary()));resolve('wall-guard-censored');}},wallMinutes*60*1000);});
  interval=setInterval(()=>console.log('STEERING_BALANCE_PROGRESS '+JSON.stringify(summary())),10000);
  let reason='error',error=null;
  try{await coordinator.start();await coordinator.pause(true);reason=await Promise.race([done,wallGuard]);}
  catch(e){error=e.stack||String(e);reason='error';console.error(error);}
  finally{
    clearInterval(interval);clearTimeout(timer);if(reason==='wall-guard-censored')await coordinator.pause(false).catch(()=>{});await coordinator.close();Model.closeCuda();
  }
  const report={format:'male-cns-statehead-steering-balance-experiment-v1',appVersion:'5.6.0',settings:{model:'V3 state-head / Monza',modelSha256:selected.modelSha256,baselineProof:selected.proofFile,population,mutation,speed,seed,generationsRequested:generations,steeringMutationGain:gain,workers:4,nodeVersion:process.versions.node},method:'Same verified protected starting model and deterministic seed; actual CUDA neural policy, sensor input, track geometry, vehicle physics and reward are unchanged. Only the per-process search candidate amplitude for steering coefficients is multiplied before evaluation. No actions, route, labels, save, production app source or released file are changed.',baseline:selected.expected,complete:reason==='completed',reason,error,records,final:summary(),elapsedWallSeconds:(Date.now()-started)/1000,interpretation:'One seed and a few generations are a local search signal only. A higher progress frontier without a clean two-lap result does not establish an improved model.'};
  await fs.mkdir(out,{recursive:false});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('STEERING_BALANCE_REPORT '+JSON.stringify({complete:report.complete,reason,modelSha256:selected.modelSha256,baseline:selected.expected,records:records.map(r=>({generation:r.history.generation,bestProgress:r.history.bestProgress,meanProgress:r.history.meanProgress,maxLaps:r.history.maxLaps,leader:r.progressLeader})),final:report.final,output:path.join(out,'report.json')}));
  if(reason!=='completed')process.exitCode=2;
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
