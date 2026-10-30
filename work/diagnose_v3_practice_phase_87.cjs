'use strict';
// Compare existing local practice to the *actual* continuation of a recorded
// live V3/Monza car. A phase-preserving shadow is an independent control.
// No state, action or course is given to the agent beyond its ordinary input.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const copy=path.join(base,'saved-v3-moving-pace-copy-20261027-85/SPERIMENTALE-solo-dev-v3-monza-progress7-copia.malecns-save');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(base,'saved-v3-practice-control-phase-audit-20261027-87');
const P=require('../outputs/progress-save.js'),F=require('../outputs/simulation.js'),L=require('../outputs/neural-learning.js'),Legacy=require('../outputs/legacy-models.js');
const circuits=require('../outputs/data/circuits.json'),data=require('../outputs/data/connectome.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const expectedCopy='9ec19c8ea77f45327a863c935a0ea8774db435166bc26447870fe4dc96893bd2';
const expectedOriginal='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
const files=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/dense-neural.js'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,sha(path.join(root,f))]));
const check=(condition,message)=>{if(!condition)throw Error(message);};
const sample=car=>({x:car.x,y:car.y,heading:car.heading,speed:car.vehicle.speedMps,outputs:car.outputs.slice(),alive:car.alive});
const diff=(a,b)=>({position:Math.hypot(a.x-b.x,a.y-b.y),heading:Math.abs(a.heading-b.heading),speed:Math.abs(a.speed-b.speed),
  command:Math.max(...a.outputs.map((v,i)=>Math.abs(v-b.outputs[i])))});
function restore(track,graph,genome,state){
  const c=F.makeCar(track,0,F.cloneGenome(genome),state.rewardRevision);
  Object.assign(c,{x:state.x,y:state.y,heading:state.heading,speed:state.speed,_physicsSpeed:state.speed},state.physics);
  c.footprintSensorsEnabled=state.footprintSensorsEnabled;c.vehicle=structuredClone(state.vehicle);
  c.brain=F.makeBrain(graph);c.brain.activity.set(state.activity);
  F.Rewards.initialise(track,c,null,state.rewardRevision);c.rewardState.along=state.along;return c;
}
function replay(track,graph,genome,state,controlPhase,previousOutput,steps,preservePhase){
  const car=restore(track,graph,genome,state),trace=[];let commands=preservePhase?previousOutput.slice():[0,0,0];
  for(let i=0;i<steps&&car.alive;i++){
    const phase=preservePhase?(controlPhase+i)%L.CONTROL_INTERVAL:i%L.CONTROL_INTERVAL;
    if(phase===0){const map=track.halfWidth<20;
      commands=F.neuralStep(graph,car.brain,car.genome,F.sense(track,car).concat(F.physicsSense(car,track)),true,true,
        preservePhase&&map?F.MAP_PHYSICS_ADAPTER_GAIN:F.PHYSICS_ADAPTER_GAIN,
        preservePhase&&map?F.MAP_NEURAL_MOTOR_LAUNCH_BIAS:F.NEURAL_MOTOR_LAUNCH_BIAS);}
    F.drive(track,car,commands);trace.push(sample(car));
  }
  if(car.alive)F.Rewards.finish(track,car,'fine prova locale');
  return {trace,result:{fitness:car.fitness,progress:car.bestProgress,laps:car.laps,reason:car.reason}};
}
async function main(){
  check(!fs.existsSync(out)&&process.versions.node==='24.19.0','New diagnostic output and pinned Node required');
  check(sha(original)===expectedOriginal&&sha(copy)===expectedCopy,'Save identity mismatch');
  const decoded=await P.decode(fs.readFileSync(copy,'utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  check(state.generation===64&&state.rewardRevision==='progress-7-moving-pace','Unexpected experimental save');
  const sourceBefore=hashes(),sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{population:2,modelId:'v3',circuitId:'monza',circuits,seed:state.seed});
  sim.rewardRevision=state.rewardRevision;sim.spawn([state.genomes[0],state.genomes[2]].map(F.cloneGenome));
  sim.evolve=()=>{};const windows=[];let ticks=0;
  while(ticks<12000&&(windows.length<12||windows.some(w=>w.actual.length<12))){
    sim.tick();ticks++;
    for(const w of windows){const live=sim.cars[w.index];if(w.actual.length<12&&ticks>w.startTick&&live.alive)w.actual.push(sample(live));}
    for(const index of [0,1]){
      const live=sim.cars[index],phase=sim.ticks%L.CONTROL_INTERVAL;
      if(live.alive&&live.bestProgress>=650&&(windows.filter(w=>w.index===index).length<6)&&
          !windows.some(w=>w.index===index&&w.phase===phase)){
        windows.push({index,originalAgent:index===0?0:2,phase,startTick:ticks,startProgress:live.bestProgress,
          snapshot:F.capturePracticeState(live),previousOutput:live.slowOutputs.slice(),genome:F.cloneGenome(live.genome),actual:[]});
      }
    }
  }
  check(windows.length===12&&windows.every(w=>w.actual.length===12),'Could not obtain real 12-step continuations for all six phases');
  const rows=[];
  for(const w of windows){
    const old=replay(sim.track,sim.graph,w.genome,w.snapshot,w.phase,w.previousOutput,12,false),
      corrected=replay(sim.track,sim.graph,w.genome,w.snapshot,w.phase,w.previousOutput,12,true),
      official=F.evaluatePractice(sim.track,sim.graph,w.genome,w.snapshot,12);
    for(const k of ['fitness','progress','laps','reason'])check(official[k]===old.result[k],'Diagnostic failed to reproduce current practice: '+k);
    check(corrected.trace.length===12&&old.trace.length===12,'Unexpected early termination');
    const correctDifferences=corrected.trace.map((p,i)=>diff(p,w.actual[i]));
    check(correctDifferences.every(d=>d.position<1e-9&&d.heading<1e-12&&d.speed<1e-10&&d.command<1e-12),
      'Phase-aware shadow does not reproduce the real continuation');
    const deviations=old.trace.map((p,i)=>diff(p,w.actual[i])),first=deviations.findIndex(d=>d.command>1e-12);
    rows.push({agent:w.originalAgent,nextControlPhase:w.phase,startProgressM:w.startProgress,
      firstCommandDifferenceTick:first<0?null:first+1,maxCommandDifference:Math.max(...deviations.map(d=>d.command)),
      finalPositionDifferenceM:deviations.at(-1).position,finalSpeedDifferenceMps:deviations.at(-1).speed,
      phaseAwareMaxPositionErrorM:Math.max(...correctDifferences.map(d=>d.position)),
      practiceFitness:official.fitness,practiceProgress:official.progress});
  }
  const sourceAfter=hashes();check(JSON.stringify(sourceBefore)===JSON.stringify(sourceAfter)&&sha(original)===expectedOriginal&&sha(copy)===expectedCopy,'A file changed');
  const affected=rows.filter(r=>r.firstCommandDifferenceTick!==null),report={passed:true,appVersion:'5.6.0',model:'V3',circuit:'Monza',
    originalSaveSha256:expectedOriginal,migratedCopySha256:expectedCopy,sourceHashes:sourceBefore,runnerSha256:sha(__filename),
    settings:{samples:rows.length,agents:[0,2],phasesPerAgent:6,stepsPerSample:12,startProgressM:650},
    summary:{differentCommands:affected.length,differentWhenNextPhaseZero:affected.filter(r=>r.nextControlPhase===0).length,
      maxCommandDifference:Math.max(...rows.map(r=>r.maxCommandDifference)),maxPositionDifferenceM:Math.max(...rows.map(r=>r.finalPositionDifferenceM))},rows,
    boundary:'Two gen.64 V3 genomes, six real mid-control phases and 12 future ticks each. The phase-aware shadow exactly matches the live physical continuation; the existing local practice is separately reproduced. This is a timing diagnostic, not a learning or generalization claim. No save or app source modified.'};
  fs.mkdirSync(out,{recursive:false});const target=path.join(out,'report.json');fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log('PRACTICE_PHASE_AUDIT '+JSON.stringify({report:target,sha256:sha(target),summary:report.summary,rows}));
}
main().catch(error=>{console.error('PRACTICE_PHASE_AUDIT_FAILED '+(error.stack||error));process.exitCode=1;});
