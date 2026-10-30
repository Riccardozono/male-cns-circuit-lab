'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js'),{BatchCudaPass}=require('./cuda-exact-v3-batch-pass.cjs'),Batch=require('./cuda-v3-batch-tick.cjs');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,process.env.MALECNS_CUDA_BATCH_VERIFY_OUT||'.impeccable/review/learning-ml/exact-v3-batch-verification-20261022-01');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength),circuits=require('../outputs/data/circuits.json'),data=Legacy.tagV3(require('../outputs/data/connectome.json'));
const files=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','work/cuda-exact-v3-batch-pass.cjs','work/cuda-v3-batch-tick.cjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))])),before=hashes();
async function load(file){const d=await P.decode(fs.readFileSync(file,'utf8'),'5.6.0'),s=d.payload.workers[0].state,sim=new F.Simulation(data,{modelId:'v3',population:s.population,circuitId:'monza',circuits,seed:s.seed});P.restore(sim,s);sim.running=true;return sim;}
function same(a,b){
  assert.equal(a.generation,b.generation);assert.equal(a.ticks,b.ticks);assert.equal(a.elapsed,b.elapsed);assert.equal(a.random.getState(),b.random.getState());assert.deepEqual(a.history,b.history);
  assert.equal(a.cars.length,b.cars.length);
  for(let i=0;i<a.cars.length;i++){
    const x=a.cars[i],y=b.cars[i];for(const k of ['activity','next','sum','injection'])assert.ok(bytes(x.brain[k]).equals(bytes(y.brain[k])),`${i} ${k} mismatch at tick ${a.ticks}`);
    const rest=brain=>Object.fromEntries(Object.entries(brain).filter(([k])=>!['activity','next','sum','injection'].includes(k)));
    assert.deepEqual(rest(x.brain),rest(y.brain));const car=c=>Object.fromEntries(Object.entries(c).filter(([k])=>k!=='brain'));assert.deepEqual(car(x),car(y));
  }
}
async function main(){
  if(fs.existsSync(out))throw Error('Preserve existing batch proof');fs.mkdirSync(out,{recursive:false});
  const batch=new BatchCudaPass(),checks=[];
  try{
    const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
    const expanded=path.join(root,'.impeccable/review/learning-ml/saved-v3-crossover-100-continuous-cuda-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen66.malecns-save');
    for(const [file,ticks] of [[original,480],[expanded,360]]){
      const reference=await load(file),candidate=await load(file);same(reference,candidate);
      const start=performance.now();for(let tick=0;tick<ticks;tick++){reference.tick();Batch.tick(candidate,batch);same(reference,candidate);}
      checks.push({file,sha256:sha(fs.readFileSync(file)),population:reference.population,ticks,allBrainVehiclePolicyRngFieldsBitwiseOrDeepEqual:true,wallSeconds:(performance.now()-start)/1000});
      console.log('BATCH_EQUIVALENCE '+JSON.stringify(checks.at(-1)));
    }
    const sim=await load(original),first=sim.generation,known=require('../.impeccable/review/learning-ml/saved-v3-functional-block-crossover-source-saved-rng-ab-20261022-01/report.json').control.rows[0].terminalOutcomes;
    let observed=null;sim.onTrialTick=s=>{if(s.cars.every(c=>!c.alive))observed=s.cars.map(c=>({id:c.id,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),laps:c.laps,reason:c.reason||'',safe:F.isSafeLearningOutcome(c)}));};
    while(sim.generation===first)Batch.tick(sim,batch);
    assert.deepEqual(observed,known.map(({id,progressM,laps,reason,safe})=>({id,progressM,laps,reason,safe})));
    checks.push({completeGeneration:64,population:40,all40PhysicalOutcomesExactlyReproduced:true});
    const report={passed:true,checks,gpu:batch.stats(),cudaIdentity:batch.identity(),sourceHashes:before,sourceFilesUnchanged:JSON.stringify(before)===JSON.stringify(hashes()),boundary:'Finite full-state equivalence at every tick on two real populations (40 and 100 agents), plus one complete generation replay. Existing exact-order licensed kernel, original encoder and physics. Does not prove learning or universal equivalence for every possible state.'};
    assert.ok(report.sourceFilesUnchanged&&report.gpu.batchCalls>0&&report.gpu.cpuFallbacks===0);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log('BATCH_VERIFICATION_RESULT '+JSON.stringify({passed:true,checks,gpu:report.gpu,report:path.join(out,'report.json')}));
  }finally{batch.close();}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
