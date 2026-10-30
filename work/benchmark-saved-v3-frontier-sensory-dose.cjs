'use strict';
// Dose-response test for the existing sensory mutation at the saved leader's terminal stopped context.
// Same six mutation seeds are reused at each intensity for a paired comparison.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-frontier-sensory-dose-20261021-01');
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Dense=require(path.join(root,'outputs/dense-neural.js')),
  Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const AMOUNTS=[.02,.04,.08,.16,.32],SEEDS=Array.from({length:6},(_,i)=>20261121+i),MAX_CONTROLS=12000;
function outcome(car,ticks,wallSeconds){return {ticks,wallSeconds,progressM:car.bestProgress/(car.pixelsPerMeter||1),laps:car.laps,lapTimes:car.lapTimes.slice(),
  safe:F.isSafeLearningOutcome(car),reason:car.reason||'',fitness:car.fitness,gas:car.outputs?.[1]??0,brake:car.outputs?.[2]??0};}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');if(fs.existsSync(out))throw Error('Refusing to overwrite an existing sensory-dose benchmark');
  const control=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-continued-20261020-01/report.json'),'utf8')),
    raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3'||control.save.sha256!==saveSha)
    throw Error('Exact protected V3/Monza generation-64 checkpoint required');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json')),
    originalDenseStep=Dense.step;Dense.step=(...args)=>Cuda.pass(...args);let populationSim=null;
  try{
    populationSim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
    P.validatePayload(decoded.payload,{graph:populationSim.graph,circuits:populationSim.circuits});P.restore(populationSim,state);
    const targetId=Number(control.treatment.results[0].safeProgressLeader.id),target=populationSim.cars.find(car=>car.id===targetId);
    const threshold=(populationSim.safeLearningFrontier?.progress||0)*.9,generation=populationSim.generation,terminal=new Map();let parent=null,ticks=0;populationSim.running=true;
    populationSim.onTrialTick=s=>{for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason||''});
      const car=s.cars.find(item=>item.id===targetId);if(car&&!parent&&car.encodingContext)parent={genome:F.cloneGenome(car.genome),progressM:0,frontierContext:null};
      if(parent&&car?.bestProgress>parent.progressM&&car.bestProgress>=threshold&&car.sensorVector?.length){parent.progressM=car.bestProgress;parent.frontierContext={sensors:car.sensorVector.slice(),activity:car.brain.activity.slice(),speedMps:car.vehicle?.speedMps??0};}};
    while(populationSim.generation===generation&&ticks++<60000)populationSim.tick();
    if(populationSim.generation===generation||terminal.size!==state.population||!parent?.frontierContext)throw Error('Exact saved generation or frontier-context capture failed');
    const observed=[...terminal.values()].sort((a,b)=>a.id-b.id),expected=control.treatment.results[0].outcomes;
    if(JSON.stringify(observed)!==JSON.stringify(expected))throw Error('Protected baseline generation changed');
    const variants=[];
    for(const amount of AMOUNTS)for(const seed of SEEDS){const genome=F.mutateSensoryBlock(populationSim.graph,parent.genome,F.rng(seed),amount,parent.frontierContext),channels=[];
      for(let k=0;k<28;k++)if(genome.policyWeights[k]!==parent.genome.policyWeights[k]||genome.policyWeights[28+k]!==parent.genome.policyWeights[28+k])channels.push(k);
      variants.push({amount,seed,channels,genome});}
    const results=[];
    for(let index=0;index<variants.length;index++){
      const variant=variants[index],sim=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0}),car=sim.cars[0];
      car.genome=F.cloneGenome(variant.genome);F.Rewards.initialise(sim.track,car,null,'progress-3');sim.running=true;
      let steps=0,finished=null,last=performance.now();sim.onTrialTick=s=>{const c=s.cars[0];if(!c.alive&&!finished)finished=c;
        if(performance.now()-last>25000){last=performance.now();console.log('SENSORY_DOSE_PROGRESS '+JSON.stringify({candidate:index+1,total:variants.length,amount:variant.amount,ticks:s.ticks,progressM:c.bestProgress/(s.track.pixelsPerMeter||1)}));}};
      const start=performance.now();while(sim.generation===1&&steps++<MAX_CONTROLS)sim.tick();const wallSeconds=(performance.now()-start)/1000;
      if(sim.generation===1||!finished)throw Error(`Candidate ${index+1} did not terminate`);
      results.push({amount:variant.amount,seed:variant.seed,channels:variant.channels,outcome:outcome(finished,steps,wallSeconds)});sim.running=false;
    }
    const groups=AMOUNTS.map(amount=>{const rows=results.filter(row=>row.amount===amount),safe=rows.filter(row=>row.outcome.safe),progress=safe.map(row=>row.outcome.progressM).sort((a,b)=>a-b);
      return {amount,count:rows.length,safeCount:safe.length,collisionCount:rows.filter(row=>row.outcome.reason==='urto').length,twoLapCount:safe.filter(row=>row.outcome.laps>=2).length,
        medianSafeProgressM:progress.length?progress[Math.floor((progress.length-1)/2)]:null,maxSafeProgressM:progress.length?progress.at(-1):null,bestSafe:rows.filter(row=>row.outcome.safe).sort((a,b)=>b.outcome.progressM-a.outcome.progressM)[0]||null};});
    const gpu=Cuda.stats(),report={format:'male-cns-saved-v3-terminal-sensory-dose-response-v1',appVersion:'5.6.0',passed:true,learningSucceeded:results.some(row=>row.outcome.safe&&row.outcome.laps>=2),
      save:{sha256:saveSha,unchanged:sha(fs.readFileSync(savePath))===saveSha,model:'V3',circuit:'Monza',generation:state.generation,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
      baseline:{allFortyOutcomesMatched:true,leaderId:targetId,leaderProgressM:parent.progressM,terminalContextSpeedMps:parent.frontierContext.speedMps,safeThresholdM:threshold,seedPairs:SEEDS},
      method:'Same six deterministic sensory mutations are evaluated at five amplitudes (.02-.32), applied at the saved leader terminal stopped context (speed verified as 0 m/s), not at the first moving frontier crossing. Every child changes only two existing sensor input channels and compensates motor biases at that stopped context. Complete same-start Monza rollouts and progress-3 reward determine outcomes; the exact saved generation is revalidated first.',
      groups,results,gpu,sourceHashes:Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','progress-save.js'].map(file=>[file,sha(fs.readFileSync(path.join(root,'outputs',file)))])),
      boundary:'One saved parent, one seed and Monza. This dose-response does not prove a general learning improvement. No user save, application source, version or release is written.'};
    if(!report.save.unchanged||gpu.cpuFallbacks!==0||gpu.gpuCalls===0||results.length!==AMOUNTS.length*SEEDS.length)throw Error('Save, CUDA, or candidate-count verification failed');
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('SENSORY_DOSE_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,baseline:report.baseline,groups:groups.map(group=>({amount:group.amount,safeCount:group.safeCount,collisionCount:group.collisionCount,medianSafeProgressM:group.medianSafeProgressM,maxSafeProgressM:group.maxSafeProgressM,bestSafe:group.bestSafe?{seed:group.bestSafe.seed,progressM:group.bestSafe.outcome.progressM,laps:group.bestSafe.outcome.laps,reason:group.bestSafe.outcome.reason}:null})),gpu,report:path.join(out,'report.json')}));
  }finally{Dense.step=originalDenseStep;populationSim?.running&&(populationSim.running=false);Cuda.close();}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
