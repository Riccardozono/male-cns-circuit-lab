'use strict';
// Read-only V3 replay: correlate live neural outputs with the actual wall-ray
// inputs and road geometry immediately before the saved Monza frontier stops.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const save=path.join(base,'progress7-continuation-copy-20261027-101/SPERIMENTALE-solo-dev-v3-monza-gen92-worker0.malecns-save');
const trace=path.join(base,'progress7-gen92-frontier-braking-trace-cuda-20261027-104/report.json');
const out=path.join(base,'progress7-gen92-sensor-context-cuda-20261027-108');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js');
const Dense=require('../outputs/dense-neural.js'),Cuda=require('./cuda-exact-v3-runtime.cjs');
const data=require('../outputs/data/connectome.json'),circuits=require('../outputs/data/circuits.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/dense-neural.js','work/cuda-exact-v3-pass.cjs'];
const sourceHashes=()=>Object.fromEntries(sourceFiles.map(f=>[f,sha(path.join(root,f))]));
const angleDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function geometry(track,car){
  const nearest=F.locate(track,car.x,car.y);let lo=0,hi=track.segments.length;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(track.segments[mid].start<=nearest.along)lo=mid;else hi=mid;}
  const seg=track.segments[lo],heading=Math.atan2(seg.b.y-seg.a.y,seg.b.x-seg.a.x),length=Math.hypot(seg.b.x-seg.a.x,seg.b.y-seg.a.y)||1;
  const tx=(seg.b.x-seg.a.x)/length,ty=(seg.b.y-seg.a.y)/length;
  return {centerlineDistanceM:nearest.distance/(car.pixelsPerMeter||1),centerlineAlongM:nearest.along/(car.pixelsPerMeter||1),
    centerlineHeading:heading,headingError:angleDiff(car.heading,heading),signedLateralOffsetM:(tx*(car.y-nearest.y)-ty*(car.x-nearest.x))/(car.pixelsPerMeter||1)};
}
async function main(){
  assert.equal(fs.existsSync(out),false,'refuse to overwrite');
  assert.equal(sha(save),'47c58eef6a714e22cbaccff14fb6c976b3d72d33e2fb2c1bc0c221b21fb1de6d');
  assert.equal(sha(original),'29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3');
  assert.equal(sha(trace),'1bcddd23ffd12d53ee4e2c5801b3803b3ed21d82b5459854a9795ac136b3667b');
  const before=sourceHashes(),prior=JSON.parse(fs.readFileSync(trace,'utf8'));
  const payload=(await P.decode(fs.readFileSync(save,'utf8'),'5.6.0')).payload,state=payload.workers[0].state;
  assert.equal(state.generation,92);assert.equal(state.rewardRevision,'progress-7-moving-pace');
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:40,circuitId:'monza',circuits,seed:state.seed});
  P.restore(sim,structuredClone(state));const car=sim.cars[0];sim.cars=[car];sim.running=true;
  const samples=[];let terminal=null,peakSpeed=0;
  sim.onTrialTick=s=>{
    const c=s.cars[0],progressM=c.bestProgress/(c.pixelsPerMeter||1);peakSpeed=Math.max(peakSpeed,c.vehicle.speedMps);
    if((s.ticks%15===0&&progressM>=560&&progressM<=840)||!c.alive){
      samples.push({tick:s.ticks,timeS:c.lifetime,progressM,x:c.x,y:c.y,heading:c.heading,speedMps:c.vehicle.speedMps,
        steering:c.outputs[0],throttle:c.outputs[1],brake:c.outputs[2],accelLongMps2:c.vehicle.ax,gear:c.vehicle.gear,
        sensorVector:F.sense(s.track,c).concat(F.physicsSense(c,s.track)),wallRays:F.sensorDistances(s.track,c),geometry:geometry(s.track,c),reason:c.reason,alive:c.alive});
    }
    if(!c.alive){terminal={tick:s.ticks,timeS:c.lifetime,progressM,speedMps:c.vehicle.speedMps,outputs:c.outputs.slice(),
      reason:c.reason,laps:c.laps,fitness:c.fitness,safe:F.isSafeLearningOutcome(c)};s.mode='diagnostic-stop';}
  };
  const oldStep=Dense.step;
  try{
    Dense.step=(...args)=>Cuda.pass(...args);let ticks=0;
    while(sim.running&&ticks<10000){sim.tick();ticks++;}
    assert.ok(terminal,'episode did not terminate within diagnostic watchdog');
    assert.equal(terminal.reason,prior.terminal.reason);assert.equal(terminal.laps,prior.terminal.laps);
    assert.ok(Math.abs(terminal.progressM-prior.terminal.progressM)<1e-8,'physical replay terminal differs');
    assert.ok(samples.some(x=>x.progressM>600&&x.progressM<700&&x.brake>0),'no brake onset sample');
    assert.ok(samples.some(x=>x.progressM>780&&x.progressM<800&&Math.abs(x.steering)<.1),'no approach-to-curve sample');
    const gpu=Cuda.stats();assert.ok(gpu.gpuCalls>0&&gpu.cpuFallbacks===0&&gpu.device?.name.includes('RTX 4060'));
    assert.deepEqual(sourceHashes(),before);assert.equal(sha(save),'47c58eef6a714e22cbaccff14fb6c976b3d72d33e2fb2c1bc0c221b21fb1de6d');
    assert.equal(sha(original),'29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3');
    const result={passed:true,model:'V3',circuit:'Monza',worker:0,generation:92,seed:state.seed,terminal,peakSpeedMps:peakSpeed,
      sourceHashes:before,saveSha256:sha(save),originalSaveSha256:sha(original),referenceTraceSha256:sha(trace),runnerSha256:sha(__filename),gpu,samples,
      boundary:'One deterministic, unmodified saved-policy replay. Sensors and wall-ray distances are observed inputs; geometry is measured against the circuit centerline. This establishes what the controller received on this run, not a general causal explanation or learned improvement.'};
    fs.mkdirSync(out,{recursive:false});const file=path.join(out,'report.json');fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log('V3_SENSOR_CONTEXT '+JSON.stringify({passed:true,file,sha256:sha(file),terminal,samples:samples.length,
      firstBrakeSamples:samples.filter(x=>x.progressM>=600&&x.progressM<=700&&x.brake>0).slice(0,2),
      curveApproachSamples:samples.filter(x=>x.progressM>=775&&x.progressM<=800).slice(-3),gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks}));
  }finally{Dense.step=oldStep;Cuda.close();}
}
main().catch(e=>{console.error('V3_SENSOR_CONTEXT_FAILED '+(e.stack||e));process.exitCode=1;});
