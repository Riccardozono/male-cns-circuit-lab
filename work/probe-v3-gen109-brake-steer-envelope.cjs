'use strict';
// Diagnostic-only local action envelope from a real V3/Monza gen.109 state:
// vary steering while retaining moderate braking, without a route controller.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),
  savePath=path.join(root,'.impeccable/review/learning-ml/saved-v3-crossover-100-continuous-batch-cuda-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen109.malecns-save'),
  controlPath=path.join(root,'.impeccable/review/learning-ml/saved-v3-gen109-exploration-sigma-reset-ab-20261022-01/report.json'),
  priorPath=path.join(root,'.impeccable/review/learning-ml/probe-v3-gen109-steering-narrow-window-20261022-01/report.json'),
  out=path.join(root,'.impeccable/review/learning-ml/probe-v3-gen109-brake-steer-envelope-20261022-01');
const expectedSaveSha='c17030e2d26ec235521269aa89a4474222fe7d7ae350ceb73286cfad2c498f96';
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Dense=require(path.join(root,'outputs/dense-neural.js')),
  Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/data/circuits.json','outputs/data/connectome.json'];
const hashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
const wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a< -Math.PI)a+=2*Math.PI;return a;};
function pose(track,car,startAlong){
  const p=F.locate(track,car.x,car.y),seg=track.segments.find(s=>s.start<=p.along&&p.along<s.start+s.length)||track.segments.at(-1),
    tangent=Math.atan2(seg.b.y-seg.a.y,seg.b.x-seg.a.x),error=wrap(car.heading-tangent),dx=car.x-p.x,dy=car.y-p.y,
    lateral=-Math.sin(tangent)*dx+Math.cos(tangent)*dy,hx=F.Vehicle.SPEC.lengthM/2,hy=F.Vehicle.SPEC.widthM/2,
    projectedHalf=Math.abs(Math.sin(error))*hx+Math.abs(Math.cos(error))*hy,width=F.trackWidthAt(track,p.along).widthMeters;
  let delta=p.along-startAlong;if(delta>track.total/2)delta-=track.total;if(delta< -track.total/2)delta+=track.total;
  return {alongM:p.along,deltaFromStartM:delta,heading:car.heading,tangent,errorDeg:error*180/Math.PI,lateralFromCenterM:lateral,
    projectedHalfWidthM:projectedHalf,widthMeters:width,bodyMarginToNearestEdgeM:width/2-Math.abs(lateral)-projectedHalf,
    x:car.x,y:car.y,speedMps:car.vehicle.speedMps,yawRate:car.vehicle.r,onRoad:F.onRoad(track,car.x,car.y),collision:F.collided(track,car)};
}
function branch(track,ground,start,item,seconds=4){
  const car=structuredClone(start.car),commands=[item.steering,0,item.brake],dt=1/60,steps=Math.round(seconds/dt),samples=[];samples.push({seconds:0,...pose(track,car,start.along)});
  for(let i=0;i<steps;i++){F.Vehicle.step(car,commands,dt,ground);if((i+1)%15===0||i===steps-1)samples.push({seconds:(i+1)*dt,...pose(track,car,start.along)});const s=samples.at(-1);if(s.collision||!s.onRoad)break;}
  const lastSafe=[...samples].reverse().find(s=>!s.collision&&s.onRoad)||samples[0];return {...item,durationSeconds:seconds,samples,lastSafe,stoppedAtBoundary:Boolean(samples.at(-1).collision||!samples.at(-1).onRoad)};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');if(fs.existsSync(out))throw Error(`Refusing to overwrite ${out}`);
  const beforeSources=hashes(),raw=fs.readFileSync(savePath),saveSha=sha(raw);if(saveSha!==expectedSaveSha)throw Error('Gen.109 checkpoint hash mismatch');
  const control=JSON.parse(fs.readFileSync(controlPath,'utf8')),prior=JSON.parse(fs.readFileSync(priorPath,'utf8'));
  if(!control.passed||control.checkpoint?.sha256!==saveSha||!prior.passed||prior.checkpoint?.sha256!==saveSha||JSON.stringify(prior.sourceHashes?.after)!==JSON.stringify(beforeSources))throw Error('Verified baseline or unchanged source identity required');
  const expectedBaseline=control.arms?.[0]?.rows?.find(row=>row.generation===109)?.outcomes?.find(row=>row.id===0);
  const decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==109||state.seed!==7717||state.population!==100||state.rewardRevision!=='progress-3')throw Error('Unexpected checkpoint metadata');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json')),
    validator=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0});P.validatePayload(decoded.payload,{graph:validator.graph,circuits:validator.circuits});
  const sim=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0});sim.rewardRevision=state.rewardRevision;sim.stagnation=state.stagnation;sim.safeLearningFrontier={...state.learningFrontier};sim.spawn([F.cloneGenome(state.genomes[0])]);
  const car=sim.cars[0],ppm=sim.track.pixelsPerMeter||1;let start=null,ticks=0,terminal=null;const originalVehicleStep=F.Vehicle.step,originalDenseStep=Dense.step;Dense.step=(...args)=>Cuda.pass(...args);
  F.Vehicle.step=(vehicle,commands,dt,ground)=>{if(!start&&vehicle===car&&vehicle.alive&&vehicle.bestProgress/ppm>=770&&vehicle.bestProgress/ppm<=785&&vehicle.vehicle?.speedMps>=8){const p=F.locate(sim.track,vehicle.x,vehicle.y);start={car:structuredClone(vehicle),commands:commands.slice(),tick:sim.ticks,progressM:vehicle.bestProgress/ppm,along:p.along,pose:pose(sim.track,vehicle,p.along)};}return originalVehicleStep(vehicle,commands,dt,ground);};
  sim.onTrialTick=s=>{const c=s.cars[0];if(!c.alive&&!terminal)terminal={progressM:c.bestProgress/ppm,laps:c.laps,reason:c.reason||''};};const initialGeneration=sim.generation;
  try{while(sim.generation===initialGeneration&&ticks++<10000)sim.tick();}finally{F.Vehicle.step=originalVehicleStep;Dense.step=originalDenseStep;sim.running=false;}
  if(!start||!terminal||terminal.progressM!==expectedBaseline.progressM||terminal.laps!==expectedBaseline.laps||terminal.reason!==expectedBaseline.reason)throw Error('Saved champion replay did not reproduce exact baseline');
  const items=[{name:'saved-steering-with-brake',steering:start.commands[0],brake:start.commands[2]},
    ...[.035,.05,.08,.12].map(steering=>({name:`steer-${steering}-brake-0.18`,steering,brake:.18})),
    ...[.035,.05,.08].map(steering=>({name:`steer-${steering}-brake-0.10`,steering,brake:.10}))],ground=F.Vehicle.Terrain.forTrack(sim.track),branches=items.map(item=>branch(sim.track,ground,start,item));
  const best=[...branches].sort((a,b)=>b.lastSafe.deltaFromStartM-a.lastSafe.deltaFromStartM)[0],afterSources=hashes(),sourceFilesUnchanged=JSON.stringify(beforeSources)===JSON.stringify(afterSources),inputUnchanged=sha(fs.readFileSync(savePath))===saveSha,cuda=Cuda.stats(),identity=Cuda.identity();
  const report={format:'male-cns-v3-gen109-brake-steer-envelope-v1',appVersion:'5.6.0',passed:Boolean(cuda.gpuCalls>0&&cuda.cpuFallbacks===0&&sourceFilesUnchanged&&inputUnchanged&&start.pose.onRoad&&!start.pose.collision),learningSucceeded:false,
    checkpoint:{path:savePath,sha256:saveSha,unchanged:inputUnchanged,model:'V3',circuit:'Monza',generation:state.generation,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
    replay:{ticks,generationEnded:sim.generation!==initialGeneration,terminal},capturedStart:{tick:start.tick,progressM:start.progressM,neuralCommands:start.commands,...start.pose},
    method:{branches:branches.length,secondsPerBranch:4,onlyControlChanges:'Fixed steering and brake; zero gas. Retains the saved champion brake magnitude in four branches and tests a lower brake magnitude in three. Actions are open-loop physics probes, not neural predictions or training.'},
    branches,bestCollisionFreeBranch:{name:best.name,steering:best.steering,brake:best.brake,lastSafe:best.lastSafe,collisionSample:best.samples.at(-1)},
    sourceHashes:{before:beforeSources,after:afterSources,unchanged:sourceFilesUnchanged},cuda:{...cuda,identity},
    boundary:'One saved champion, one state near 770 m, eight four-second open-loop physics branches. Steering varies while longitudinal action remains braking; no route data or desired actions are fed to the neural controller because the branches do not run a controller. No branch demonstrates learning or lap completion. Source, save, version, release and distributions are unchanged.'};
  if(!report.passed)throw Error('CUDA/integrity validation failed');fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('BRAKE_STEER_ENVELOPE '+JSON.stringify({passed:report.passed,learningSucceeded:false,start:report.capturedStart,branches:branches.map(b=>({name:b.name,steering:b.steering,brake:b.brake,lastSafe:b.lastSafe,end:b.samples.at(-1),collision:b.stoppedAtBoundary})),best:report.bestCollisionFreeBranch,cuda:report.cuda.device,report:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(()=>{try{Cuda.close();}catch{}});
