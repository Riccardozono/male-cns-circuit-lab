'use strict';
// Diagnostic only: replay the verified V3/Monza gen.109 champion, capture a
// real moving state near its failure area, and branch short open-loop physics
// probes. No controller, reward, save, or production source is modified.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),
  savePath=path.join(root,'.impeccable/review/learning-ml/saved-v3-crossover-100-continuous-batch-cuda-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen109.malecns-save'),
  out=path.join(root,'.impeccable/review/learning-ml/probe-v3-gen109-counterfactual-steering-20261022-01');
const expectedSaveSha='c17030e2d26ec235521269aa89a4474222fe7d7ae350ceb73286cfad2c498f96';
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Dense=require(path.join(root,'outputs/dense-neural.js')),
  Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/data/circuits.json','outputs/data/connectome.json'];
const hashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
const progressOf=(track,car,startAlong)=>{
  const p=F.locate(track,car.x,car.y);let delta=p.along-startAlong;
  if(delta>track.total/2)delta-=track.total;if(delta< -track.total/2)delta+=track.total;
  return {alongM:p.along/(track.pixelsPerMeter||1),deltaFromStartM:delta/(track.pixelsPerMeter||1)};
};
function branch(track,ground,start,commands,name,seconds=2){
  const car=structuredClone(start.car),dt=1/60,steps=Math.round(seconds/dt),samples=[];
  const sample=t=>{const position=progressOf(track,car,start.along),onRoad=F.onRoad(track,car.x,car.y),collision=F.collided(track,car);
    return {seconds:t,...position,x:car.x,y:car.y,heading:car.heading,speedMps:car.vehicle.speedMps,yawRate:car.vehicle.r,
      steeringCommand:commands[0],throttleCommand:commands[1],brakeCommand:commands[2],onRoad,collision};};
  samples.push(sample(0));
  for(let i=0;i<steps;i++){
    F.Vehicle.step(car,commands,dt,ground);
    if((i+1)%30===0||i===steps-1)samples.push(sample((i+1)*dt));
    const last=samples.at(-1);if(last.collision||!last.onRoad)break;
  }
  return {name,commands,openLoopSeconds:seconds,samples,stoppedAtBoundary:Boolean(samples.at(-1).collision||!samples.at(-1).onRoad)};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error(`Refusing to overwrite existing diagnostic output: ${out}`);
  const raw=fs.readFileSync(savePath),saveSha=sha(raw);
  if(saveSha!==expectedSaveSha)throw Error('Research checkpoint hash differs from the verified gen.109 input');
  const decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==109||state.seed!==7717||state.population!==100||state.rewardRevision!=='progress-3')throw Error('Expected verified V3/Monza gen.109 research checkpoint');
  if(!Array.isArray(state.genomes)||state.genomes.length!==100||!state.genomes[0]?.policyWeights)throw Error('Checkpoint champion policy is missing');
  if(JSON.stringify(state.genomes[0].policyWeights)!==JSON.stringify(state.champion?.policyWeights??state.champion))throw Error('Checkpoint genome 0 does not match its champion');
  const circuits=require(path.join(root,'outputs/data/circuits.json')),data=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),
    beforeSources=hashes(),originalDenseStep=Dense.step,sim=new F.Simulation(Legacy.tagV3(data),{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0});
  P.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});
  sim.rewardRevision=state.rewardRevision;sim.stagnation=state.stagnation;sim.safeLearningFrontier={...state.learningFrontier};sim.spawn([F.cloneGenome(state.genomes[0])]);
  const target=sim.cars[0],ppm=sim.track.pixelsPerMeter||1;let start=null;
  const originalVehicleStep=F.Vehicle.step;
  Dense.step=(...args)=>Cuda.pass(...args);
  F.Vehicle.step=(car,commands,dt,ground)=>{
    if(!start&&car===target&&car.alive&&car.bestProgress/ppm>=770&&car.bestProgress/ppm<=785&&car.vehicle?.speedMps>=8){
      const position=progressOf(sim.track,car,0);start={car:structuredClone(car),commands:commands.slice(),tick:sim.ticks,progressM:car.bestProgress/ppm,
        along:position.alongM*ppm,onRoad:F.onRoad(sim.track,car.x,car.y),collision:F.collided(sim.track,car),sensors:{visual:car.inputs?.slice(),physics:car.physicsInputs?.slice()}};
    }
    return originalVehicleStep(car,commands,dt,ground);
  };
  const startingGeneration=sim.generation;let ticks=0;
  try{while(sim.generation===startingGeneration&&ticks<10000){sim.tick();ticks++;}}
  finally{F.Vehicle.step=originalVehicleStep;Dense.step=originalDenseStep;}
  if(!start)throw Error('No actual moving boundary state was captured from the saved champion');
  const ground=F.Vehicle.Terrain.forTrack(sim.track),actual=start.commands,
    actions=[
      {name:'policy-command-held',commands:actual},
      {name:'policy-steering-brake-released',commands:[actual[0],.12,0]},
      {name:'straight-throttle-no-brake',commands:[0,.12,0]},
      {name:'steer-plus-008-throttle-no-brake',commands:[.08,.12,0]},
      {name:'steer-minus-008-throttle-no-brake',commands:[-.08,.12,0]},
      {name:'steer-plus-016-throttle-no-brake',commands:[.16,.12,0]},
      {name:'steer-minus-016-throttle-no-brake',commands:[-.16,.12,0]}
    ],branches=actions.map(item=>branch(sim.track,ground,start,item.commands,item.name));
  const afterSources=hashes(),sourceFilesUnchanged=JSON.stringify(beforeSources)===JSON.stringify(afterSources),inputUnchanged=sha(fs.readFileSync(savePath))===saveSha,
    cuda=Cuda.stats(),report={format:'male-cns-v3-gen109-counterfactual-boundary-steering-probe-v1',appVersion:'5.6.0',
      passed:Boolean(sourceFilesUnchanged&&inputUnchanged&&cuda.gpuCalls>0&&cuda.cpuFallbacks===0&&start.onRoad&&!start.collision),learningSucceeded:false,
      input:{path:savePath,sha256:saveSha,model:'V3',circuit:'Monza',generation:109,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision,unchanged:inputUnchanged},
      replay:{ticks,generationEnded:sim.generation!==startingGeneration,terminalProgressM:target.bestProgress/ppm,terminalLaps:target.laps,terminalReason:target.reason,terminalCommands:target.outputs},
      capturedStart:{tick:start.tick,progressM:start.progressM,alongM:start.along/(ppm||1),speedMps:start.car.vehicle.speedMps,commands:start.commands,
        x:start.car.x,y:start.car.y,heading:start.car.heading,onRoad:start.onRoad,collision:start.collision,sensors:start.sensors},
      branches,sourceHashes:{before:beforeSources,after:afterSources,unchanged:sourceFilesUnchanged},cuda,
      boundary:'One verified V3/Monza champion replay and seven 2-second open-loop physical branches from an actually reached moving state. Branch actions are diagnostic counterfactuals only: no neural decision, reward, mutation, lap completion, multi-agent collision or generalization is evaluated. No production source, save, version, release, tag, portable or installer is modified.'};
  if(!report.passed)throw Error('Checkpoint/source integrity or GPU-only validation failed');
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('BOUNDARY_CONTROL_PROBE '+JSON.stringify({passed:report.passed,learningSucceeded:false,start:{progressM:start.progressM,speedMps:start.car.vehicle.speedMps,commands:start.commands},
    terminal:{progressM:report.replay.terminalProgressM,laps:report.replay.terminalLaps,reason:report.replay.terminalReason},
    branches:branches.map(b=>({name:b.name,final:b.samples.at(-1)})),cuda,report:path.join(out,'report.json')}));
}
main().catch(error=>{try{Cuda.close();}catch{}console.error(error.stack||error);process.exitCode=1;}).finally(()=>{try{Cuda.close();}catch{}});
