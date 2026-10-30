'use strict';
// Isolated local policy search from an actually reached V3/Monza terminal
// state. Mutations change only learned neural weights; all candidate actions
// still come from MaleCNS, real sensors, production physics, and real walls.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,process.env.MALECNS_TERMINAL_PRACTICE_DIR||'.impeccable/review/learning-ml/saved-v3-terminal-practice-search-20261021-01');
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Learning=require(path.join(root,'outputs/neural-learning.js')),
  Dense=require(path.join(root,'outputs/dense-neural.js')),Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const LIMIT_FULL=12000,LOCAL_TICKS=1800,FOCUSED_AMOUNT=[.16,.32,.48,.64],CHANNELS=[20,21];
function normal(random){let value=0;do{value=random();}while(value<=0);return Math.sqrt(-2*Math.log(value))*Math.cos(2*Math.PI*random());}
function sensoryMutation(graph,genome,random,amount,contexts){
  const child=F.cloneGenome(genome),scale=amount/.16;
  for(const channel of CHANNELS){
    child.policyWeights[channel]=F.clamp(child.policyWeights[channel]+normal(random)*1.5*scale,-8,8);
    child.policyWeights[Learning.CHANNELS+channel]=F.clamp(child.policyWeights[Learning.CHANNELS+channel]+normal(random)*1.5*scale,-8,8);
  }
  const logit=value=>Math.atanh(F.clamp(value,-1+1e-12,1-1e-12)),last=child.policyWeights.length,correction=[0,0];
  for(const context of contexts){
    const before=F.makeBrain(graph),after=F.makeBrain(graph);before.activity.set(context.activity);after.activity.set(context.activity);let a,b;
    for(let step=0;step<4;step++){
      a=F.neuralStep(graph,before,genome,context.sensors,true,true,F.MAP_PHYSICS_ADAPTER_GAIN,F.MAP_NEURAL_MOTOR_LAUNCH_BIAS);
      b=F.neuralStep(graph,after,child,context.sensors,true,true,F.MAP_PHYSICS_ADAPTER_GAIN,F.MAP_NEURAL_MOTOR_LAUNCH_BIAS);
    }
    correction[0]+=logit(a[0])-logit(b[0]);correction[1]+=logit(a[1]-a[2])-logit(b[1]-b[2]);
  }
  child.policyWeights[last-2]=F.clamp(child.policyWeights[last-2]+correction[0]/contexts.length,-8,8);
  child.policyWeights[last-1]=F.clamp(child.policyWeights[last-1]+correction[1]/contexts.length,-8,8);
  child.policyWeights=Learning.scaleMutation(genome.policyWeights,child.policyWeights,1);return child;
}
function terminalOutcome(car,ticks){return {ticks,progressM:car.bestProgress/(car.pixelsPerMeter||1),laps:car.laps,lapTimes:car.lapTimes.slice(),
  safe:F.isSafeLearningOutcome(car),reason:car.reason||'',fitness:car.fitness,gas:car.outputs?.[1]??0,brake:car.outputs?.[2]??0,
  position:{x:car.x,y:car.y,heading:car.heading},speedMps:car.vehicle?.speedMps??0};}
