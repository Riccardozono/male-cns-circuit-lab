'use strict';
// Paired one-second diagnostic: replay the saved policy unchanged, but remove
// brake torque in one branch only for 60 ticks. Never use the branch to train.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const save=path.join(base,'progress7-continuation-copy-20261027-101/SPERIMENTALE-solo-dev-v3-monza-gen92-worker0.malecns-save');
const trace=path.join(base,'progress7-gen92-frontier-braking-trace-cuda-20261027-104/report.json');
const out=path.join(base,'progress7-gen92-brake-effect-cuda-20261027-105');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js');
const Dense=require('../outputs/dense-neural.js'),Cuda=require('./cuda-exact-v3-runtime.cjs');
const data=require('../outputs/data/connectome.json'),circuits=require('../outputs/data/circuits.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const sources=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/dense-neural.js','work/cuda-exact-v3-pass.cjs'];
const hashes=()=>Object.fromEntries(sources.map(f=>[f,sha(path.join(root,f))]));
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
async function main(){
  assert.equal(fs.existsSync(out),false,'refuse to overwrite');
  assert.equal(sha(save),'47c58eef6a714e22cbaccff14fb6c976b3d72d33e2fb2c1bc0c221b21fb1de6d');
  assert.equal(sha(trace),'1bcddd23ffd12d53ee4e2c5801b3803b3ed21d82b5459854a9795ac136b3667b');
  const prior=JSON.parse(fs.readFileSync(trace,'utf8')),state=(await P.decode(fs.readFileSync(save,'utf8'),'5.6.0')).payload.workers[0].state,before=hashes();
  const originalDense=Dense.step,originalVehicle=F.Vehicle.step;
  const sample=(sim,car)=>({tick:sim.ticks,timeS:car.lifetime,progressM:car.bestProgress/(car.pixelsPerMeter||1),speedMps:car.vehicle.speedMps,
    steering:car.outputs[0],throttle:car.outputs[1],brake:car.outputs[2],accelLongMps2:car.vehicle.ax});
  try{
    Dense.step=(...args)=>Cuda.pass(...args);const results=[];
    for(const removeBrake of [false,true]){
      const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:40,circuitId:'monza',circuits,seed:state.seed});
      P.restore(sim,structuredClone(state));const car=sim.cars[0];sim.cars=[car];sim.running=true;
      let suppressedTicks=0,requestedBrakeSum=0,minRequested=Infinity,maxRequested=0,start=null;
      F.Vehicle.step=(target,commands,dt,ground)=>{
        if(target===car&&removeBrake&&sim.ticks>=3270&&sim.ticks<3330){
          const adjusted=commands.slice();requestedBrakeSum+=adjusted[2];minRequested=Math.min(minRequested,adjusted[2]);maxRequested=Math.max(maxRequested,adjusted[2]);
          adjusted[2]=0;suppressedTicks++;return originalVehicle(target,adjusted,dt,ground);
        }
        return originalVehicle(target,commands,dt,ground);
      };
      while(sim.ticks<3330&&car.alive){sim.tick();if(sim.ticks===3270)start=sample(sim,car);}
      assert.equal(sim.ticks,3330);assert.ok(car.alive&&start);
      const end=sample(sim,car);F.Vehicle.step=originalVehicle;
      results.push({branch:removeBrake?'brake-suppressed-for-one-second':'unmodified-control',start,end,
        suppressedTicks,requestedBrakeMean:suppressedTicks?requestedBrakeSum/suppressedTicks:null,
        requestedBrakeMin:suppressedTicks?minRequested:null,requestedBrakeMax:suppressedTicks?maxRequested:null});
    }
    const [control,without]=results,priorStart=prior.samples.find(x=>x.tick===3270),priorEnd=prior.samples.find(x=>x.tick===3330);
    for(const k of ['progressM','speedMps','steering','throttle','brake','accelLongMps2']){
      assert.ok(near(control.start[k],without.start[k]),'different starting '+k);
      assert.ok(near(control.start[k],priorStart[k])&&near(control.end[k],priorEnd[k]),'control differs from real trace '+k);
    }
    assert.equal(without.suppressedTicks,60);assert.ok(without.requestedBrakeMean>0);
    const gpu=Cuda.stats();assert.ok(gpu.gpuCalls>0&&gpu.cpuFallbacks===0&&gpu.device?.name.includes('RTX 4060'));
    assert.deepEqual(hashes(),before);assert.equal(sha(save),'47c58eef6a714e22cbaccff14fb6c976b3d72d33e2fb2c1bc0c221b21fb1de6d');
    const result={passed:true,model:'V3',circuit:'Monza',method:'Replay the same saved policy from the line. For 60 physics ticks only, override the physical brake command to zero in one diagnostic branch; the neural controller otherwise remains live. No resulting candidate is trained or saved.',
      startTick:3270,endTick:3330,results,speedDifferenceMps:without.end.speedMps-control.end.speedMps,
      speedDifferenceKmh:(without.end.speedMps-control.end.speedMps)*3.6,sourceHashes:before,runnerSha256:sha(__filename),saveSha256:sha(save),traceSha256:sha(trace),gpu,
      boundary:'One experimental one-second intervention on one saved V3/Monza trajectory; proves only the observed response in this trial, not general behavior, safe driving, or training improvement.'};
    fs.mkdirSync(out,{recursive:false});const file=path.join(out,'report.json');fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log('V3_BRAKE_EFFECT '+JSON.stringify({report:file,sha256:sha(file),results,speedDifferenceKmh:result.speedDifferenceKmh,gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks}));
  }finally{Dense.step=originalDense;F.Vehicle.step=originalVehicle;Cuda.close();}
}
main().catch(e=>{console.error('V3_BRAKE_EFFECT_FAILED '+(e.stack||e));process.exitCode=1;});
