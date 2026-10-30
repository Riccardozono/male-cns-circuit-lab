'use strict';
// Inspect a real V3/Monza trained replay, then branch the same physical state
// into local brake/no-brake/full-brake probes. No controller or save is changed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js');
const root=path.resolve(__dirname,'..'),args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return [s.slice(2,i),s.slice(i+1)];}));
const input=path.resolve(root,args.save||'.impeccable/review/learning-ml/reward-migration-control-progress3-gen119-10gen-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen129.malecns-save');
const out=path.resolve(root,args.out||'.impeccable/review/learning-ml/probe-v3-terminal-brake-response-gen129-20261022-01');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),sourceFiles=['outputs/simulation.js','outputs/progress-save.js','outputs/rewards.js','outputs/vehicle-992.js'],hashes=()=>Object.fromEntries(sourceFiles.map(p=>[p,sha(fs.readFileSync(path.join(root,p)))]));

async function main(){
  if(fs.existsSync(out))throw Error('Preserve prior brake probe output');
  const before=hashes(),raw=fs.readFileSync(input),inputSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza')throw Error('Expected a saved V3 Monza checkpoint');
  const circuits=require('../outputs/data/circuits.json'),sim=new F.Simulation(Legacy.tagV3(require('../outputs/data/connectome.json')),{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0});
  sim.rewardRevision=state.rewardRevision;sim.stagnation=state.stagnation;sim.safeLearningFrontier={...state.learningFrontier};sim.spawn([F.cloneGenome(state.genomes[0])]);
  const target=sim.cars[0],samples=[],originalStep=F.Vehicle.step,ppm=sim.track.pixelsPerMeter||1;
  F.Vehicle.step=(car,commands,dt,ground)=>{
    const capture=car===target&&car.alive&&car.bestProgress/ppm>=770;
    let sample=null;if(capture&&car.vehicle){sample={progressM:car.bestProgress/ppm,speedBeforeMps:car.vehicle.speedMps,outputs:commands.slice(),x:car.x,y:car.y,heading:car.heading,pixelsPerMeter:ppm,carSpeed:car.speed,physicsSpeed:car._physicsSpeed,distance:car.distance,lifetime:car.lifetime,vehicle:structuredClone(car.vehicle)};}
    const result=originalStep(car,commands,dt,ground);
    if(sample){sample.speedAfterMps=car.vehicle.speedMps;sample.longitudinalAccelerationMps2=car.vehicle.ax;sample.lateralAccelerationMps2=car.vehicle.ay;sample.brakeWheelTorqueNm=car.vehicle.wheels.map(w=>w.fx);samples.push(sample);if(samples.length>3000)samples.shift();}
    return result;
  };
  const generation=sim.generation;try{while(sim.generation===generation)sim.tick();}finally{F.Vehicle.step=originalStep;}
  const candidates=samples.filter(s=>s.progressM>=780&&s.speedBeforeMps>=5);assert.ok(candidates.length,'No moving near-terminal state was captured');
  candidates.sort((a,b)=>b.progressM-a.progressM||b.speedBeforeMps-a.speedBeforeMps);const snapshot=candidates[0],ground=F.Vehicle.Terrain.forTrack(sim.track),steps=30,dt=1/60;
  function branch(name,brake){
    const car={x:snapshot.x,y:snapshot.y,heading:snapshot.heading,pixelsPerMeter:snapshot.pixelsPerMeter,speed:snapshot.carSpeed,_physicsSpeed:snapshot.physicsSpeed,distance:snapshot.distance,lifetime:snapshot.lifetime,vehicle:structuredClone(snapshot.vehicle)};
    const commands=[snapshot.outputs[0],snapshot.outputs[1],brake],trace=[];
    for(let i=0;i<steps;i++){F.Vehicle.step(car,commands,dt,ground);if(i===0||i===5||i===14||i===29)trace.push({seconds:(i+1)*dt,speedMps:car.vehicle.speedMps,longitudinalAccelerationMps2:car.vehicle.ax,longitudinalTyreForceAbsN:car.vehicle.wheels.reduce((sum,w)=>sum+Math.abs(w.fx),0)});}
    return {name,commands,initialSpeedMps:snapshot.speedBeforeMps,finalSpeedMps:car.vehicle.speedMps,trace};
  }
  const normalizedBrake=F.normalizeDriveCommands([0,0,.25]),normalizedThrottle=F.normalizeDriveCommands([0,.25,0]);
  const results=[branch('actual-brake-command',snapshot.outputs[2]),branch('same-state-no-brake',0),branch('same-state-full-brake',1)];
  const after=hashes(),report={format:'male-cns-v3-terminal-brake-physics-probe-v1',passed:JSON.stringify(before)===JSON.stringify(after)&&sha(fs.readFileSync(input))===inputSha,
    learningSucceeded:false,input:{file:input,sha256:inputSha,generation:state.generation,rewardRevision:state.rewardRevision},
    replay:{finalProgressM:target.bestProgress/ppm,laps:target.laps,reason:target.reason,terminalCommands:target.outputs,terminalSensorVector:target.sensorVector,sampledStates:samples.length},
    selectedPhysicalState:{progressM:snapshot.progressM,speedMps:snapshot.speedBeforeMps,commands:snapshot.outputs,speedAfterCurrentPhysicsStepMps:snapshot.speedAfterMps,longitudinalAccelerationMps2:snapshot.longitudinalAccelerationMps2},
    controlSeparation:{normalizedBrake,normalizedThrottle,distinct:JSON.stringify(normalizedBrake)!==JSON.stringify(normalizedThrottle)},
    localPhysicsBranches:results,settings:{constantCommandSeconds:steps*dt,steps,dt},sourceHashes:before,sourceFilesUnchanged:JSON.stringify(before)===JSON.stringify(after),inputUnchanged:sha(fs.readFileSync(input))===inputSha,
    boundary:'One real selected-genome replay and 0.5 s local vehicle-physics probes from the same actually reached state. The short constant-command branches are not full controlled laps, do not include neural decisions or collision/reward processing, and do not prove driver quality. V2/V3/V4/V5 all call the same shared Vehicle.step physics path; only their controllers differ.'};
  assert.ok(report.passed&&report.controlSeparation.distinct);fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('BRAKE_RESPONSE_PROBE '+JSON.stringify({passed:report.passed,learningSucceeded:false,progressM:report.replay.finalProgressM,terminalCommands:report.replay.terminalCommands,selectedState:report.selectedPhysicalState,branches:results.map(b=>({name:b.name,commands:b.commands,initial:b.initialSpeedMps,final:b.finalSpeedMps})),report:path.join(out,'report.json')}));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
