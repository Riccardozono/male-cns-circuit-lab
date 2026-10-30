'use strict';
// Diagnostic only: preserve the actual MaleCNS neural steering and brain
// updates, but briefly release braking near the saved low-speed stall state.
// This route-progress trigger is an instrument, never a candidate controller.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),
  savePath=path.join(root,'.impeccable/review/learning-ml/saved-v3-crossover-100-continuous-batch-cuda-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen109.malecns-save'),
  controlPath=path.join(root,'.impeccable/review/learning-ml/saved-v3-gen109-exploration-sigma-reset-ab-20261022-01/report.json'),
  out=path.join(root,'.impeccable/review/learning-ml/probe-v3-gen109-neural-brake-release-window-20261022-01');
const expectedSaveSha='c17030e2d26ec235521269aa89a4474222fe7d7ae350ceb73286cfad2c498f96';
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Dense=require(path.join(root,'outputs/dense-neural.js')),
  Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/data/circuits.json','outputs/data/connectome.json'];
const hashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
function rollout(data,circuits,state,parent,seconds,expectedBaseline){
  const sim=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0});
  sim.rewardRevision=state.rewardRevision;sim.stagnation=state.stagnation;sim.safeLearningFrontier={...state.learningFrontier};
  sim.spawn([F.cloneGenome(parent)]);const car=sim.cars[0],ppm=sim.track.pixelsPerMeter||1;
  const triggerProgressM=760,triggerMaxSpeedMps=15,overrideThrottle=.12,maxOverrideTicks=Math.round(seconds*60);
  let triggered=false,overrideTicks=0,trigger=null,peakProgressDuringOverrideM=null,terminal=null,ticks=0;
  const originalVehicleStep=F.Vehicle.step;
  F.Vehicle.step=(vehicle,commands,dt,ground)=>{
    if(vehicle===car&&seconds>0&&!triggered&&vehicle.alive&&vehicle.bestProgress/ppm>=triggerProgressM&&
       vehicle.vehicle?.speedMps<=triggerMaxSpeedMps&&commands[2]>=.05&&commands[1]<=.05){
      triggered=true;trigger={tick:sim.ticks,progressM:vehicle.bestProgress/ppm,speedMps:vehicle.vehicle.speedMps,neuralCommands:commands.slice()};
    }
    if(vehicle===car&&triggered&&overrideTicks<maxOverrideTicks&&vehicle.alive){
      const applied=[commands[0],overrideThrottle,0];vehicle.outputs=applied;overrideTicks++;
      peakProgressDuringOverrideM=Math.max(peakProgressDuringOverrideM??0,vehicle.bestProgress/ppm);
      return originalVehicleStep(vehicle,applied,dt,ground);
    }
    return originalVehicleStep(vehicle,commands,dt,ground);
  };
  sim.onTrialTick=s=>{const c=s.cars[0];if(!c.alive&&!terminal)terminal={ticks:s.ticks,progressM:c.bestProgress/ppm,laps:c.laps,
    lapTimes:c.lapTimes.slice(),reason:c.reason||'',fitness:c.fitness,safe:F.isSafeLearningOutcome(c),terminalNeuralOutputs:c.outputs.slice(),
    speedMps:c.vehicle?.speedMps??0,gear:c.vehicle?.gear??null,rpm:c.vehicle?.rpm??null};};
  const initialGeneration=sim.generation;let runError=null;
  try{while(sim.generation===initialGeneration&&ticks++<20000)sim.tick();}
  catch(error){runError=error;}
  finally{F.Vehicle.step=originalVehicleStep;sim.running=false;}
  if(runError)throw runError;
  if(sim.generation===initialGeneration||!terminal)throw Error(`Brake-release ${seconds}s: rollout did not finish naturally within 20,000 ticks`);
  if(seconds===0&&(terminal.progressM!==expectedBaseline.progressM||terminal.laps!==expectedBaseline.laps||terminal.reason!==expectedBaseline.reason))
    throw Error(`Baseline mismatch: got ${JSON.stringify(terminal)}, expected ${JSON.stringify(expectedBaseline)}`);
  return {interventionSeconds:seconds,triggerProgressM,triggerMaxSpeedMps,overrideThrottle,triggered,trigger,overrideTicks,
    peakProgressDuringOverrideM,terminal};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error(`Refusing to overwrite existing output: ${out}`);
  const beforeSources=hashes(),raw=fs.readFileSync(savePath),saveSha=sha(raw);
  if(saveSha!==expectedSaveSha)throw Error('Research checkpoint hash differs from the verified gen.109 input');
  const control=JSON.parse(fs.readFileSync(controlPath,'utf8'));
  if(!control.passed||control.checkpoint?.sha256!==saveSha)throw Error('Verified gen.109 control report missing or inconsistent');
  const expectedBaseline=control.arms?.[0]?.rows?.find(row=>row.generation===109)?.outcomes?.find(row=>row.id===0);
  if(!expectedBaseline)throw Error('Saved champion outcome missing from the control report');
  const decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==109||state.seed!==7717||state.population!==100||state.rewardRevision!=='progress-3')throw Error('Expected verified V3/Monza gen.109 checkpoint');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json')),
    validator=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0});
  P.validatePayload(decoded.payload,{graph:validator.graph,circuits:validator.circuits});
  const parent=F.cloneGenome(state.genomes[0]);
  if(JSON.stringify(parent.policyWeights)!==JSON.stringify(state.champion?.policyWeights??state.champion))throw Error('Checkpoint champion genome identity mismatch');
  const originalDenseStep=Dense.step,results=[],start=performance.now();Dense.step=(...args)=>Cuda.pass(...args);
  try{for(const seconds of [0,2,4]){const result=rollout(data,circuits,state,parent,seconds,expectedBaseline);results.push(result);console.log('BRAKE_RELEASE_WINDOW_RESULT '+JSON.stringify(result));}}
  finally{Dense.step=originalDenseStep;}
  const cuda=Cuda.stats(),cudaIdentity=Cuda.identity(),afterSources=hashes(),sourceFilesUnchanged=JSON.stringify(beforeSources)===JSON.stringify(afterSources),inputUnchanged=sha(fs.readFileSync(savePath))===saveSha;
  const report={format:'male-cns-v3-gen109-neural-brake-release-window-v1',appVersion:'5.6.0',passed:Boolean(cuda.gpuCalls>0&&cuda.cpuFallbacks===0&&sourceFilesUnchanged&&inputUnchanged),learningSucceeded:results.some(r=>r.terminal.safe&&r.terminal.laps>=2),
    checkpoint:{path:savePath,sha256:saveSha,unchanged:inputUnchanged,model:'V3',circuit:'Monza',generation:state.generation,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
    settings:{arms:results.length,intervention:'For 2 or 4 simulated seconds after the saved policy reaches >760 m, speed <=15 m/s, and commands brake >=0.05/gas <=0.05, replace only its longitudinal physical command with 0.12 throttle and zero brake. MaleCNS continues calculating steering and updating its neural state. A zero-second arm is an exact unmodified replay.',gpuBackend:'exact V3 CUDA neural pass; CPU physics',runtime:process.versions.node},
    expectedBaseline,results,wallSeconds:(performance.now()-start)/1000,cuda:{...cuda,identity:cudaIdentity},
    sourceHashes:{before:beforeSources,after:afterSources,unchanged:sourceFilesUnchanged},
    boundary:'The trigger uses Monza progress and an external action override, so this is a physical/controller diagnostic only and explicitly not a learned result or candidate policy. It tests whether releasing the observed low-speed brake while retaining live neural steering and neural state updates changes the failure. No source, save, version, release, tag, portable or installer is modified.'};
  if(!report.passed)throw Error(`Integrity/GPU-only validation failed: ${JSON.stringify({cuda,sourceFilesUnchanged,inputUnchanged})}`);
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('BRAKE_RELEASE_WINDOW_SUMMARY '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,results:results.map(r=>({seconds:r.interventionSeconds,triggered:r.triggered,trigger:r.trigger,overrideTicks:r.overrideTicks,peakDuringOverrideM:r.peakProgressDuringOverrideM,terminal:r.terminal})),cuda:report.cuda.device,report:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(()=>{try{Cuda.close();}catch{}});
