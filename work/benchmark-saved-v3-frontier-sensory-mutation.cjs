'use strict';
// Compare the existing sensory-block mutation at its current start context
// against the same mutation anchored to the actually reached safe frontier.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-frontier-sensory-mutation-20261021-01');
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Dense=require(path.join(root,'outputs/dense-neural.js')),
  Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const MAX_CONTROLS=12000,VARIANTS_PER_CONTEXT=12,MUTATION_AMOUNT=.32;
function outcome(car,ticks,wallSeconds){return {ticks,wallSeconds,progressM:car.bestProgress/(car.pixelsPerMeter||1),laps:car.laps,lapTimes:car.lapTimes.slice(),
  safe:F.isSafeLearningOutcome(car),reason:car.reason||'',fitness:car.fitness,steer:car.outputs?.[0]??0,gas:car.outputs?.[1]??0,brake:car.outputs?.[2]??0,speedMps:car.vehicle?.speedMps??0};}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');if(fs.existsSync(out))throw Error('Refusing to overwrite an existing sensory-mutation benchmark');
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
    if(!target)throw Error('Saved V3 progress leader is missing');
    const threshold=(populationSim.safeLearningFrontier?.progress||0)*.9,generation=populationSim.generation,terminal=new Map();let parent=null,ticks=0;populationSim.running=true;
    populationSim.onTrialTick=s=>{
      for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason||''});
      const car=s.cars.find(item=>item.id===targetId);
      if(car){
        if(!parent&&car.encodingContext)parent={genome:F.cloneGenome(car.genome),startContext:{sensors:car.encodingContext.sensors.slice(),activity:car.encodingContext.activity.slice()},
          frontierContext:null,progressM:0,terminalOutcome:null,experienceSamples:0};
        if(parent&&car.bestProgress>parent.progressM&&car.bestProgress>=threshold&&car.sensorVector?.length){
          parent.progressM=car.bestProgress;parent.frontierContext={sensors:car.sensorVector.slice(),activity:car.brain.activity.slice(),along:car.rewardState?.along??null,
            speedMps:car.vehicle?.speedMps??0,priorOutputs:car.outputs.slice()};parent.experienceSamples=car.brain.policyExperience?.samples??0;}
        if(!car.alive&&parent&&!parent.terminalOutcome)parent.terminalOutcome={progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason||'',outputs:car.outputs.slice()};
      }
    };
    while(populationSim.generation===generation&&ticks++<60000)populationSim.tick();
    if(populationSim.generation===generation||terminal.size!==state.population||!parent?.frontierContext)throw Error('Saved population or safe-frontier context capture failed');
    const observed=[...terminal.values()].sort((a,b)=>a.id-b.id),expected=control.treatment.results[0].outcomes;
    if(JSON.stringify(observed)!==JSON.stringify(expected))throw Error('Protected generation-64 physical baseline changed');
    const contexts=[{name:'start-context-current',context:parent.startContext},{name:'reached-safe-frontier',context:parent.frontierContext}],variants=[];
    for(let group=0;group<contexts.length;group++)for(let i=0;i<VARIANTS_PER_CONTEXT;i++){
      const item=contexts[group],seed=20261021+group*100+i,genome=F.mutateSensoryBlock(populationSim.graph,parent.genome,F.rng(seed),MUTATION_AMOUNT,item.context),changed=[];
      for(let k=0;k<28;k++)if(genome.policyWeights[k]!==parent.genome.policyWeights[k]||genome.policyWeights[28+k]!==parent.genome.policyWeights[28+k])changed.push(k);
      variants.push({group:item.name,index:i,seed,changedChannels:changed,genome});
    }
    const results=[];
    for(let i=0;i<variants.length;i++){
      const variant=variants[i],sim=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0}),car=sim.cars[0];
      car.genome=F.cloneGenome(variant.genome);F.Rewards.initialise(sim.track,car,null,'progress-3');sim.running=true;
      let steps=0,finished=null,last=performance.now();sim.onTrialTick=s=>{const c=s.cars[0];if(!c.alive&&!finished)finished=c;
        if(performance.now()-last>25000){last=performance.now();console.log('FRONTIER_SENSORY_PROGRESS '+JSON.stringify({candidate:i+1,total:variants.length,group:variant.group,ticks:s.ticks,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),laps:c.laps}));}};
      const started=performance.now();while(sim.generation===1&&steps++<MAX_CONTROLS)sim.tick();const wallSeconds=(performance.now()-started)/1000;
      if(sim.generation===1||!finished)throw Error(`Sensory candidate ${i+1} exceeded its control limit`);
      results.push({group:variant.group,index:variant.index,seed:variant.seed,changedChannels:variant.changedChannels,outcome:outcome(finished,steps,wallSeconds)});sim.running=false;
    }
    const summarizeGroup=name=>{const rows=results.filter(r=>r.group===name),safe=rows.filter(r=>r.outcome.safe),ranked=safe.slice().sort((a,b)=>b.outcome.progressM-a.outcome.progressM);
      return {count:rows.length,safeCount:safe.length,twoLapCount:safe.filter(r=>r.outcome.laps>=2).length,medianSafeProgressM:safe.length?safe.map(r=>r.outcome.progressM).sort((a,b)=>a-b)[Math.floor((safe.length-1)/2)]:null,
        bestSafe:ranked[0]||null,unsafeCrashCount:rows.filter(r=>r.outcome.reason==='urto').length};};
    const gpu=Cuda.stats(),report={format:'male-cns-saved-v3-frontier-sensory-mutation-ab-v1',appVersion:'5.6.0',passed:true,
      learningSucceeded:results.some(r=>r.outcome.safe&&r.outcome.laps>=2),save:{sha256:saveSha,unchanged:sha(fs.readFileSync(savePath))===saveSha,model:'V3',circuit:'Monza',generation:state.generation,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
      baseline:{allFortyOutcomesMatched:true,leaderId:targetId,leader:parent.terminalOutcome,frontierThresholdM:threshold,
        capturedFrontierProgressM:parent.progressM,frontierSpeedMps:parent.frontierContext.speedMps,frontierPriorOutputs:parent.frontierContext.priorOutputs,
        startContextSensorCount:parent.startContext.sensors.length,frontierContextSensorCount:parent.frontierContext.sensors.length,experienceSamplesAtFrontier:parent.experienceSamples,mutationAmount:MUTATION_AMOUNT},
      method:'Exact saved generation-64 replay on the verified CUDA neural pass. Twelve mutations perturb two actual existing sensor input channels using the app sensory-block mutation, compensated at the observed start context; twelve use the same mutation seeds at the leader’s measured safe-progress frontier context instead. Every candidate is then run from the same Monza start with the complete physical model and original progress-3 reward. No action override, route, added sensors, save migration or promotion.',
      groups:[summarizeGroup('start-context-current'),summarizeGroup('reached-safe-frontier')],results,gpu,
      sourceHashes:Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','progress-save.js'].map(file=>[file,sha(fs.readFileSync(path.join(root,'outputs',file)))])),
      boundary:'One saved parent, seed and circuit. This compares mutation context placement only; it does not prove general learning or a completed two-lap generation. User save, app source, version and release are not written.'};
    if(!report.save.unchanged||gpu.cpuFallbacks!==0||gpu.gpuCalls===0||results.length!==VARIANTS_PER_CONTEXT*contexts.length)throw Error('Save, CUDA or candidate-count verification failed');
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('FRONTIER_SENSORY_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,baseline:report.baseline,groups:report.groups.map(g=>({...g,bestSafe:g.bestSafe?{index:g.bestSafe.index,progressM:g.bestSafe.outcome.progressM,laps:g.bestSafe.outcome.laps,reason:g.bestSafe.outcome.reason}:null})),gpu,report:path.join(out,'report.json')}));
  }finally{Dense.step=originalDenseStep;populationSim?.running&&(populationSim.running=false);Cuda.close();}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
