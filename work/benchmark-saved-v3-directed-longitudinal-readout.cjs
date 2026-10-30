'use strict';
// Research-only search over the real MaleCNS longitudinal readout. Each
// candidate changes only learned motor coefficients in a neural context
// measured from the saved V3 leader; the complete physical rollout decides.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-directed-longitudinal-readout-20261021-01');
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Learning=require(path.join(root,'outputs/neural-learning.js')),
  Dense=require(path.join(root,'outputs/dense-neural.js')),Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
const motorVector=features=>[...features.map(value=>value/Math.sqrt(features.length)),1];
const orthogonal=(a,b)=>{const scale=dot(a,b)/dot(b,b);return a.map((value,i)=>value-scale*b[i]);};
const atanh=value=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,value)));
const desiredThrottle=[.05,.15,.3,.5],MAX_CONTROLS=12000;
function vectorLogit(features,weights,policy){let result=weights.at(-1);for(let j=0;j<policy.nodes.length;j++)result+=features[j]*weights[policy.readoutOffset+j*2+1]/Math.sqrt(policy.nodes.length);return result;}
function makeCandidate(parent,features,anchorFeatures,policy,desired){
  const weights=parent.policyWeights.slice(),baseLogit=vectorLogit(features,weights,policy),baseOutput=Math.tanh(baseLogit),wantedLogit=atanh(desired),requestedDelta=wantedLogit-baseLogit;
  const v=motorVector(features),a=motorVector(anchorFeatures),direction=orthogonal(v,a),sensitivity=dot(v,direction);
  if(!(Math.abs(sensitivity)>1e-9))throw Error('Terminal neural context has no safe readout direction distinct from the moving anchor');
  const step=direction.map(value=>value*requestedDelta/sensitivity),indices=Array.from({length:policy.nodes.length},(_,j)=>policy.readoutOffset+j*2+1);indices.push(weights.length-1);
  let shrink=1;for(let j=0;j<indices.length;j++)if(step[j])shrink=Math.min(shrink,(8-Math.abs(weights[indices[j]]))/Math.abs(step[j]));shrink=Math.max(0,Math.min(1,shrink));
  for(let j=0;j<indices.length;j++)weights[indices[j]]+=step[j]*shrink;
  return {adapterVersion:parent.adapterVersion,policyWeights:weights,diagnostics:{desiredThrottle:desired,baseReadoutOutput:baseOutput,requestedLogitDelta:requestedDelta,
    appliedLogitDelta:vectorLogit(features,weights,policy)-baseLogit,resultingReadoutOutput:Math.tanh(vectorLogit(features,weights,policy)),anchorOutputBefore:Math.tanh(vectorLogit(anchorFeatures,parent.policyWeights,policy)),
    anchorOutputAfter:Math.tanh(vectorLogit(anchorFeatures,weights,policy)),readoutWeightsChanged:indices.filter((index,j)=>weights[index]!==parent.policyWeights[index]).length,weightBoundScale:shrink}};
}
function outcome(car,ticks,wallSeconds){return {ticks,wallSeconds,fitness:car.fitness,progressM:car.bestProgress/(car.pixelsPerMeter||1),laps:car.laps,lapTimes:car.lapTimes.slice(),
  safe:F.isSafeLearningOutcome(car),reason:car.reason||'',gas:car.outputs?.[1]??null,brake:car.outputs?.[2]??null,steer:car.outputs?.[0]??null,speedMps:car.vehicle?.speedMps??0};}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');if(fs.existsSync(out))throw Error('Refusing to overwrite an existing directed-readout benchmark');
  const control=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-continued-20261020-01/report.json'),'utf8'));
  const raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3'||control.save.sha256!==saveSha)
    throw Error('Exact protected V3/Monza generation-64 checkpoint required');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json'));
  const originalDenseStep=Dense.step;Dense.step=(...args)=>Cuda.pass(...args);let populationSim=null;
  try{
    populationSim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
    P.validatePayload(decoded.payload,{graph:populationSim.graph,circuits:populationSim.circuits});P.restore(populationSim,state);
    const targetId=Number(control.treatment.results[0].safeProgressLeader.id),target=populationSim.cars.find(car=>car.id===targetId),targetBrain=target?.brain;
    if(!target||!targetBrain)throw Error('Saved progress leader is missing');
    const generation=populationSim.generation,terminal=new Map();let leader=null,ticks=0,lastLog=performance.now();populationSim.running=true;
    populationSim.onTrialTick=s=>{
      for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason||''});
      const car=s.cars.find(item=>item.id===targetId);
      if(car&&!car.alive&&!leader)leader={genome:F.cloneGenome(car.genome),features:Array.from(car.brain.policyFeatures||[]),experience:structuredClone(car.brain.policyExperience||null),
        outcome:{progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason||'',gas:car.outputs[1],brake:car.outputs[2],speedMps:car.vehicle?.speedMps??0}};
      if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('DIRECTED_READOUT_BASE_PROGRESS '+JSON.stringify({ticks:s.ticks,alive:s.cars.filter(item=>item.alive).length,leaderProgressM:target.bestProgress/(s.track.pixelsPerMeter||1)}));}
    };
    while(populationSim.generation===generation&&ticks++<60000)populationSim.tick();
    if(populationSim.generation===generation||terminal.size!==state.population||!leader?.experience||leader.features.length!==populationSim.graph.learning.nodes.length)
      throw Error('Exact parent generation or leader-context capture failed');
    const observed=[...terminal.values()].sort((a,b)=>a.id-b.id),expected=control.treatment.results[0].outcomes;
    if(JSON.stringify(observed)!==JSON.stringify(expected))throw Error('Saved V3 physical baseline changed before candidate evaluation');
    const policy=populationSim.graph.learning,experience=leader.experience,anchor=experience.centres.slice().sort((a,b)=>b.count-a.count)[0];
    if(!anchor)throw Error('Moving context anchor is missing');
    const parent=leader.genome,variants=[];
    for(const desired of desiredThrottle){const candidate=makeCandidate(parent,leader.features,anchor.values,policy,desired);variants.push({...candidate,genome:{...F.cloneGenome(parent),policyWeights:candidate.policyWeights.slice()}});}
    const results=[];
    for(let index=0;index<variants.length;index++){
      const variant=variants[index],sim=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0}),car=sim.cars[0];
      car.genome=F.cloneGenome(variant.genome);F.Rewards.initialise(sim.track,car,null,'progress-3');sim.running=true;
      let steps=0,terminalCar=null,last=performance.now();sim.onTrialTick=s=>{const current=s.cars[0];if(!current.alive&&!terminalCar)terminalCar=current;
        if(performance.now()-last>20000){last=performance.now();console.log('DIRECTED_READOUT_VARIANT_PROGRESS '+JSON.stringify({candidate:index+1,desiredThrottle:variant.diagnostics.desiredThrottle,ticks:s.ticks,progressM:current.bestProgress/(s.track.pixelsPerMeter||1),laps:current.laps,speedMps:current.vehicle?.speedMps??0}));}};
      const started=performance.now();while(sim.generation===1&&steps++<MAX_CONTROLS)sim.tick();const wallSeconds=(performance.now()-started)/1000;
      if(sim.generation===1||!terminalCar)throw Error(`Candidate ${index+1} did not terminate within ${MAX_CONTROLS} controls`);
      results.push({...variant.diagnostics,outcome:outcome(terminalCar,steps,wallSeconds)});sim.running=false;
    }
    const gpu=Cuda.stats(),report={format:'male-cns-saved-v3-directed-longitudinal-readout-v1',appVersion:'5.6.0',passed:true,
      learningSucceeded:results.some(result=>result.outcome.safe&&result.outcome.laps>=2),
      save:{sha256:saveSha,unchanged:sha(fs.readFileSync(savePath))===saveSha,model:'V3',circuit:'Monza',generation:state.generation,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
      baseline:{populationGeneration:state.generation,targetId,allFortyOutcomesMatched:true,leader:leader.outcome,leaderContextSamples:experience.samples,leaderContextCentres:experience.centres.length,
        anchorCount:anchor.count,anchorFeatureRmsToTerminal:rms(leader.features,anchor.values),anchorCommand:Math.tanh(vectorLogit(anchor.values,parent.policyWeights,policy)),
        terminalReadoutCommand:Math.tanh(vectorLogit(leader.features,parent.policyWeights,policy))},
      method:'Replay the exact saved population once on the verified CUDA neural pass, then create four mutations of only the existing MaleCNS longitudinal motor readout. The readout step increases gas-minus-brake at the measured terminal neuronal activation while projecting out the most-observed neural-context direction, preserving that moving-context response. Candidates are judged only by full Monza physics, the unchanged V3 controller structure and progress-3 reward. No route, position, speed, lap, teacher, runtime action override, save migration, or promotion is used.',
      variants:results,gpu,sourceHashes:Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','progress-save.js'].map(file=>[file,sha(fs.readFileSync(path.join(root,'outputs',file)))])),
      boundary:'One saved model, one circuit and one seed. This is a readout-mutation experiment, not general convergence evidence. No user save, application source, version or release is written.'};
    if(!report.save.unchanged||gpu.cpuFallbacks!==0||gpu.gpuCalls===0||results.length!==desiredThrottle.length)throw Error('Save integrity, CUDA, or candidate-count verification failed');
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('DIRECTED_READOUT_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,baseline:report.baseline,
      variants:results.map(row=>({desiredThrottle:row.desiredThrottle,achievedThrottle:row.resultingReadoutOutput,...row.outcome})),gpu,report:path.join(out,'report.json')}));
  }finally{Dense.step=originalDenseStep;populationSim?.running&&(populationSim.running=false);Cuda.close();}
}
const rms=(a,b)=>Math.sqrt(a.reduce((sum,value,i)=>sum+(value-b[i])**2,0)/a.length);
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
