'use strict';
// Standalone inference: no prior state-head/chain controller is imported.
const fs=require('node:fs'),path=require('node:path');
const Runtime=require('./current-physics-runtime.cjs'),Readout=require('./neural-self-readout.cjs'),Legacy=require('../outputs/legacy-models.js');
const Dense=require('../outputs/dense-neural.js'),Cuda=require('./cuda-exact-v3-runtime.cjs');
const root=path.resolve(__dirname,'..'),tag=process.argv[2];
const modelFile=process.argv.find(s=>s.startsWith('--model='))?.slice(8),parityFile=process.argv.find(s=>s.startsWith('--parity='))?.slice(9);
const paceMode=process.argv.find(s=>s.startsWith('--pace='))?.slice(7)||'strict';
if(!tag||!/^[A-Za-z0-9-]+$/.test(tag)||!modelFile)throw Error('Scoped tag and --model are required.');
const data=Readout.load(path.resolve(root,modelFile)),before=Runtime.sourceHashes();
if(JSON.stringify(before)!==JSON.stringify(data.sourceSha256))throw Error('Declared model source/data no longer match.');
const output=path.join(root,'.impeccable/review/learning-ml',tag);
if(fs.existsSync(output))throw Error('Preserve existing replay evidence.');
const previousDense=Dense.step;let created=false;
try{
  let parityMaxError=null;
  if(parityFile){
    const parity=JSON.parse(fs.readFileSync(path.resolve(root,parityFile),'utf8'));
    parityMaxError=Readout.parityError(data,parity.probes);
  }
  const {F,rewardOverlaySha256}=Runtime.create(paceMode),simulation=new F.Simulation(Legacy.tagV3(require('../outputs/data/connectome.json')),{modelId:'v3',population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json')});
  const {graph,track}=simulation,observer=Readout.observer(F,graph,track,data.observerSpec),car=F.makeCar(track,0,F.cloneGenome(data.observerSpec.baseGenome));car.footprintSensorsEnabled=true;
  Dense.step=(...args)=>Cuda.pass(...args);fs.mkdirSync(output);created=true;
  const trace=require('node:crypto').createHash('sha256'),samples=[];let previous=[0,0],controls=0,last=performance.now();
  while(car.alive&&controls<50000){
    const input=observer.observe(car,previous),commands=Readout.action(data,input,observer.signal());car.brain=observer.brain;
    for(let tick=0;tick<6&&car.alive;tick++)F.drive(track,car,commands,F.DT);
    previous=[car.outputs[0],car.outputs[1]-car.outputs[2]];controls++;
    trace.update(JSON.stringify([controls,car.x,car.y,car.heading,car.outputs,car.bestProgress,car.laps])+'\n');
    if(controls%100===0||!car.alive)samples.push({controls,progress:car.bestProgress,laps:car.laps,speedMps:car.vehicle.speedMps,outputs:car.outputs.slice(),reason:car.reason});
    if(performance.now()-last>20000){last=performance.now();console.log('NEURAL_SELF_REPLAY '+JSON.stringify({controls,progress:car.bestProgress,laps:car.laps}));}
  }
  const legacyPolicyModules=Object.keys(require.cache).filter(name=>/neural-statehead|neural-frontier-chain|neural-command-live/.test(name));
  if(legacyPolicyModules.length)throw Error('Standalone replay unexpectedly imported a prior driving policy.');
  if(JSON.stringify(Runtime.sourceHashes())!==JSON.stringify(before))throw Error('Source/data changed during replay.');
  const gpu=Cuda.stats();if(!(gpu.gpuCalls>0)||gpu.cpuFallbacks!==0)throw Error('Actual anatomical graph CUDA execution required.');
  const result={progress:car.bestProgress,laps:car.laps,fitness:car.fitness,reason:car.reason,seconds:car.lifetime,lapTimes:car.lapTimes,complete:!car.alive,censored:car.alive,controls,paceContinuations:car.researchPaceContinuations||0};
  const report={format:'male-cns-neural-self-readout-replay-v1',modelSha256:Runtime.sha(fs.readFileSync(path.resolve(root,modelFile))),paceMode,rewardOverlaySha256,sourceSha256:before,parityMaxError,legacyPolicyModules,result,gpu,actionTraceSha256:trace.digest('hex'),samples,meetsTwoLapPhysicalGoal:!car.alive&&car.laps>=2&&F.isSafeLearningOutcome(car),limits:'Standalone learned readout from own past experience. Actual current footprint-aware neural observations. No trajectory tape, route input or prior controller in inference. Single-policy replay, not population learning or release readiness.'};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('NEURAL_SELF_REPLAY_DONE '+JSON.stringify({model:data.training.epoch,paceMode,result,parityMaxError,legacyPolicyModules,gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks,meetsTwoLapPhysicalGoal:report.meetsTwoLapPhysicalGoal,output}));
}catch(error){if(created)fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:error.stack},null,2),{flag:'wx'});throw error;}
finally{Dense.step=previousDense;Cuda.close();}
