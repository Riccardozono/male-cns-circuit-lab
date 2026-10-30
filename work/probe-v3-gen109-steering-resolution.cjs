'use strict';
// Diagnostic-only fine steering sweep from the exact live state reached by the
// verified saved V3/Monza gen.109 champion. Physics branches are open-loop.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),
  savePath=path.join(root,'.impeccable/review/learning-ml/saved-v3-crossover-100-continuous-batch-cuda-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen109.malecns-save'),
  controlPath=path.join(root,'.impeccable/review/learning-ml/saved-v3-gen109-exploration-sigma-reset-ab-20261022-01/report.json'),
  out=path.join(root,'.impeccable/review/learning-ml/probe-v3-gen109-steering-resolution-20261022-01');
const expectedSaveSha='c17030e2d26ec235521269aa89a4474222fe7d7ae350ceb73286cfad2c498f96';
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Dense=require(path.join(root,'outputs/dense-neural.js')),
  Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/data/circuits.json','outputs/data/connectome.json'];
const hashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
const progressOf=(track,car,startAlong)=>{const p=F.locate(track,car.x,car.y);let d=p.along-startAlong;if(d>track.total/2)d-=track.total;if(d< -track.total/2)d+=track.total;return {alongM:p.along/(track.pixelsPerMeter||1),deltaFromStartM:d/(track.pixelsPerMeter||1)};};
function branch(track,ground,start,steering,seconds=4){
  const car=structuredClone(start.car),commands=[steering,.12,0],dt=1/60,steps=Math.round(seconds/dt),samples=[];
  const sample=t=>({seconds:t,...progressOf(track,car,start.along),x:car.x,y:car.y,heading:car.heading,speedMps:car.vehicle.speedMps,
    yawRate:car.vehicle.r,steeringCommand:steering,throttleCommand:.12,brakeCommand:0,onRoad:F.onRoad(track,car.x,car.y),collision:F.collided(track,car)});
  samples.push(sample(0));
  for(let i=0;i<steps;i++){F.Vehicle.step(car,commands,dt,ground);if((i+1)%15===0||i===steps-1)samples.push(sample((i+1)*dt));const last=samples.at(-1);if(last.collision||!last.onRoad)break;}
  return {steering,throttle:.12,brake:0,durationSeconds:seconds,samples,stoppedAtBoundary:Boolean(samples.at(-1).collision||!samples.at(-1).onRoad)};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error(`Refusing to overwrite existing output: ${out}`);
  const beforeSources=hashes(),raw=fs.readFileSync(savePath),saveSha=sha(raw);
  if(saveSha!==expectedSaveSha)throw Error('Research checkpoint hash differs from verified gen.109 input');
  const control=JSON.parse(fs.readFileSync(controlPath,'utf8'));
  if(!control.passed||control.checkpoint?.sha256!==saveSha)throw Error('Verified gen.109 report missing or inconsistent');
  const expectedBaseline=control.arms?.[0]?.rows?.find(row=>row.generation===109)?.outcomes?.find(row=>row.id===0);
  if(!expectedBaseline)throw Error('Saved champ outcome missing');
  const decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==109||state.seed!==7717||state.population!==100||state.rewardRevision!=='progress-3')throw Error('Expected verified V3/Monza gen.109 checkpoint');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json')),
    validator=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0});
  P.validatePayload(decoded.payload,{graph:validator.graph,circuits:validator.circuits});
  const sim=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0});
  sim.rewardRevision=state.rewardRevision;sim.stagnation=state.stagnation;sim.safeLearningFrontier={...state.learningFrontier};
  sim.spawn([F.cloneGenome(state.genomes[0])]);const target=sim.cars[0],ppm=sim.track.pixelsPerMeter||1;let start=null,ticks=0;
  const originalVehicleStep=F.Vehicle.step,originalDenseStep=Dense.step;Dense.step=(...args)=>Cuda.pass(...args);
  F.Vehicle.step=(car,commands,dt,ground)=>{if(!start&&car===target&&car.alive&&car.bestProgress/ppm>=770&&car.bestProgress/ppm<=785&&car.vehicle?.speedMps>=8){
    const p=F.locate(sim.track,car.x,car.y);start={car:structuredClone(car),commands:commands.slice(),tick:sim.ticks,progressM:car.bestProgress/ppm,along:p.along/(ppm||1),
      onRoad:F.onRoad(sim.track,car.x,car.y),collision:F.collided(sim.track,car),visualSensors:car.inputs?.slice(),physicsSensors:car.physicsInputs?.slice()};}
    return originalVehicleStep(car,commands,dt,ground);};
  const initialGeneration=sim.generation;let terminal=null;
  sim.onTrialTick=s=>{const c=s.cars[0];if(!c.alive&&!terminal)terminal={progressM:c.bestProgress/ppm,laps:c.laps,reason:c.reason||''};};
  try{while(sim.generation===initialGeneration&&ticks++<10000)sim.tick();}
  finally{F.Vehicle.step=originalVehicleStep;Dense.step=originalDenseStep;sim.running=false;}
  if(!start||!terminal||terminal.progressM!==expectedBaseline.progressM||terminal.laps!==expectedBaseline.laps||terminal.reason!==expectedBaseline.reason)throw Error(`Exact baseline replay/capture failed: ${JSON.stringify({start:Boolean(start),terminal,expectedBaseline})}`);
  const ground=F.Vehicle.Terrain.forTrack(sim.track),steerings=[-.03,-.02,-.015,-.01,-.005,0,.005,.01,.015,.02,.03],
    branches=steerings.map(value=>branch(sim.track,ground,start,value)),best=[...branches].sort((a,b)=>b.samples.at(-1).deltaFromStartM-a.samples.at(-1).deltaFromStartM)[0];
  const afterSources=hashes(),sourceFilesUnchanged=JSON.stringify(beforeSources)===JSON.stringify(afterSources),inputUnchanged=sha(fs.readFileSync(savePath))===saveSha,cuda=Cuda.stats(),identity=Cuda.identity();
  const report={format:'male-cns-v3-gen109-steering-resolution-probe-v1',appVersion:'5.6.0',passed:Boolean(cuda.gpuCalls>0&&cuda.cpuFallbacks===0&&sourceFilesUnchanged&&inputUnchanged&&start.onRoad&&!start.collision),learningSucceeded:false,
    checkpoint:{path:savePath,sha256:saveSha,unchanged:inputUnchanged,model:'V3',circuit:'Monza',generation:state.generation,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
    replay:{ticks,generationEnded:sim.generation!==initialGeneration,terminal},capturedStart:{tick:start.tick,progressM:start.progressM,alongM:start.along,speedMps:start.car.vehicle.speedMps,neuralCommands:start.commands,
      x:start.car.x,y:start.car.y,heading:start.car.heading,onRoad:start.onRoad,collision:start.collision,visualSensors:start.visualSensors,physicsSensors:start.physicsSensors},
    method:{branches:branches.length,durationSeconds:4,fixedThrottle:.12,fixedBrake:0,steeringValues:steerings,selection:'All branches start from the same actual neural rollout state; fixed actions only test local physical sensitivity.'},
    branches,bestBranch:{steering:best.steering,deltaFromStartM:best.samples.at(-1).deltaFromStartM,final:best.samples.at(-1)},
    cuda:{...cuda,identity},sourceHashes:{before:beforeSources,after:afterSources,unchanged:sourceFilesUnchanged},
    boundary:'One saved champion, one Monza state near 770 m, and eleven four-second open-loop physical branches with small fixed steering differences, mild throttle and no brake. No branch learns or completes a lap. This diagnoses local steering sensitivity only; it cannot establish a general controller or replace closed-loop neural behavior. Source, save, app version and distributions remain unchanged.'};
  if(!report.passed)throw Error(`Checkpoint/source/CUDA validation failed: ${JSON.stringify({cuda,sourceFilesUnchanged,inputUnchanged})}`);
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('STEERING_RESOLUTION_SUMMARY '+JSON.stringify({passed:report.passed,learningSucceeded:false,start:report.capturedStart,branches:branches.map(b=>({steering:b.steering,final:b.samples.at(-1)})),best:report.bestBranch,cuda:report.cuda.device,report:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(()=>{try{Cuda.close();}catch{}});
