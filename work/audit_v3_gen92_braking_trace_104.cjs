'use strict';
// Replay the actual saved frontier genotype from the start, with read-only
// telemetry. No controller, rewards or user save are modified.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const save=path.join(base,'progress7-continuation-copy-20261027-101/SPERIMENTALE-solo-dev-v3-monza-gen92-worker0.malecns-save');
const prior=path.join(base,'progress7-natural-continue-cuda-20261027-100/report.json');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(base,'progress7-gen92-frontier-braking-trace-cuda-20261027-104');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js');
const Dense=require('../outputs/dense-neural.js'),Cuda=require('./cuda-exact-v3-runtime.cjs');
const data=require('../outputs/data/connectome.json'),circuits=require('../outputs/data/circuits.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const paths=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/dense-neural.js','work/cuda-exact-v3-pass.cjs'];
const hashes=()=>Object.fromEntries(paths.map(f=>[f,sha(path.join(root,f))]));
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
async function main(){
  assert.equal(fs.existsSync(out),false,'refuse to overwrite');
  assert.equal(sha(save),'47c58eef6a714e22cbaccff14fb6c976b3d72d33e2fb2c1bc0c221b21fb1de6d');
  assert.equal(sha(original),'29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3');
  assert.equal(sha(prior),'442b749d74ea552b2173c4d15427966718ef8d5b88a4d3e8d300ca7c03a8f16a');
  const before=hashes(),report=JSON.parse(fs.readFileSync(prior,'utf8')),reference=report.rows.find(r=>r.generation===89).outcomes.find(c=>c.id===0);
  const payload=(await P.decode(fs.readFileSync(save,'utf8'),'5.6.0')).payload,state=payload.workers[0].state;
  assert.equal(state.generation,92);assert.equal(state.rewardRevision,'progress-7-moving-pace');
  const frontier=state.hallOfFame.slice().sort((a,b)=>b.bestProgress-a.bestProgress)[0];
  assert.deepEqual(state.genomes[0],frontier.genome);assert.ok(near(frontier.bestProgress,reference.progressM));
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:40,circuitId:'monza',circuits,seed:state.seed});
  P.restore(sim,structuredClone(state));const car=sim.cars[0];sim.cars=[car];sim.running=true;
  const samples=[];let terminal=null,peakSpeed=0;
  sim.onTrialTick=s=>{
    const c=s.cars[0],record={tick:s.ticks,timeS:c.lifetime,progressM:c.bestProgress/(c.pixelsPerMeter||1),
      speedMps:c.vehicle.speedMps,steering:c.outputs[0],throttle:c.outputs[1],brake:c.outputs[2],
      accelLongMps2:c.vehicle.ax,gear:c.vehicle.gear,reason:c.reason,alive:c.alive};
    peakSpeed=Math.max(peakSpeed,record.speedMps);
    if(s.ticks%30===0||!c.alive)samples.push(record);
    if(!c.alive){terminal={...record,id:c.id,x:c.x,y:c.y,heading:c.heading,laps:c.laps,outputs:c.outputs.slice(),fitness:c.fitness,safe:F.isSafeLearningOutcome(c)};s.mode='diagnostic-stop';}
  };
  const old=Dense.step;try{
    Dense.step=(...args)=>Cuda.pass(...args);let ticks=0;
    while(sim.running&&ticks<10000){sim.tick();ticks++;}
    assert.ok(terminal,'episode did not terminate within the diagnostic watchdog');
    for(const key of ['tick','id','reason','laps','safe'])assert.equal(terminal[key],reference[key],key+' mismatch');
    for(const key of ['x','y','heading','progressM'])assert.ok(near(terminal[key],reference[key]),key+' mismatch');
    assert.ok(terminal.outputs.every((x,i)=>near(x,reference.outputs[i])),'terminal outputs differ');
    const gpu=Cuda.stats();assert.ok(gpu.gpuCalls>0&&gpu.cpuFallbacks===0&&gpu.device?.name.includes('RTX 4060'));
    assert.deepEqual(hashes(),before);assert.equal(sha(save),'47c58eef6a714e22cbaccff14fb6c976b3d72d33e2fb2c1bc0c221b21fb1de6d');
    const at=distance=>samples.find(s=>s.progressM>=distance)||null;
    const result={passed:true,learningSucceeded:false,model:'V3',circuit:'Monza',worker:0,populationReplayed:1,startingGeneration:92,
      referenceGeneration:89,referenceId:0,referencePhysicalTerminalMatched:true,originalSaveSha256:sha(original),saveSha256:sha(save),
      trainingReportSha256:sha(prior),runnerSha256:sha(__filename),sourceHashes:before,peakSpeedMps:peakSpeed,
      milestones:{m400:at(400),m600:at(600),m700:at(700),m750:at(750),m780:at(780)},terminal,gpu,sampleEveryTicks:30,samples,
      boundary:'One deterministic single-car replay of the saved frontier on Monza, checked against the earlier generation 89 terminal outcome. Telemetry shows association, not causal proof or generalization; no alternative action or policy was imposed.'};
    fs.mkdirSync(out,{recursive:false});const file=path.join(out,'report.json');fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log('V3_BRAKING_TRACE '+JSON.stringify({passed:true,report:file,sha256:sha(file),terminal,milestones:result.milestones,peakSpeedMps:peakSpeed,gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks}));
  }finally{Dense.step=old;Cuda.close();}
}
main().catch(e=>{console.error('V3_BRAKING_TRACE_FAILED '+(e.stack||e));process.exitCode=1;});
