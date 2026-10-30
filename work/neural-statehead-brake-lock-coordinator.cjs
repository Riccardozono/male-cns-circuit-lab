'use strict';
// Separate coordinator: brake-lock scoring plus observed-context-directed
// longitudinal decoder mutations; the physical/neural command path is unchanged.
const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const {fork}=require('node:child_process');
const {Coordinator:Base}=require('./neural-statehead-cuda-coordinator.cjs');
const {Archive:BrakeLockArchive}=require('./neural-statehead-brake-lock-archive.cjs');
const Save=require('./neural-statehead-brake-lock-save.cjs');
const Overlay=require('./neural-statehead-brake-lock-overlay.cjs');
const root=path.resolve(__dirname,'..'),proofFile=path.join(root,'.impeccable/review/learning-ml/statehead-brake-lock-cuda-20261020/report.json');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function readProof(model,choice){
  const report=JSON.parse(fs.readFileSync(proofFile,'utf8'));
  if(report.format!=='male-cns-statehead-brake-lock-baseline-v1'||report.passed!==true||
     report.model?.sha256!==model.sha256||report.overlay?.revision!==Overlay.REVISION||
     report.physicsTrajectoryUnchanged!==true||report.neuralActionsUnchanged!==true||
     report.actionTraceSha256!==choice.actionTraceSha256||
     report.original?.fitness!==choice.expected.fitness||
     Math.abs(report.observed?.fitness-(choice.expected.fitness-report.baselinePenalty))>1e-6||
     !Number.isFinite(report.baselinePenalty)||report.baselinePenalty<0||
     Math.abs(report.brakeLock?.totalPenalty-report.baselinePenalty)>1e-6)
    throw Error('Il replay controfattuale del modello iniziale non è verificabile.');
  return report;
}
class Coordinator extends Base {
  constructor(options={}){
    const restored=options.restored?Save.toBaseState(options.restored):null;
    super({...options,restored});
    this.archive=BrakeLockArchive.restore(options.restored?options.restored.archive:this.archive.snapshot());
    this.rewardRevision=Overlay.REVISION;
    this.baselineProof=readProof(this.loaded,require('./neural-statehead-cuda-model.cjs').defaultChoice());
    this.baselinePenalty=this.baselineProof.baselinePenalty;
    this.baselineFitness=this.baselineProof.observed.fitness;
    if(options.restored){
      const context=options.restored.archive?.champion?.rewardDirectedContext;
      if(context&&this.archive.champion)this.archive.champion.rewardDirectedContext=structuredClone(context);
      this.history=structuredClone(options.restored.history);return;
    }
    const champion=this.archive.champion;
    if(!champion||this.archive.cells.size!==1||this.archive.evaluations!==1||
       JSON.stringify(champion.weights)!==JSON.stringify(this.loaded.data.weights)||
       champion.fitness!==this.baselineProof.original.fitness)
      throw Error('L’archivio iniziale non corrisponde al campione verificato da ricalcolare.');
    const score=champion.fitness-this.baselinePenalty;
    this.archive.champion={...this.archive.champion,fitness:score,
      baseFitness:this.archive.champion.baseFitness-this.baselinePenalty};
    for(const candidate of this.archive.cells.values()){
      candidate.fitness=score;candidate.baseFitness-=this.baselinePenalty;
    }
  }
  async start(){
    await Promise.all(Array.from({length:this.workerCount},async(_,i)=>{
      const child=fork(path.join(__dirname,'neural-statehead-brake-lock-worker.cjs'),
        [JSON.stringify({modelFile:this.modelFile,research:this.research})],
        {execPath:path.join(root,'.impeccable/runtime-node24/node.exe'),cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
      const slot={child,index:i,cars:[],ready:false,done:null,begun:null};this.workers.push(slot);
      child.stdout?.on('data',chunk=>process.stdout.write(`[brake-lock worker ${i}] ${chunk}`));
      child.stderr?.on('data',chunk=>process.stderr.write(`[brake-lock worker ${i}] ${chunk}`));
      child.on('message',m=>this.message(slot,m));child.on('error',e=>this.emit('error',e));
      child.on('exit',code=>{if(!this.closed)this.emit('error',Error('State-head brake-lock worker stopped unexpectedly: '+code));});
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('State-head brake-lock worker startup timed out')),20000);slot.onReady=()=>{clearTimeout(timer);resolve();};});
    }));
    this.workers.sort((a,b)=>a.index-b.index);await this.begin(this.restoredEntries||null);this.restoredEntries=null;return this.snapshot();
  }
  async finish(){
    const completedGeneration=this.generation;
    const results=this.workers.flatMap(worker=>worker.done||[]);
    const terminalSlow=results.filter(r=>r.terminalSlow===true&&Number.isFinite(r.brakeLockPenalty)&&r.brakeLockPenalty>0)
      .sort((a,b)=>b.brakeLockPenalty-a.brakeLockPenalty||b.progress-a.progress||b.fitness-a.fitness)[0];
    const rewardDirectedContext=terminalSlow?{features:terminalSlow.terminalContextFeatures.slice(),gate:terminalSlow.terminalGate,
      brakeLockPenalty:terminalSlow.brakeLockPenalty,progress:terminalSlow.progress,laps:terminalSlow.laps,reason:terminalSlow.reason}:
      this.archive.champion?.rewardDirectedContext;
    const rebase=this.archive.rebase;
    this.archive.rebase=function(...args){const value=rebase.apply(this,args);if(rewardDirectedContext&&this.champion)this.champion.rewardDirectedContext=structuredClone(rewardDirectedContext);return value;};
    let result;
    try{result=await super.finish();}finally{this.archive.rebase=rebase;}
    const last=this.history.at(-1);
    if(last?.generation===completedGeneration)last.rewardRevision=Overlay.REVISION;
    this.emit('snapshot',this.snapshot());
    return result;
  }
  snapshot(){
    const snapshot=super.snapshot();
    snapshot.experiment={...snapshot.experiment,rewardRevision:Overlay.REVISION,
      baselineBrakeLockPenalty:this.baselinePenalty,baselineRecomputedFitness:this.baselineFitness,
      baselineActionTraceSha256:this.baselineProof.actionTraceSha256,
      rewardDirectedContextAvailable:Boolean(this.archive.champion?.rewardDirectedContext)};
    return snapshot;
  }
}
module.exports={Coordinator};
