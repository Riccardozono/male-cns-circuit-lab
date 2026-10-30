'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const F=require('../outputs/simulation.js'),Legacy=require('../outputs/legacy-models.js'),Progress=require('../outputs/progress-save.js'),circuits=require('../outputs/data/circuits.json'),connectome=require('../outputs/data/connectome.json');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-side-sensor-response-20261021-01');
const expectedPath=path.join(root,'.impeccable/review/learning-ml/saved-v3-practice-sensory-parity-20261021-01/report.json');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function copyBrain(brain){return Object.fromEntries(Object.entries(brain).map(([key,value])=>[key,ArrayBuffer.isView(value)?value.slice():Array.isArray(value)?value.slice():value]));}
function commands(graph,brain,genome,sensors){return F.neuralStep(graph,copyBrain(brain),genome,sensors,true,true,F.MAP_PHYSICS_ADAPTER_GAIN,F.MAP_NEURAL_MOTOR_LAUNCH_BIAS);}
async function main(){
  assert.equal(process.versions.node,'24.19.0','Pinned Node 24.19.0 runtime required');
  assert.ok(fs.existsSync(savePath),'The original V3/Monza save is required');assert.ok(fs.existsSync(expectedPath),'A verified generation-64 replay baseline is required');assert.ok(!fs.existsSync(out),'Refusing to overwrite a previous sensor audit');
  const raw=fs.readFileSync(savePath),saveHash=sha(raw),decoded=await Progress.decode(raw.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state,expected=JSON.parse(fs.readFileSync(expectedPath,'utf8'));
  assert.equal(decoded.appVersion,'5.6.0');assert.equal(decoded.payload.modelId,'v3');assert.equal(decoded.payload.circuitId,'monza');assert.equal(state.generation,64);assert.equal(state.population,40);assert.equal(state.seed,7717);assert.equal(expected.save.sha256,saveHash);
  const data=Legacy.tagV3(connectome),descriptor=new F.Simulation(data,{modelId:'v3',population:4,circuitId:'monza',circuits,seed:state.seed});Progress.validatePayload(decoded.payload,{graph:descriptor.graph,circuits:descriptor.circuits});
  const sim=new F.Simulation(data,{modelId:'v3',population:4,circuitId:'monza',circuits,seed:state.seed});Progress.restore(sim,structuredClone(state));sim.running=true;
  const samples=new Map();let terminal=null,ticks=0;
  sim.onTrialTick=s=>{
    const ppm=s.track.pixelsPerMeter||1;
    for(const car of s.cars){
      if(!car.alive||!car.genome?.policyWeights||!car.brain?.policyFeatures)continue;
      const position=F.locate(s.track,car.x,car.y),progressM=car.bestProgress/ppm,speedMps=Number(car.vehicle?.speedMps??car.speed)||0,nearAsymmetry=Number(car.physicsInputs?.[7])||0,averageClearance=Number(car.physicsInputs?.[10])||0;
      if(position.along/ppm<650||position.along/ppm>900||speedMps<10||Math.abs(nearAsymmetry)<.4)continue;
      const prior=samples.get(car.id);if(prior&&prior.progressM>=progressM)continue;
      samples.set(car.id,{id:car.id,progressM,alongM:position.along/ppm,speedMps,nearAsymmetry,averageClearance,liveOutputs:car.slowOutputs?.slice()??car.outputs?.slice()??null,sensors:Array.from(car.sensorVector),brain:copyBrain(car.brain),genome:{...car.genome,policyWeights:car.genome.policyWeights.slice()}});
    }
    if(s.cars.every(car=>!car.alive))terminal=s.cars.filter(car=>!car.diagnosticVehicle).map(car=>({id:car.id,progressM:car.bestProgress/ppm,laps:car.laps,reason:car.reason})).sort((a,b)=>a.id-b.id);
  };
  while(sim.generation===64&&ticks<14000){sim.tick();ticks++;}
  assert.ok(terminal&&sim.generation>64,'Generation 64 did not end naturally');assert.ok(samples.size>0,'No high-speed near-edge neural context was observed');
  assert.deepEqual(terminal,expected.records[0].outcomes,'The exact saved generation-64 physical replay changed');
  const selected=[...samples.values()].sort((a,b)=>b.progressM-a.progressM).slice(0,5),channelNames={18:'near-side asymmetry',19:'far-side asymmetry',20:'front footprint clearance',21:'average near-side footprint clearance'};
  const probes=selected.map(sample=>{
    const baseline=commands(sim.graph,sample.brain,sample.genome,sample.sensors),deterministic=commands(sim.graph,sample.brain,sample.genome,sample.sensors);assert.deepEqual(deterministic,baseline,'Same saved state and sensor vector must yield identical actions');
    const perturbations=[];
    for(const channel of [18,19,20,21])for(const delta of [-.25,.25]){
      const sensors=sample.sensors.slice(),signed=channel===18||channel===19;sensors[channel]=Math.max(signed?-1:0,Math.min(1,sensors[channel]+delta));
      const output=commands(sim.graph,sample.brain,sample.genome,sensors);
      perturbations.push({channel,name:channelNames[channel],deltaRequested:delta,deltaApplied:sensors[channel]-sample.sensors[channel],outputs:output,actionDelta:output.map((value,index)=>value-baseline[index])});
    }
    const maximumDeltaBySensor=Object.fromEntries([18,19,20,21].map(channel=>[channel,Math.max(0,...perturbations.filter(item=>item.channel===channel).flatMap(item=>item.actionDelta.map(Math.abs)))]));
    return {id:sample.id,progressM:sample.progressM,alongM:sample.alongM,speedMps:sample.speedMps,nearAsymmetry:sample.nearAsymmetry,averageClearance:sample.averageClearance,liveOutputs:sample.liveOutputs,oneStepBaseline:baseline,maximumDeltaBySensor,perturbations};
  });
  const unchanged=sha(fs.readFileSync(savePath))===saveHash;assert.equal(unchanged,true,'Original save changed during audit');
  const report={format:'male-cns-saved-v3-side-sensor-response-v1',appVersion:'5.6.0',passed:true,learningSucceeded:null,save:{sha256:saveHash,unchanged,model:'V3',circuit:'Monza',generation:64,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},baselineReplayMatched:true,ticksToGenerationEnd:ticks,observedHighSpeedEdgeContexts:samples.size,perturbationMethod:'Replay exact live neural state on cloned brains. Perturb only existing road physics channels by +/-0.25, clamp to documented sensor ranges, then compare one recurrent control update. No car is moved by a probe; no target action or route is supplied.',sensorChannelMap:{18:'near-side asymmetry',19:'far-side asymmetry',20:'front footprint clearance',21:'average near-side footprint clearance'},probes,sourceHashes:{simulation:sha(fs.readFileSync(path.join(root,'outputs/simulation.js'))),learning:sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js')))},boundary:'Local one-step sensitivity audit only, not counterfactual vehicle trajectories or proof of learning. No app source, version, release, model weights, or user save was changed.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,baselineReplayMatched:true,observedHighSpeedEdgeContexts:samples.size,probes:probes.map(({id,alongM,speedMps,nearAsymmetry,maximumDeltaBySensor})=>({id,alongM,speedMps,nearAsymmetry,maximumDeltaBySensor})),saveUnchanged:unchanged,report:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
