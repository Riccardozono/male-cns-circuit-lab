'use strict';
const path=require('node:path'),crypto=require('node:crypto'),{fork}=require('node:child_process'),{EventEmitter}=require('node:events'),{Archive}=require('./neural-grown-archive.cjs'),{rng}=require('../outputs/simulation.js'),Model=require('./neural-grown-model.cjs');
const rules=require('../.impeccable/experimental-penalty5/outputs/rewards.js').RULES,root=path.resolve(__dirname,'..'),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
class Coordinator extends EventEmitter {
  constructor({modelFile,population=16,mutation=.16,speedMultiplier=1,workers=4,restored=null}={}){
    super();if(!Number.isInteger(population)||population<4||population>100||!Number.isInteger(workers)||workers<1||workers>4)throw Error('Native population 4–100 / workers 1–4 required');
    this.loaded=Model.load(modelFile);this.modelFile=modelFile;this.dimensions=this.loaded.data.stages.at(-1).weights.length;
    this.archive=new Archive({dimensions:this.dimensions,population,maxProgress:11586.000000259404});
    const verified=this.loaded.data.verifiedFullResult;
    this.archive.offer({weights:this.loaded.data.stages.at(-1).weights.slice(),fitness:verified.fitness,baseFitness:verified.fitness,progress:verified.bestProgress,laps:verified.laps,lapTimes:(verified.lapTimes||[]).slice(),reason:verified.reason,censored:false,overlap:0});this.population=population;
    this.mutation=mutation;this.speedMultiplier=speedMultiplier;this.workerCount=Math.min(workers,population);this.workers=[];this.random=rng(151216);this.generation=1;this.history=[];this.running=false;this.phase='loading';this.request=0;this.pending=new Map();this.inspected=0;this.completedEpisodes=0;this.updates=0;this.previousLapTime=null;this.closed=false;this.operations=Promise.resolve();
    if(restored){
      const state=require('./neural-grown-save.cjs').validateState(restored,this.dimensions);this.archive=Archive.restore(state.archive);this.population=state.population;this.archive.population=state.population;
      this.mutation=state.mutation;this.speedMultiplier=state.speedMultiplier;this.random=rng(state.randomState);this.generation=state.generation;this.history=state.history;this.completedEpisodes=state.completedEpisodes;this.updates=state.updates;this.previousLapTime=state.previousLapTime;this.restoredEntries=state.entries;this.workerCount=Math.min(workers,this.population);
    }
  }
  enqueue(task){const operation=this.operations.then(()=>{if(this.closed)throw Error('Native coordinator closed');return task();});this.operations=operation.catch(()=>{});return operation;}
  async start(){
    await Promise.all(Array.from({length:this.workerCount},async(_,i)=>{
      const child=fork(path.join(__dirname,'neural-grown-worker.cjs'),[JSON.stringify({modelFile:this.modelFile})],{execPath:path.join(root,'.impeccable/runtime-node24/node.exe'),cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
      const slot={child,index:i,cars:[],ready:false,done:null,begun:null};this.workers.push(slot);
      child.on('message',m=>this.message(slot,m));child.on('error',e=>this.emit('error',e));child.on('exit',code=>{if(!this.closed)this.emit('error',Error('Native worker stopped unexpectedly: '+code));});
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native model startup timed out')),20000);slot.onReady=()=>{clearTimeout(timer);resolve();};});
    }));
    this.workers.sort((a,b)=>a.index-b.index);await this.begin(this.restoredEntries||null);this.restoredEntries=null;return this.snapshot();
  }
  message(slot,m){
    if(m.type==='ready'){if(m.nodeVersion!=='24.19.0'||m.modelSha256!==this.loaded.sha256){this.emit('error',Error('Numerical model/runtime mismatch'));return;}slot.ready=true;slot.onReady?.();}
    else if(m.type==='error')this.emit('error',Error(m.message));
    else if(m.type==='ack'){const key=slot.index+':'+m.request,entry=this.pending.get(key);if(entry){this.pending.delete(key);clearTimeout(entry.timer);entry.resolve();}}
    else if(m.epoch===this.epoch){
      if(m.type==='begun'){slot.begun=m;slot.onBegun?.();}
      else if(m.type==='snapshot'){slot.cars=m.cars;slot.snapshotEpoch=m.epoch;slot.onBegun?.();if(this.workers.every(w=>w.snapshotEpoch===this.epoch)&&this.phase!=='starting')this.emit('snapshot',this.snapshot());}
      else if(m.type==='done'){slot.done=m.results;const epoch=this.epoch;this.enqueue(async()=>{if(epoch===this.epoch&&this.workers.every(w=>w.done)&&this.phase==='running')await this.finish();}).catch(e=>{if(!this.closed)this.emit('error',e);});}
    }
  }
  async begin(entries=null){
    this.phase='starting';this.epoch=crypto.randomUUID();this.entries=entries||this.archive.ask(this.random,{strength:this.mutation/.16}).map((r,id)=>({id,weights:r.weights}));this.genesHash=hash(this.entries);this.startedGenesHash=this.genesHash;
    await Promise.all(this.workers.map(slot=>new Promise((resolve,reject)=>{
      slot.done=null;slot.begun=null;slot.snapshotEpoch=null;const timer=setTimeout(()=>reject(Error('Native generation startup timed out')),20000);slot.onBegun=()=>{if(slot.snapshotEpoch===this.epoch){clearTimeout(timer);resolve();}};
      const own=this.entries.filter(r=>r.id%this.workerCount===slot.index);slot.child.send({type:'begin',epoch:this.epoch,entries:own,previousLapTime:this.previousLapTime,speed:this.speedMultiplier,inspected:this.inspected});
    })));
    this.phase=this.running?'running':'paused';if(this.running)await this.broadcast('pause',{value:true});this.emit('snapshot',this.snapshot());
  }
  async broadcast(type,fields={}){const request=++this.request;await Promise.all(this.workers.map(slot=>new Promise((resolve,reject)=>{const key=slot.index+':'+request,timer=setTimeout(()=>{this.pending.delete(key);reject(Error('Native command acknowledgement timed out'));},10000);this.pending.set(key,{resolve,timer});slot.child.send({type,request,...fields});})));}
  pause(value){return this.enqueue(async()=>{this.running=Boolean(value);await this.broadcast('pause',{value:this.running});this.phase=this.running?'running':'paused';if(this.running&&this.workers.every(w=>w.done))await this.finish();this.emit('snapshot',this.snapshot());});}
  setSpeed(value){return this.enqueue(async()=>{if(!Number.isFinite(value)||value<.5||value>30)throw Error('Speed .5–30 required');this.speedMultiplier=value;await this.broadcast('setSpeed',{value});this.emit('snapshot',this.snapshot());});}
  setMutation(value){return this.enqueue(()=>{if(!Number.isFinite(value)||value<0||value>.35)throw Error('Mutation 0–35% required');this.mutation=value;this.emit('snapshot',this.snapshot());});}
  inspect(id){if(!Number.isInteger(id)||id<0||id>=this.population)throw Error('Unknown actual agent');this.inspected=id;for(const w of this.workers)w.child.send({type:'inspectAgent',value:id});}
  async finish(){
    this.phase='evolving';const results=this.workers.flatMap(w=>w.done);
    if(results.length!==this.population||results.some(r=>!r.complete||r.censored||r.overlap||r.laps>2))throw Error('A complete actual population is required before updating weights');
    for(const r of results)this.archive.offer({weights:r.weights,fitness:r.fitness,baseFitness:r.baseFitness,lapTimes:r.lapTimes,progress:r.progress,laps:r.laps,reason:r.reason,censored:false,overlap:0});
    const ranked=results.slice().sort((a,b)=>b.fitness-a.fitness),winner=ranked[0],progressLeader=results.reduce((a,b)=>b.progress>a.progress?b:a),lapTimes=results.flatMap(r=>r.lapTimes),bestLapTime=lapTimes.length?Math.min(...lapTimes):null;
    this.history.push({generation:this.generation,best:winner.fitness,mean:results.reduce((s,r)=>s+r.fitness,0)/results.length,bestProgress:progressLeader.progress,meanProgress:results.reduce((s,r)=>s+r.progress,0)/results.length,maxLaps:Math.max(...results.map(r=>r.laps)),laps:winner.laps,bestLapTime,elapsed:Math.max(...results.map(r=>r.totalSimulationSeconds)),actualEpisodes:results.length,genesHash:this.genesHash,rewardRevision:'progress-5-crash-safety-experiment'});if(this.history.length>100)this.history.shift();
    this.completedEpisodes+=results.length;this.updates++;this.previousLapTime=bestLapTime;this.archive.rebase(bestLapTime,rules);this.generation++;await this.begin();
  }
  snapshot(){
    const cars=this.workers.flatMap(w=>w.cars).sort((a,b)=>a.id-b.id);return {circuitId:'monza',population:this.population,mutation:this.mutation,speedMultiplier:this.speedMultiplier,mode:'connectome',running:this.running,generation:this.generation,elapsed:cars.length?Math.max(...cars.map(c=>c.lifetime)):0,history:this.history.slice(),cars,bestEver:this.archive.champion.fitness,champion:null,championStats:null,
      learningStats:{updates:this.updates,episodes:this.completedEpisodes,parameters:this.dimensions,algorithm:'grown-neuronal-diversity'},
      experiment:{mode:'grown-training-from-line',phase:this.phase,genesHash:this.genesHash,archiveCells:this.archive.cells.size,modelSha256:this.loaded.sha256,workerCount:this.workerCount,nodeVersion:'24.19.0',warmStart:true,contextStages:this.loaded.data.stages.length,verifiedProgress:this.loaded.data.verifiedFullResult.bestProgress,verifiedLaps:this.loaded.data.verifiedFullResult.laps}};
  }
  reset(population=this.population){return this.enqueue(async()=>{if(!Number.isInteger(population)||population<4||population>100)throw Error('Population 4–100 required');this.population=population;this.archive.population=population;this.inspected=Math.min(this.inspected,population-1);this.running=false;await this.broadcast('pause',{value:false});await this.begin();});}
  exportState(){return this.enqueue(()=>({population:this.population,mutation:this.mutation,speedMultiplier:this.speedMultiplier,randomState:this.random.getState(),generation:this.generation,history:structuredClone(this.history),completedEpisodes:this.completedEpisodes,updates:this.updates,previousLapTime:this.previousLapTime,archive:this.archive.snapshot(),entries:structuredClone(this.entries)}));}
  async close(){this.closed=true;await Promise.all(this.workers.map(w=>new Promise(resolve=>{if(w.child.exitCode!==null){resolve();return;}const timer=setTimeout(()=>{w.child.kill();resolve();},3000);w.child.once('exit',()=>{clearTimeout(timer);resolve();});if(w.child.connected)w.child.send({type:'stop'});else w.child.kill();})));for(const p of this.pending.values())clearTimeout(p.timer);this.pending.clear();}
}
module.exports={Coordinator};
