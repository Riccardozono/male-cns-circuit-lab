'use strict';
// Bounded two-actuator readout search from the exact saved V3/Monza failure
// context. Steering and longitudinal channels remain MaleCNS readouts; only
// their learned coefficients are perturbed, and full physics ranks outcomes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-directed-joint-readout-20261021-01');
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Dense=require(path.join(root,'outputs/dense-neural.js')),
  Learning=require(path.join(root,'outputs/neural-learning.js')),Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0),atanh=v=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,v)));
const vector=features=>[...features.map(v=>v/Math.sqrt(features.length)),1],STEER_TARGETS=[-.5,-.25,0,.25,.5],GAS_TARGETS=[.1,.2,.35,.5],MAX_CONTROLS=12000;
function logit(features,weights,policy,action){let result=weights.at(-2+action);for(let j=0;j<policy.nodes.length;j++)result+=features[j]*weights[policy.readoutOffset+j*2+action]/Math.sqrt(policy.nodes.length);return result;}
function changeAction(weights,features,anchorFeatures,policy,action,desired){
  const before=weights.slice(),v=vector(features),a=vector(anchorFeatures),projection=dot(v,a)/dot(a,a),direction=v.map((x,i)=>x-projection*a[i]),sensitivity=dot(v,direction);
  if(Math.abs(sensitivity)<1e-9)throw Error('No readout direction independent of the moving-context anchor');
  const prior=Math.tanh(logit(features,weights,policy,action)),deltaLogit=atanh(desired)-logit(features,weights,policy,action),step=direction.map(x=>x*deltaLogit/sensitivity);
  const indices=Array.from({length:policy.nodes.length},(_,j)=>policy.readoutOffset+j*2+action);indices.push(weights.length-2+action);
  let shrink=1;for(let j=0;j<indices.length;j++)if(step[j])shrink=Math.min(shrink,(8-Math.abs(weights[indices[j]]))/Math.abs(step[j]));shrink=Math.max(0,Math.min(1,shrink));
  for(let j=0;j<indices.length;j++)weights[indices[j]]+=step[j]*shrink;
  return {prior,desired:Math.tanh(logit(features,weights,policy,action)),weightBoundScale:shrink,changed:indices.filter(index=>weights[index]!==before[index]).length,
    anchorBefore:Math.tanh(logit(anchorFeatures,before,policy,action)),anchorAfter:Math.tanh(logit(anchorFeatures,weights,policy,action))};
}
function terminalOutcome(car,ticks,wallSeconds){return {ticks,wallSeconds,progressM:car.bestProgress/(car.pixelsPerMeter||1),laps:car.laps,lapTimes:car.lapTimes.slice(),
  safe:F.isSafeLearningOutcome(car),reason:car.reason||'',fitness:car.fitness,steer:car.outputs?.[0]??0,gas:car.outputs?.[1]??0,brake:car.outputs?.[2]??0,speedMps:car.vehicle?.speedMps??0};}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');if(fs.existsSync(out))throw Error('Refusing to overwrite an existing joint-readout benchmark');
  const control=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-continued-20261020-01/report.json'),'utf8')),
    raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3'||control.save.sha256!==saveSha)
    throw Error('Exact protected V3/Monza generation-64 checkpoint required');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json')),
    originalDenseStep=Dense.step;Dense.step=(...args)=>Cuda.pass(...args);let populationSim=null;
  try{
    populationSim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
    P.validatePayload(decoded.payload,{graph:populationSim.graph,circuits:populationSim.circuits});P.restore(populationSim,state);
    const targetId=Number(control.treatment.results[0].safeProgressLeader.id),target=populationSim.cars.find(car=>car.id===targetId),targetBrain=target?.brain;
    if(!target||!targetBrain)throw Error('Saved progress leader is missing');
    const generation=populationSim.generation,terminal=new Map();let parent=null,ticks=0;populationSim.running=true;
    populationSim.onTrialTick=s=>{for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason||''});
      const car=s.cars.find(item=>item.id===targetId);if(car&&!car.alive&&!parent)parent={genome:F.cloneGenome(car.genome),features:Array.from(car.brain.policyFeatures||[]),experience:structuredClone(car.brain.policyExperience||null),
        outcome:{progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason||'',steer:car.outputs[0],gas:car.outputs[1],brake:car.outputs[2]}};};
    while(populationSim.generation===generation&&ticks++<60000)populationSim.tick();
    if(populationSim.generation===generation||terminal.size!==state.population||!parent?.experience)throw Error('Saved population did not exactly complete');
    const observed=[...terminal.values()].sort((a,b)=>a.id-b.id),expected=control.treatment.results[0].outcomes;
    if(JSON.stringify(observed)!==JSON.stringify(expected))throw Error('Protected generation-64 physical baseline changed');
    const policy=populationSim.graph.learning,anchor=parent.experience.centres.slice().sort((a,b)=>b.count-a.count)[0];
    if(parent.features.length!==policy.nodes.length||!anchor)throw Error('Terminal or moving neural context missing');
    const parentGenome=parent.genome,initialSteer=Math.tanh(logit(parent.features,parentGenome.policyWeights,policy,0)),initialGasBrake=Math.tanh(logit(parent.features,parentGenome.policyWeights,policy,1)),variants=[];
    for(const gasTarget of GAS_TARGETS)for(const steerTarget of STEER_TARGETS){
      const weights=parentGenome.policyWeights.slice(),steering=changeAction(weights,parent.features,anchor.values,policy,0,steerTarget),longitudinal=changeAction(weights,parent.features,anchor.values,policy,1,gasTarget);
      variants.push({steerTarget,gasTarget,steering,longitudinal,genome:{...F.cloneGenome(parentGenome),policyWeights:weights}});
    }
    const results=[];
    for(let index=0;index<variants.length;index++){
      const variant=variants[index],sim=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0}),car=sim.cars[0];
      car.genome=F.cloneGenome(variant.genome);F.Rewards.initialise(sim.track,car,null,'progress-3');sim.running=true;
      let steps=0,finished=null,last=performance.now();sim.onTrialTick=s=>{const c=s.cars[0];if(!c.alive&&!finished)finished=c;
        if(performance.now()-last>25000){last=performance.now();console.log('JOINT_READOUT_PROGRESS '+JSON.stringify({candidate:index+1,total:variants.length,ticks:s.ticks,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),laps:c.laps,steerTarget:variant.steerTarget,gasTarget:variant.gasTarget}));}};
      const start=performance.now();while(sim.generation===1&&steps++<MAX_CONTROLS)sim.tick();const wallSeconds=(performance.now()-start)/1000;
      if(sim.generation===1||!finished)throw Error(`Candidate ${index+1} exceeded ${MAX_CONTROLS} controls without a terminal outcome`);
      results.push({steerTarget:variant.steerTarget,gasTarget:variant.gasTarget,steering:variant.steering,longitudinal:variant.longitudinal,outcome:terminalOutcome(finished,steps,wallSeconds)});sim.running=false;
    }
    const ranked=results.slice().sort((a,b)=>Number(b.outcome.safe)-Number(a.outcome.safe)||b.outcome.progressM-a.outcome.progressM||b.outcome.fitness-a.outcome.fitness),gpu=Cuda.stats();
    const report={format:'male-cns-saved-v3-directed-joint-readout-v1',appVersion:'5.6.0',passed:true,learningSucceeded:ranked.some(r=>r.outcome.safe&&r.outcome.laps>=2),
      save:{sha256:saveSha,unchanged:sha(fs.readFileSync(savePath))===saveSha,model:'V3',circuit:'Monza',generation:state.generation,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
      baseline:{allFortyOutcomesMatched:true,leaderId:targetId,leader:parent.outcome,experienceSamples:parent.experience.samples,contextCentres:parent.experience.centres.length,
        anchorCount:anchor.count,anchorFeatureRmsToTerminal:rms(parent.features,anchor.values),terminalSteer:initialSteer,terminalGasMinusBrake:initialGasBrake},
      method:'The exact 40-car saved generation is replayed on the verified CUDA path and must match every protected terminal outcome. Twenty one-episode variants then change only the learned steering and longitudinal readout coefficients around the observed terminal neuronal activation, while projecting out the most-observed moving neural context. This is a bounded policy-weight search; every candidate receives the same real physics, sensor feedback, track, start, and progress-3 reward. No live action override, route, coordinates, speed, lap/time, teacher, save migration or promotion is used.',
      candidateCount:results.length,ranked:ranked.slice(0,10),results,gpu,
      sourceHashes:Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','progress-save.js'].map(file=>[file,sha(fs.readFileSync(path.join(root,'outputs',file)))])),
      boundary:'One saved parent, seed and circuit. This search can locate a local readout direction but cannot establish general learning or a complete generation. User save, app source, version and release are not written.'};
    if(!report.save.unchanged||gpu.cpuFallbacks!==0||gpu.gpuCalls===0||results.length!==STEER_TARGETS.length*GAS_TARGETS.length)throw Error('Save integrity, CUDA, or candidate-count verification failed');
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('JOINT_READOUT_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,baseline:report.baseline,
      top:report.ranked.slice(0,8).map(row=>({steerTarget:row.steerTarget,gasTarget:row.gasTarget,...row.outcome})),gpu,report:path.join(out,'report.json')}));
  }finally{Dense.step=originalDenseStep;populationSim?.running&&(populationSim.running=false);Cuda.close();}
}
const rms=(a,b)=>Math.sqrt(a.reduce((sum,value,i)=>sum+(value-b[i])**2,0)/a.length);
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
