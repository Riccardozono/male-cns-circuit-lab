'use strict';
// Read-only, tick-aligned trace of the saved V3 Monza controller near its
// terminal low-speed region. No interventions or route/time inputs are used.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js');
const root=path.resolve(__dirname,'..'),args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return [s.slice(2,i),s.slice(i+1)];}));
const input=path.resolve(root,args.save||'.impeccable/review/learning-ml/reward-migration-treatment-progress6-gen119-10gen-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen129.malecns-save');
const out=path.resolve(root,args.out||'.impeccable/review/learning-ml/saved-v3-brake-trace-gen129-20261022-01'),minimumProgressM=Number(args.fromM||480),expectedGeneration=Number(args.generation||129);
const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),sourceFiles=['outputs/simulation.js','outputs/progress-save.js','outputs/rewards.js','outputs/vehicle-992.js','outputs/neural-learning.js','outputs/data/circuits.json','outputs/data/connectome.json'];
const hashes=()=>Object.fromEntries(sourceFiles.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
const physicsNames=['speed/100','longitudinalG/2.5','lateralG/2.5','totalG/3','slip/(pi/2)','yawRate/4.5','loadTransfer','footprintLeftRight','farLeftRight','frontClearance/240','totalClearance','rpm/maxRpm','gear/6','rearSlip','frontSlip','tyreC/150','brakeC/1000'];
function summarizeBand(rows,lo,hi){const band=rows.filter(r=>r.progressM>=lo&&r.progressM<hi);if(!band.length)return {fromM:lo,toM:hi,controls:0};
  return {fromM:lo,toM:hi,controls:band.length,meanSpeedMps:band.reduce((s,r)=>s+r.speedMps,0)/band.length,
    throttleControls:band.filter(r=>r.commands[1]>.01).length,brakeOnlyControls:band.filter(r=>r.commands[1]<=.01&&r.commands[2]>.03).length,
    meanThrottle:band.reduce((s,r)=>s+r.commands[1],0)/band.length,meanBrake:band.reduce((s,r)=>s+r.commands[2],0)/band.length};}
async function main(){
  if(fs.existsSync(out))throw Error('Preserve prior trace output');
  if(!Number.isFinite(minimumProgressM)||minimumProgressM<0)throw Error('Invalid trace start distance');
  const before=hashes(),raw=fs.readFileSync(input),inputSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==expectedGeneration||state.genomes?.length<1)
    throw Error(`Expected the isolated V3/Monza gen.${expectedGeneration} research checkpoint`);
  const sim=new F.Simulation(Legacy.tagV3(require('../outputs/data/connectome.json')),{modelId:'v3',population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json'),seed:state.seed,mutation:0});
  sim.rewardRevision=state.rewardRevision;sim.stagnation=state.stagnation;sim.safeLearningFrontier={...state.learningFrontier};sim.spawn([F.cloneGenome(state.genomes[0])]);
  const target=sim.cars[0],ppm=sim.track.pixelsPerMeter||1,rows=[],originalStep=F.Vehicle.step;let totalControls=0;
  F.Vehicle.step=(car,commands,dt,ground)=>{
    if(car===target&&sim.ticks%sim.neuralInterval===0){
      totalControls++;
    }
    if(car===target&&sim.ticks%sim.neuralInterval===0&&car.bestProgress/ppm>=minimumProgressM){
      const projection=F.locate(sim.track,car.x,car.y),telemetry=F.Vehicle.telemetry(car.vehicle);
      rows.push({tick:sim.ticks,simSeconds:car.lifetime,progressM:car.bestProgress/ppm,alongM:projection.along/ppm,
        x:car.x,y:car.y,heading:car.heading,speedMps:car.vehicle.speedMps,commands:commands.slice(),sensorVector:car.sensorVector.slice(),
        visualSensors:car.inputs.slice(),physicsSensors:car.physicsInputs.slice(),vehicle:{rpm:telemetry.rpm,gear:telemetry.gear,
          brakeC:telemetry.brakeC,frontSlip:telemetry.frontSlip,rearSlip:telemetry.rearSlip,longitudinalG:car.longitudinalG,
          lateralG:car.lateralG,totalG:car.totalG,slipAngle:car.slipAngle,yawRate:car.yawRate,loadTransfer:car.loadTransfer},
        brakeLockSeconds:car.rewardState.brakeLockSeconds||0,onRoad:F.onRoad(sim.track,car.x,car.y),collision:F.collided(sim.track,car)});
    }
    return originalStep(car,commands,dt,ground);
  };
  const generation=sim.generation;
  try{while(sim.generation===generation)sim.tick();}finally{F.Vehicle.step=originalStep;}
  assert.ok(rows.length>30,'Expected a dense control-aligned trace');
  const baseline={progressM:target.bestProgress/ppm,laps:target.laps,fitness:target.fitness,reason:target.reason,simSeconds:target.lifetime,
    terminalCommands:target.outputs.slice(),terminalSpeedMps:target.vehicle.speedMps,controls:totalControls};
  assert.equal(baseline.laps,0);assert.equal(baseline.reason,'troppo lenta / senza progresso');
  const firstBrakeOnly=rows.findIndex((r,i)=>i+2<rows.length&&[rows[i],rows[i+1],rows[i+2]].every(s=>s.speedMps>=10&&s.commands[1]<=.01&&s.commands[2]>=.03));
  const bands=[];for(let lo=Math.floor(minimumProgressM/50)*50;lo<baseline.progressM;lo+=50)bands.push(summarizeBand(rows,lo,lo+50));
  const milestones=[500,550,600,650,700,725,750,775,790,800].map(targetM=>({targetM,row:rows.reduce((best,row)=>Math.abs(row.progressM-targetM)<Math.abs(best.progressM-targetM)?row:best,rows[0])}))
    .filter((item,i,a)=>a.findIndex(other=>other.row.tick===item.row.tick)===i).map(({targetM,row})=>({targetM,tick:row.tick,simSeconds:row.simSeconds,
      progressM:row.progressM,alongM:row.alongM,speedMps:row.speedMps,commands:row.commands,vehicle:row.vehicle,
      physicsSensors:Object.fromEntries(physicsNames.map((name,i)=>[name,row.physicsSensors[i]])),visualSensors:row.visualSensors}));
  const after=hashes(),report={format:'male-cns-v3-brake-onset-control-trace-v1',appVersion:'5.6.0',passed:JSON.stringify(before)===JSON.stringify(after)&&sha(fs.readFileSync(input))===inputSha,
    learningSucceeded:false,input:{file:input,sha256:inputSha,generation:state.generation,rewardRevision:state.rewardRevision,modelId:decoded.payload.modelId,circuitId:decoded.payload.circuitId},
    baseline,firstSustainedBrakeOnly:firstBrakeOnly<0?null:{tick:rows[firstBrakeOnly].tick,simSeconds:rows[firstBrakeOnly].simSeconds,
      progressM:rows[firstBrakeOnly].progressM,speedMps:rows[firstBrakeOnly].speedMps,commands:rows[firstBrakeOnly].commands},
    bands,milestones,rows,visualSensorAnglesRad:F.ANGLES,physicsSensorNames:physicsNames,sourceHashes:before,
    sourceFilesUnchanged:JSON.stringify(before)===JSON.stringify(after),inputUnchanged:sha(fs.readFileSync(input))===inputSha,
    method:'Instrument the shared Porsche Vehicle.step immediately before every actual control-interval integration. Rows pair the saved policy outputs with the neural sensor vector used to compute them; no route, clock, speed target, action override or reward edit is supplied.',
    boundary:'One exact deterministic from-line replay of one V3/Monza gen.129 genome. This is diagnosis only, not an intervention, trained result, second seed or proof of generalization. App, saved weights, user save and published version are not changed.'};
  assert.ok(report.passed&&(expectedGeneration!==129||baseline.progressM===801.1207621478061),'Replay or integrity mismatch');
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('V3_BRAKE_TRACE '+JSON.stringify({passed:report.passed,learningSucceeded:false,baseline:report.baseline,firstSustainedBrakeOnly:report.firstSustainedBrakeOnly,bands:report.bands,milestones:report.milestones,report:path.join(out,'report.json')}));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