function runLocal(graph,track,genome,state,experience,maxTicks=LOCAL_TICKS){
  const car=F.makeCar(track,0,F.cloneGenome(genome),'progress-3');
  Object.assign(car,{x:state.x,y:state.y,heading:state.heading,speed:state.speed,_physicsSpeed:state.speed},state.physics);
  car.footprintSensorsEnabled=state.footprintSensorsEnabled===true;car.vehicle=structuredClone(state.vehicle);
  car.brain=F.makeBrain(graph);car.brain.activity.set(state.activity);if(experience)car.brain.policyExperience=structuredClone(experience);
  F.Rewards.initialise(track,car,null,'progress-3');car.rewardState.along=state.along;
  let commands=state.outputs?.slice()||[0,0,0],ticks=0;
  for(;ticks<maxTicks&&car.alive;ticks++){
    if((ticks+(state.neuralPhase||0))%Learning.CONTROL_INTERVAL===0){
      car.inputs=F.sense(track,car);car.physicsInputs=F.physicsSense(car,track);car.sensorVector=car.inputs.concat(car.physicsInputs);
      commands=F.neuralStep(graph,car.brain,car.genome,car.sensorVector,true,true,F.MAP_PHYSICS_ADAPTER_GAIN,F.MAP_NEURAL_MOTOR_LAUNCH_BIAS);
      Learning.rememberActivity(car.brain);
    }
    F.drive(track,car,commands,F.DT);
  }
  if(car.alive)F.Rewards.finish(track,car,'fine prova locale');
  return {ticks,progressM:car.bestProgress/(car.pixelsPerMeter||1),laps:car.laps,safe:F.isSafeLearningOutcome(car),
    reason:car.reason||'',fitness:car.fitness,alongM:car.rewardState.along/(car.pixelsPerMeter||1),speedMps:car.vehicle?.speedMps??0,
    outputs:car.outputs.slice(),position:{x:car.x,y:car.y,heading:car.heading}};
}
function runFromStart(data,circuits,genome,seed){
  const sim=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed,mutation:0}),car=sim.cars[0];
  F.Rewards.initialise(sim.track,car,null,'progress-3');car.genome=F.cloneGenome(genome);sim.rewardRevision='progress-3';sim.running=true;
  let ticks=0,finished=null;sim.onTrialTick=s=>{if(!s.cars[0].alive&&!finished)finished=s.cars[0];};
  while(sim.generation===1&&ticks++<LIMIT_FULL)sim.tick();
  if(sim.generation===1||!finished)throw Error('Full-start candidate did not terminate');
  const result=terminalOutcome(finished,ticks);sim.running=false;return result;
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing terminal-practice report');
  const control=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-continued-20261020-01/report.json'),'utf8')),
    raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||
    state.population!==40||state.rewardRevision!=='progress-3'||control.save.sha256!==saveSha)throw Error('Exact protected V3/Monza generation-64 checkpoint required');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json')),
    originalDenseStep=Dense.step;Dense.step=(...args)=>Cuda.pass(...args);let populationSim=null,candidateSim=null;
  try{
    populationSim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
    P.validatePayload(decoded.payload,{graph:populationSim.graph,circuits:populationSim.circuits});P.restore(populationSim,state);
    const targetId=Number(control.treatment.results[0].safeProgressLeader.id),target=populationSim.cars.find(car=>car.id===targetId),
      spawnContext={sensors:target.sensorVector.slice(),activity:target.brain.activity.slice()},threshold=(populationSim.safeLearningFrontier?.progress||0)*.9,
      generation=populationSim.generation,terminal=new Map();let parent=null,ticks=0;populationSim.running=true;
    populationSim.onTrialTick=s=>{
      for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason||''});
      const car=s.cars.find(item=>item.id===targetId);
      if(car&&!parent&&car.encodingContext)parent={genome:F.cloneGenome(car.genome),launch:{sensors:car.encodingContext.sensors.slice(),activity:car.encodingContext.activity.slice()},crossing:null};
      if(parent&&!parent.crossing&&car?.bestProgress>=threshold&&(car.vehicle?.speedMps??0)>1&&car.sensorVector?.length)
        parent.crossing={tick:s.ticks,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),sensors:car.sensorVector.slice(),activity:car.brain.activity.slice()};
    };
    while(populationSim.generation===generation&&ticks++<60000)populationSim.tick();
    const expected=control.treatment.results[0].outcomes,observed=[...terminal.values()].sort((a,b)=>a.id-b.id);
    if(populationSim.generation===generation||terminal.size!==state.population||JSON.stringify(observed)!==JSON.stringify(expected)||!parent?.crossing)
      throw Error('Exact saved generation-64 baseline or sensory anchors did not reproduce');
    const contextAnchors=[spawnContext,parent.launch,parent.crossing],baseGenome=sensoryMutation(populationSim.graph,parent.genome,F.rng(20261121),.08,contextAnchors);
    candidateSim=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0});
    const seedCar=candidateSim.cars[0];seedCar.genome=F.cloneGenome(baseGenome);F.Rewards.initialise(candidateSim.track,seedCar,null,'progress-3');candidateSim.running=true;
    let candidateTicks=0,baseResult=null,practiceState=null,approachState=null,experience=null,baseBrainStats=null;
    candidateSim.onTrialTick=s=>{const car=s.cars[0],progressM=car.bestProgress/(s.track.pixelsPerMeter||1);
      if(!approachState&&car.alive&&progressM>=788&&(car.vehicle?.speedMps??0)>1&&s.ticks%candidateSim.neuralInterval===1){
        approachState=F.capturePracticeState(car);approachState.outputs=car.outputs.slice();approachState.neuralPhase=s.ticks%candidateSim.neuralInterval;
      }
      if(!car.alive&&!baseResult){baseResult=terminalOutcome(car,candidateTicks);practiceState=F.capturePracticeState(car);practiceState.outputs=car.outputs.slice();practiceState.neuralPhase=s.ticks%candidateSim.neuralInterval;experience=structuredClone(car.brain.policyExperience||null);
        baseBrainStats={experienceSamples:car.brain.policyExperience?.samples??0,experienceCentres:car.brain.policyExperience?.centres?.length??0};}};
    while(candidateSim.generation===1&&candidateTicks++<LIMIT_FULL)candidateSim.tick();
    if(candidateSim.generation===1||!baseResult||baseResult.progressM<780)throw Error('Expected locally improvable real V3 sensory candidate did not reach the verified corner state');
    const specs=[];for(let i=0;i<48;i++){
      const focus=['steering','longitudinal',null][i%3],amount=FOCUSED_AMOUNT[Math.floor(i/12)],seed=20262000+i,
        genome=F.cloneGenome(baseGenome);
      genome.policyWeights=Learning.safeMotorMutation(candidateSim.graph,baseGenome.policyWeights,F.rng(seed),amount,experience,focus);
      specs.push({id:i,seed,focus:focus||'joint',amount,genome});
    }
    const localState=approachState||practiceState,baselineLocal=runLocal(candidateSim.graph,candidateSim.track,baseGenome,localState,experience),localResults=[];
    for(let i=0;i<specs.length;i++){
      const spec=specs[i],result=runLocal(candidateSim.graph,candidateSim.track,spec.genome,localState,experience);
      localResults.push({id:spec.id,seed:spec.seed,focus:spec.focus,amount:spec.amount,result});
      if((i+1)%12===0)console.log('TERMINAL_PRACTICE_PROGRESS '+JSON.stringify({evaluated:i+1,total:specs.length,bestSafeProgressM:Math.max(0,...localResults.filter(v=>v.result.safe).map(v=>v.result.progressM))}));
    }
    const top=localResults.toSorted((a,b)=>(b.result.safe-a.result.safe)||b.result.progressM-a.result.progressM||b.result.fitness-a.result.fitness).slice(0,4),fullStart=[];
    for(const row of top){const variant=specs.find(spec=>spec.id===row.id);fullStart.push({id:row.id,focus:row.focus,amount:row.amount,local:row.result,full:runFromStart(data,circuits,variant.genome,state.seed)});}
    const gpu=Cuda.stats(),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,
      report={format:'male-cns-saved-v3-terminal-state-practice-search-v1',appVersion:'5.6.0',passed:true,
        learningSucceeded:fullStart.some(row=>row.full.safe&&row.full.laps>=2),
        save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
        baseline:{allFortyOutcomesMatched:true,leaderId:targetId,safeLeaderProgressM:control.treatment.results[0].safeProgressLeader.progressM,
          frontierThresholdM:threshold,movingContext:{tick:parent.crossing.tick,progressM:parent.crossing.progressM}},
        seedCandidate:{amount:.08,mutationSeed:20261121,channels:CHANNELS,outcome:baseResult,terminalNeuralExperience:baseBrainStats,
          context:{alongM:practiceState.along/(candidateSim.track.pixelsPerMeter||1),x:practiceState.x,y:practiceState.y,heading:practiceState.heading,
            speedMps:practiceState.speed,neuralActivityCount:practiceState.activity.length}},
        localSearchStart:{type:approachState?'moving approach immediately before the saved candidate stops':'terminal stopped state fallback',
          context:{alongM:localState.along/(candidateSim.track.pixelsPerMeter||1),x:localState.x,y:localState.y,heading:localState.heading,
            speedMps:localState.speed,neuralPhase:localState.neuralPhase,outputs:localState.outputs}},
        localBaseline:baselineLocal,localSearch:{candidateCount:localResults.length,horizonTicks:LOCAL_TICKS,
          method:'48 bounded policy mutations (steering-only, longitudinal-only, and joint) evaluated from the same actually reached stopped neural/vehicle state. Weights mutate only the MaleCNS policy readout; no actions, path, target steering, or artificial sensor data are injected.',
          summary:{safeCount:localResults.filter(v=>v.result.safe).length,maxSafeProgressM:Math.max(0,...localResults.filter(v=>v.result.safe).map(v=>v.result.progressM)),
            lapCount:Math.max(0,...localResults.map(v=>v.result.laps))},top:top.map(({genome,...row})=>row)},
        fullStartValidation:fullStart,gpu,sourceHashes:Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','progress-save.js'].map(file=>[file,sha(fs.readFileSync(path.join(root,'outputs',file)))])),
        boundary:'A local practice improvement is a search signal only. The strongest candidates are replayed from the true start; no candidate is promoted unless its complete same-start run improves. The saved V3 file, application sources, version, tag, release, portable and installer are not written.'};
    if(!saveUnchanged||gpu.cpuFallbacks!==0||gpu.gpuCalls===0||localResults.length!==48||fullStart.length!==top.length)throw Error('Save, CUDA or candidate-count verification failed');
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('TERMINAL_PRACTICE_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,base:baseResult,
      localBaseline:baselineLocal,localSummary:report.localSearch.summary,top:report.localSearch.top,fullStart:fullStart.map(row=>({id:row.id,focus:row.focus,amount:row.amount,localProgressM:row.local.progressM,localSafe:row.local.safe,fullProgressM:row.full.progressM,fullLaps:row.full.laps,fullSafe:row.full.safe,fullReason:row.full.reason})),gpu,report:path.join(out,'report.json')}));
  }finally{candidateSim&&(candidateSim.running=false);populationSim&&(populationSim.running=false);Dense.step=originalDenseStep;Cuda.close();}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
