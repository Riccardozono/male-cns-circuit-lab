'use strict';
// Exact-source V3/Monza replay of the best safe policy in a research checkpoint.
// Captures neural commands, sensors and vehicle state near its stopping point.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),
  Legacy=require('../outputs/legacy-models.js'),Dense=require('../outputs/dense-neural.js'),Cuda=require('./cuda-exact-v3-runtime.cjs');
const input=path.resolve(process.argv[2]||'.impeccable/review/learning-ml/progress9-v3-gen98-population-ab-rtx-20261029/population-100-followup/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen106.malecns-save');
const out=path.resolve(process.argv[3]||'.impeccable/review/learning-ml/progress9-v3-gen98-population-ab-rtx-20261029/safe-hof-trace');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Node 24.19.0 required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing diagnostic folder');
  const raw=fs.readFileSync(input),inputSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),
    state=structuredClone(decoded.payload.workers[0].state),data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),
    circuits=require('../outputs/data/circuits.json'),sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/dense-neural.js','work/cuda-exact-v3-runtime.cjs','work/cuda-exact-v3-pass.cjs'];
  const before=Object.fromEntries(sourceFiles.map(p=>[p,sha(fs.readFileSync(path.join(root,p)))]));
  P.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,state);
  if(!state.hallOfFame?.length)throw Error('No safe V3 Hall of Fame candidate in checkpoint');
  const ranked=state.hallOfFame.map((x,i)=>({...x,index:i})).sort((a,b)=>b.bestProgress-a.bestProgress),candidate=ranked[0];
  const expected={progressM:candidate.bestProgress/(sim.track.pixelsPerMeter||1),laps:candidate.laps,fitness:candidate.fitness};
  sim.population=1;sim.spawn([F.cloneGenome(candidate.genome)],false,[0]);sim.running=true;
  const originalStep=Dense.step;Dense.step=(...args)=>Cuda.pass(...args);
  const rows=[];let terminal=null,gpu={calls:0,gpuCalls:0,kernelLaunches:0,cpuFallbacks:0};
  const sample=car=>{
    const p=F.locate(sim.track,car.x,car.y),w=F.trackWidthAt(sim.track,p.along),v=car.vehicle||{};
    return {tick:sim.ticks,progressM:car.bestProgress/(car.pixelsPerMeter||1),alongM:p.along/(car.pixelsPerMeter||1),
      centerDistanceM:p.distance/(car.pixelsPerMeter||1),roadWidthM:w.widthMeters,onRoad:F.onRoad(sim.track,car.x,car.y),
      x:car.x,y:car.y,heading:car.heading,speedMps:v.speedMps??0,yawRate:v.r??car.yawRate??0,
      steering:car.outputs[0],throttle:car.outputs[1],brake:car.outputs[2],sensors:car.sensorVector.slice()};
  };
  sim.onTrialTick=s=>{
    const car=s.cars[0];
    if(car&&(car.bestProgress/(car.pixelsPerMeter||1)>=760)&&(s.ticks%24===0||!car.alive))rows.push(sample(car));
    if(car&&!car.alive&&!terminal)terminal={reason:car.reason||'',safe:F.isSafeLearningOutcome(car),final:sample(car),fitness:car.fitness,laps:car.laps};
  };
  const start=sim.generation;let ticks=0;
  try{
    while(!terminal&&sim.generation===start&&ticks++<60000)sim.tick();
  }finally{sim.running=false;Dense.step=originalStep;gpu=Cuda.stats();Cuda.close();}
  if(!terminal)throw Error('HOF replay did not terminate naturally');
  const after=Object.fromEntries(sourceFiles.map(p=>[p,sha(fs.readFileSync(path.join(root,p)))])),inputUnchanged=sha(fs.readFileSync(input))===inputSha,
    userSave='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',userSaveSha=sha(fs.readFileSync(userSave));
  const report={format:'male-cns-v3-safe-hof-replay-trace-v1',passed:inputUnchanged&&JSON.stringify(before)===JSON.stringify(after)&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0,
    learningSucceeded:false,input:{path:input,sha256:inputSha,unchanged:inputUnchanged},userSave:{sha256:userSaveSha,expectedSha256:'29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'},
    checkpoint:{generation:state.generation,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision,hallOfFameIndex:candidate.index,expected},
    replay:{ticks,terminal,trace:rows},sourceHashes:{before,after},gpu,
    method:'Replay the highest-progress safe V3 Hall of Fame genome from a validated current-source checkpoint on Monza with the exact V3 CUDA pass. Captures real sensors, neural commands and vehicle state near 760m onward; no route/position input is added to the policy and no training or user save is changed.',
    boundary:'One checkpoint and one safe candidate. This diagnostic can identify the policy and physical state at its stop; it cannot establish a general cause or learning improvement.'};
  if(userSaveSha!==report.userSave.expectedSha256)throw Error('Personal user save checksum changed');
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('SAFE_HOF_TRACE '+JSON.stringify({passed:report.passed,expected,terminal:terminal.final,reason:terminal.reason,safe:terminal.safe,traceSamples:rows.length,gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks,report:path.join(out,'report.json')}));
  if(!report.passed)process.exitCode=1;
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
