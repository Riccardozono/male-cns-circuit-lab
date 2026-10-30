'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const PPO=require('./ppo-neural.cjs'),Env=require('./ppo-environment.cjs'),{X,F,L}=Env,root=path.resolve(__dirname,'..'),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if(!isMainThread){
  const sim=new F.Simulation(X.model(require('../outputs/data/connectome.json')),{population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json')});
  parentPort.on('message',message=>{try{const result=Env.collect(sim.track,sim.graph,message.genome,message.bank,message.prefix,message.critic,message.seed,message.steps,message.maxRollout);parentPort.postMessage({id:message.id,result});}catch(error){parentPort.postMessage({id:message.id,error:error.stack});}});
}else{
  const arg=(name,otherwise)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3)||otherwise;
  const tag=arg('tag','initial'),batches=Number(arg('batches','40')),workers=Number(arg('workers','2')),steps=Number(arg('steps','512'));
  if(!/^[a-z0-9-]+$/.test(tag)||!Number.isInteger(batches)||batches<1||batches>500||!Number.isInteger(workers)||workers<1||workers>3||!Number.isInteger(steps)||steps<64||steps>2048)throw Error('Invalid PPO experiment settings');
  const output=path.join(root,'.impeccable/review/ppo-neural',tag),source=path.join(root,'.impeccable/review/context8/migration/Circuit-Lab-5.6.0-v3-context8-monza-gen64.malecns-save');
  fs.mkdirSync(output,{recursive:true});const sourceHash=hash(source),original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',originalHash=hash(original),pool=[];let request=0;
  async function main(){
    const file=await X.P.decode(fs.readFileSync(source,'utf8'),'5.6.0'),sim=new F.Simulation(X.model(require('../outputs/data/connectome.json')),{population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json')});
    X.P.validatePayload(file.payload,{graph:sim.graph,circuits:sim.circuits});const originalGenome=file.payload.globalChampion.genome;sim.spawn([originalGenome]);sim.mutation=0;
    const parent=sim.cars[0],bank=[],prefix=[],fractions=[.55,.65,.75],frontier=file.payload.globalChampion.stats.bestProgress;let next=0,ticks=0;
    while(parent.alive&&ticks++<12000){sim.tick();if(parent.alive&&sim.ticks%48===1&&parent.bestProgress<frontier*.65)prefix.push(Array.from(parent.brain.policyFeatures));
      if(parent.alive&&next<fractions.length&&parent.bestProgress>=frontier*fractions[next]){bank.push(F.capturePracticeState(parent));next++;}}
    if(parent.alive||bank.length!==fractions.length)throw Error('Incumbent did not produce actual curriculum snapshots');
    let genes=L.initialiseContexts(sim.graph,originalGenome.policyWeights,parent.brain.policyExperience),actor=new PPO.Actor(sim.graph.learning,genes),reference=new PPO.Actor(sim.graph.learning,genes),random=F.rng(88007717),critic=new PPO.Critic(actor.dimension+2,random,16),actorAdam=new PPO.Adam(actor.weights.length,.002),criticAdam=new PPO.Adam(critic.weights.length,.005);
    const anchors=prefix.map(raw=>[...raw.map(v=>v/8),...L.contextVector(sim.graph,genes,raw).map(v=>v/8),1]);
    const baseline=Env.evaluate(sim.track,sim.graph,{...F.cloneGenome(originalGenome),policyWeights:genes}),history=[];let best=baseline,bestGenes=genes.slice(),totalSteps=0,terminals=0,rollouts=0;
    const started=performance.now(),sourceHashes=Object.fromEntries(['work/ppo-neural.cjs','work/ppo-environment.cjs','work/train-neural-ppo.cjs','.impeccable/experimental-context8/outputs/neural-learning.js','.impeccable/experimental-context8/outputs/simulation.js'].map(f=>[f,hash(path.join(root,f))]));
    for(let k=0;k<workers;k++){
      const thread=new Worker(__filename,{workerData:{index:k}}),pending=new Map();thread.on('message',message=>{const job=pending.get(message.id);if(!job)return;pending.delete(message.id);message.error?job.reject(Error(message.error)):job.resolve(message.result);});thread.on('error',error=>{for(const job of pending.values())job.reject(error);pending.clear();});pool.push({thread,pending});
    }
    const collect=(slot,options)=>new Promise((resolve,reject)=>{const id=++request;slot.pending.set(id,{resolve,reject});slot.thread.postMessage({id,...options});});
    for(let batch=0;batch<batches;batch++){
      const genome={...F.cloneGenome(originalGenome),policyWeights:actor.install(genes)},results=await Promise.all(pool.map((slot,index)=>collect(slot,{genome,bank,prefix,critic:critic.snapshot(),seed:(88007717+batch*7919+index*104729)>>>0,steps,maxRollout:240}))),rows=results.flatMap(r=>r.rows),metrics=PPO.update(actor,critic,rows,actorAdam,criticAdam,random,anchors,reference);
      totalSteps+=rows.length;const episodes=results.flatMap(r=>r.episodes);rollouts+=episodes.length;terminals+=episodes.filter(e=>e.terminal).length;
      genes=actor.install(genes);if(!L.valid(sim.graph,genes))throw Error('PPO genes exceeded neural model bounds');
      let evaluation=null;if(batch%2===0||batch===batches-1){evaluation=Env.evaluate(sim.track,sim.graph,{...F.cloneGenome(originalGenome),policyWeights:genes});if(evaluation.complete&&evaluation.bestProgress>=baseline.bestProgress&&evaluation.fitness>best.fitness){best=evaluation;bestGenes=genes.slice();}}
      const entry={batch:batch+1,trainingSteps:totalSteps,realTerminatedEpisodes:terminals,truncatedOrTerminalRollouts:rollouts,metrics,
        rolloutMeanProgress:episodes.reduce((sum,e)=>sum+e.progress,0)/episodes.length,rolloutMaxProgress:Math.max(...episodes.map(e=>e.progress)),evaluation,bestEvaluation:best,wallSeconds:(performance.now()-started)/1000};history.push(entry);
      fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify({baseline,history,sourceHashes,boundary:'Actual PPO training rollouts and separately deterministic start-line evaluations. Rollout truncation is not a completed generation/lap. Current and best models are separate.'},null,2));
      const checkpoint={format:'male-cns-ppo-experiment',schema:1,appVersion:'5.6.0',graph:X.P.compatibleGraph(sim.graph),algorithm:'PPO-Clip with GAE and neural-prefix projection',sourceSha256:sourceHash,legacySourceSha256:originalHash,policyGenes:genes,bestGenes,critic:critic.snapshot(),actorAdam,criticAdam,randomState:random.getState(),batch:batch+1,trainingSteps:totalSteps,realTerminatedEpisodes:terminals,bestEvaluation:best};
      checkpoint.checksum=crypto.createHash('sha256').update(JSON.stringify(checkpoint)).digest('hex');fs.writeFileSync(path.join(output,'training-checkpoint.json'),JSON.stringify(checkpoint,null,2));
      console.log('NEURAL_PPO_BATCH '+JSON.stringify(entry));
      if(best.laps===2){console.log('NEURAL_PPO_TWO_LAPS_DETERMINISTIC '+JSON.stringify(best));break;}
    }
    const report={passed:true,sourceUnchanged:hash(source)===sourceHash,originalUnchanged:hash(original)===originalHash,sourceHashes,configuration:{workers,stepsPerWorker:steps,batchesRequested:batches,neuralModel:'v3',neurons:sim.graph.n,edges:sim.graph.edgeCount,trainableMotorWeights:actor.weights.length,criticHiddenUnits:16,circuit:'monza'},baseline,best,history,
      boundary:'Real recurrent MaleCNS neural observations only for actor/critic. No prescribed trajectory, position input, teacher action, projected car motion or claimed biological neurons from hidden critic units. Actual reward scaled by positive constant only for numerics. Checkpoint is explicit PPO experiment, not legacy ES save or published application. Deterministic full evaluations are the success gate.'};
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('NEURAL_PPO_DONE '+JSON.stringify({...report,history:undefined,sourceHashes:undefined}));
  }
  main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await Promise.all(pool.map(slot=>slot.thread.terminate()));});
}
