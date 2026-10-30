'use strict';
// Paired dose-response test from the first moving crossing of the saved V3 safe frontier.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,process.env.MALECNS_SENSORY_REPORT_DIR||'.impeccable/review/learning-ml/saved-v3-moving-frontier-sensory-dose-20261021-01');
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Learning=require(path.join(root,'outputs/neural-learning.js')),Dense=require(path.join(root,'outputs/dense-neural.js')),
  Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const AMOUNTS=(process.env.MALECNS_SENSORY_AMOUNTS||'.005,.01,.015,.02,.025').split(',').map(Number),SEEDS=(process.env.MALECNS_SENSORY_SEEDS||'20261121,20261122,20261123,20261124,20261125,20261126').split(',').map(Number),MAX_CONTROLS=12000;
const FOCUS_CHANNELS=(process.env.MALECNS_SENSORY_CHANNELS||'').split(',').filter(Boolean).map(Number);
const MULTI_CONTEXT=process.env.MALECNS_SENSORY_MULTICONTEXT==='1';
const TRACE=process.env.MALECNS_SENSORY_TRACE==='1';
if(!AMOUNTS.length||AMOUNTS.some(value=>!Number.isFinite(value)||value<=0)||!SEEDS.length||SEEDS.some(value=>!Number.isInteger(value))||FOCUS_CHANNELS.some(value=>!Number.isInteger(value)||value<0||value>=Learning.CHANNELS)||new Set(FOCUS_CHANNELS).size!==FOCUS_CHANNELS.length)throw Error('Invalid sensory dose or channel configuration');
function normal(random){let value=0;do{value=random();}while(value<=0);return Math.sqrt(-2*Math.log(value))*Math.cos(2*Math.PI*random());}
function mutateSensoryChannels(graph,genome,random,amount,context){
  if(!FOCUS_CHANNELS.length)return F.mutateSensoryBlock(graph,genome,random,amount,context);
  const child=F.cloneGenome(genome),scale=Math.max(0,amount)/.16,contexts=(Array.isArray(context)?context:[context]).filter(Boolean);if(!scale||!contexts.length)return child;
  for(const channel of FOCUS_CHANNELS){child.policyWeights[channel]=F.clamp(child.policyWeights[channel]+normal(random)*1.5*scale,-8,8);child.policyWeights[Learning.CHANNELS+channel]=F.clamp(child.policyWeights[Learning.CHANNELS+channel]+normal(random)*1.5*scale,-8,8);}
  const logit=value=>Math.atanh(F.clamp(value,-1+1e-12,1-1e-12)),last=child.policyWeights.length,correction=[0,0];
  for(const anchor of contexts){
    const before=F.makeBrain(graph),after=F.makeBrain(graph);before.activity.set(anchor.activity);after.activity.set(anchor.activity);let baseline,mutated;
    for(let step=0;step<4;step++){
      baseline=F.neuralStep(graph,before,genome,anchor.sensors,true,true,F.MAP_PHYSICS_ADAPTER_GAIN,F.MAP_NEURAL_MOTOR_LAUNCH_BIAS);
      mutated=F.neuralStep(graph,after,child,anchor.sensors,true,true,F.MAP_PHYSICS_ADAPTER_GAIN,F.MAP_NEURAL_MOTOR_LAUNCH_BIAS);
    }
    correction[0]+=logit(baseline[0])-logit(mutated[0]);
    correction[1]+=logit(baseline[1]-baseline[2])-logit(mutated[1]-mutated[2]);
  }
  child.policyWeights[last-2]=F.clamp(child.policyWeights[last-2]+correction[0]/contexts.length,-8,8);
  child.policyWeights[last-1]=F.clamp(child.policyWeights[last-1]+correction[1]/contexts.length,-8,8);
  child.policyWeights=Learning.scaleMutation(genome.policyWeights,child.policyWeights,1);return child;
}
function outcome(car,ticks,wallSeconds){return {ticks,wallSeconds,progressM:car.bestProgress/(car.pixelsPerMeter||1),laps:car.laps,lapTimes:car.lapTimes.slice(),
  safe:F.isSafeLearningOutcome(car),reason:car.reason||'',fitness:car.fitness,gas:car.outputs?.[1]??0,brake:car.outputs?.[2]??0};}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing moving-frontier benchmark');
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
    const spawnContext={sensors:target.sensorVector.slice(),activity:target.brain.activity.slice()},threshold=(populationSim.safeLearningFrontier?.progress||0)*.9,generation=populationSim.generation,terminal=new Map();let parent=null,ticks=0;populationSim.running=true;
    populationSim.onTrialTick=s=>{
      for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason||''});
      const car=s.cars.find(item=>item.id===targetId);if(car&&!parent&&car.encodingContext)parent={genome:F.cloneGenome(car.genome),spawn:spawnContext,launch:{sensors:car.encodingContext.sensors.slice(),activity:car.encodingContext.activity.slice()},crossing:null};
      if(parent&&!parent.crossing&&car?.bestProgress>=threshold&&(car.vehicle?.speedMps??0)>1&&car.sensorVector?.length){
        parent.crossing={tick:s.ticks,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),speedMps:car.vehicle.speedMps,gas:car.outputs?.[1]??0,brake:car.outputs?.[2]??0,
          sensors:car.sensorVector.slice(),activity:car.brain.activity.slice()};
      }
    };
    while(populationSim.generation===generation&&ticks++<60000)populationSim.tick();
    if(populationSim.generation===generation||terminal.size!==state.population||!parent?.crossing)throw Error('Exact saved generation or moving-frontier context capture failed');
    const observed=[...terminal.values()].sort((a,b)=>a.id-b.id),expected=control.treatment.results[0].outcomes;
    if(JSON.stringify(observed)!==JSON.stringify(expected))throw Error('Protected baseline generation changed');
    const variants=[];
    for(const amount of AMOUNTS)for(const seed of SEEDS){const anchors=MULTI_CONTEXT?[parent.spawn,parent.launch,parent.crossing]:parent.crossing,genome=mutateSensoryChannels(populationSim.graph,parent.genome,F.rng(seed),amount,anchors),channels=[];
      for(let k=0;k<28;k++)if(genome.policyWeights[k]!==parent.genome.policyWeights[k]||genome.policyWeights[28+k]!==parent.genome.policyWeights[28+k])channels.push(k);
      variants.push({amount,seed,channels,genome});}
    const results=[];
    for(let index=0;index<variants.length;index++){
      const variant=variants[index],sim=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0}),car=sim.cars[0];
      car.genome=F.cloneGenome(variant.genome);F.Rewards.initialise(sim.track,car,null,'progress-3');sim.running=true;
      let steps=0,finished=null,last=performance.now();const trace=[];sim.onTrialTick=s=>{const c=s.cars[0];if(!c.alive&&!finished)finished=c;
        const progressM=c.bestProgress/(s.track.pixelsPerMeter||1);
        if(TRACE&&s.ticks%s.neuralInterval===0&&progressM>=740&&progressM<=850)trace.push({tick:s.ticks,progressM,laps:c.laps,x:c.x,y:c.y,heading:c.heading,speedMps:c.vehicle?.speedMps??0,
          sensors:[18,19,20,21].map(channel=>c.sensorVector?.[channel]??null),outputs:c.outputs?.slice()??null,
          longitudinalG:c.longitudinalG,lateralG:c.lateralG,slipAngle:c.slipAngle,reason:c.reason||''});
        if(performance.now()-last>25000){last=performance.now();console.log('MOVING_FRONTIER_PROGRESS '+JSON.stringify({candidate:index+1,total:variants.length,amount:variant.amount,ticks:s.ticks,progressM:c.bestProgress/(s.track.pixelsPerMeter||1)}));}};
      const start=performance.now();while(sim.generation===1&&steps++<MAX_CONTROLS)sim.tick();const wallSeconds=(performance.now()-start)/1000;
      if(sim.generation===1||!finished)throw Error(`Candidate ${index+1} did not terminate`);
      results.push({amount:variant.amount,seed:variant.seed,channels:variant.channels,outcome:outcome(finished,steps,wallSeconds),...(TRACE?{trace}: {})});sim.running=false;
    }
    const groups=AMOUNTS.map(amount=>{const rows=results.filter(row=>row.amount===amount),safe=rows.filter(row=>row.outcome.safe),progress=safe.map(row=>row.outcome.progressM).sort((a,b)=>a-b);
      return {amount,count:rows.length,safeCount:safe.length,collisionCount:rows.filter(row=>row.outcome.reason==='urto').length,twoLapCount:safe.filter(row=>row.outcome.laps>=2).length,
        medianSafeProgressM:progress.length?progress[Math.floor((progress.length-1)/2)]:null,maxSafeProgressM:progress.length?progress.at(-1):null,
        bestSafe:rows.filter(row=>row.outcome.safe).sort((a,b)=>b.outcome.progressM-a.outcome.progressM)[0]||null};});
    const gpu=Cuda.stats(),report={format:'male-cns-saved-v3-moving-frontier-sensory-dose-response-v1',appVersion:'5.6.0',passed:true,
      learningSucceeded:results.some(row=>row.outcome.safe&&row.outcome.laps>=2),save:{sha256:saveSha,unchanged:sha(fs.readFileSync(savePath))===saveSha,
        model:'V3',circuit:'Monza',generation:state.generation,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
      baseline:{allFortyOutcomesMatched:true,leaderId:targetId,leaderProgressM:control.treatment.results[0].safeProgressLeader.progressM,frontierThresholdM:threshold,
        movingFrontierContext:{tick:parent.crossing.tick,progressM:parent.crossing.progressM,speedMps:parent.crossing.speedMps,gas:parent.crossing.gas,brake:parent.crossing.brake},seedPairs:SEEDS},
      sensorChannels:FOCUS_CHANNELS.length?FOCUS_CHANNELS:[null,null],method:`${SEEDS.length} deterministic sensory mutations are evaluated at ${AMOUNTS.length} amplitudes (${AMOUNTS.join(', ')}), applied at the first saved-leader crossing of 90% safe frontier while moving above 1 m/s. ${FOCUS_CHANNELS.length?`Each child mutates only existing sensor input channels ${FOCUS_CHANNELS.join(' and ')}.`:'Each child mutates two randomly selected existing sensor input channels.'} Motor readout biases are compensated in the actual Monza solver configuration across ${MULTI_CONTEXT?'three contexts: generation start, first learned encoding context, and moving frontier':'the moving frontier context'} using the four recurrent iterations of a V3 control step. Complete same-start Monza rollouts and progress-3 reward determine outcomes; the exact saved generation is revalidated first.`,
      groups,results,gpu,sourceHashes:Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','progress-save.js'].map(file=>[file,sha(fs.readFileSync(path.join(root,'outputs',file)))])),
      boundary:'One saved parent, one seed and Monza. This dose-response does not prove a general learning improvement. No user save, application source, version or release is written.'};
    if(!report.save.unchanged||gpu.cpuFallbacks!==0||gpu.gpuCalls===0||results.length!==AMOUNTS.length*SEEDS.length)throw Error('Save, CUDA, or candidate-count verification failed');
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('MOVING_FRONTIER_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,baseline:report.baseline,groups:groups.map(group=>({amount:group.amount,safeCount:group.safeCount,collisionCount:group.collisionCount,medianSafeProgressM:group.medianSafeProgressM,maxSafeProgressM:group.maxSafeProgressM,twoLapCount:group.twoLapCount})),gpu,report:path.join(out,'report.json')}));
  }finally{Dense.step=originalDenseStep;populationSim?.running&&(populationSim.running=false);Cuda.close();}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
