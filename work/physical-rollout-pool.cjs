'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const root=path.resolve(__dirname,'..'),F=require('../outputs/simulation.js'),Legacy=require('../outputs/legacy-models.js'),data=require('../outputs/data/connectome.json'),
  circuits=require('../outputs/data/circuits.json'),{fullRollout,outcome}=require('./practice-full-rollout.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),files=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/vehicle-992.js','work/practice-full-rollout.cjs','work/physical-rollout-pool.cjs'];
const sources=()=>Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
function setup(){return new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:1,circuitId:'monza',circuits,seed:7717});}
function execute(sim,task){
  const api={...F,makeCar(...args){const car=F.makeCar(...args);car.heading+=task.headingOffsetRad??0;return car;}},
    replay=fullRollout(api,sim.track,sim.graph,task.genome,{rewardRevision:task.rewardRevision??'progress-3',previousLapTime:task.previousLapTime??null,maxTicks:60000});
  return {...outcome(F,replay),progressM:replay.car.bestProgress/(sim.track.pixelsPerMeter||1)};
}
const same=(a,b)=>['fitness','bestProgress','laps','reason','ticks','safe','censored'].every(k=>a[k]===b[k]);
async function runPool(tasks,reference,{workers=2,onResult=null}={}){
  if(!isMainThread)throw Error('Pool cannot recursively spawn');
  const sourceHashes=sources(),handles=[],results=new Map(),baselines=[];
  try{
    await Promise.all(Array.from({length:Math.min(workers,tasks.length)},(_,index)=>new Promise((resolve,reject)=>{
      const worker=new Worker(__filename,{workerData:{index,sourceHashes,reference,tasks:tasks.filter((_,i)=>i%Math.min(workers,tasks.length)===index)}});handles.push(worker);let done=false;
      worker.on('message',message=>{
        if(message.kind==='error')reject(Error(message.error));
        if(message.kind==='baseline')baselines.push(message.result);
        if(message.kind==='case'){if(results.has(message.id)){reject(Error('Duplicate physical result'));return;}results.set(message.id,message.result);onResult?.(message.id,message.result,results.size,tasks.length);}
        if(message.kind==='done'){done=true;resolve();}
      });worker.once('error',reject);worker.once('exit',code=>{if(!done)reject(Error('Physical worker exited early: '+code));});
    })));
  }finally{await Promise.all(handles.map(worker=>worker.terminate()));}
  if(results.size!==tasks.length||baselines.length!==Math.min(workers,tasks.length)||JSON.stringify(sources())!==JSON.stringify(sourceHashes))throw Error('Physical pool count/source integrity failed');
  return {results,baselines,sourceHashes};
}
if(!isMainThread&&require.main===module){
  try{
    if(JSON.stringify(sources())!==JSON.stringify(workerData.sourceHashes))throw Error('Worker source identity failed');
    const sim=setup(),baseline=execute(sim,workerData.reference);
    if(!same(baseline,workerData.reference.expected))throw Error('Worker physical baseline differs');
    parentPort.postMessage({kind:'baseline',result:baseline});
    for(const task of workerData.tasks)parentPort.postMessage({kind:'case',id:task.id,result:execute(sim,task)});
    parentPort.postMessage({kind:'done'});
  }catch(error){parentPort.postMessage({kind:'error',error:error.stack||String(error)});process.exitCode=1;}
}
module.exports={runPool,setup,execute,same,sources};
