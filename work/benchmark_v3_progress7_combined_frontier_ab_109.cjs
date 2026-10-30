'use strict';
// Paired natural-generation test of the stopped-frontier motor mutation.
// The only treatment difference is longitudinal-only -> combined motor
// mutations for stopped, safe no-lap frontier parents. Physics and policy
// actions remain live neural outputs; no save or application file is changed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const copy=path.join(base,'progress7-continuation-copy-20261027-101/SPERIMENTALE-solo-dev-v3-monza-gen92-worker0.malecns-save');
const checkpoint=path.join(base,'progress7-natural-continue-cuda-20261027-100/checkpoint-0.private.json');
const reference=path.join(base,'progress7-natural-continue-cuda-20261027-100/report.json');
const out=path.join(base,'progress7-combined-frontier-ab-cuda-20261027-110');
const Fbase=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js');
const Dense=require('../outputs/dense-neural.js'),Cuda=require('./cuda-exact-v3-runtime.cjs');
const data=require('../outputs/data/connectome.json'),circuits=require('../outputs/data/circuits.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),hash=s=>crypto.createHash('sha256').update(JSON.stringify(s)).digest('hex');
const expected={original:'29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3',
  copy:'47c58eef6a714e22cbaccff14fb6c976b3d72d33e2fb2c1bc0c221b21fb1de6d',
  checkpoint:'8a158de34576ed12dca9852c513f97f82f93cce2a4f21097c1b66f0be14b8b30',
  reference:'442b749d74ea552b2173c4d15427966718ef8d5b88a4d3e8d300ca7c03a8f16a'};
const sources=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js',
  'outputs/vehicle-992.js','outputs/dense-neural.js','work/cuda-exact-v3-pass.cjs'];
const hashes=()=>Object.fromEntries(sources.map(f=>[f,sha(path.join(root,f))]));
const check=(v,m)=>{if(!v)throw Error(m);};
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
function replaceOnce(source,oldText,newText){check(source.split(oldText).length===2,'Missing or ambiguous source anchor');return source.replace(oldText,newText);}
function engine(treatment){
  const file=path.join(root,'outputs/simulation.js');let source=fs.readFileSync(file,'utf8');
  if(treatment)source=replaceOnce(source,
    "const frontierMutationFocus=stagnantFrontier&&safeLeaderStopped?'longitudinal':null;",
    "const frontierMutationFocus=stagnantFrontier&&safeLeaderStopped?'combined':null;");
  const focusLine="const frontierMutationFocus=stagnantFrontier&&safeLeaderStopped?'"+(treatment?'combined':'longitudinal')+"':null;";
  source=replaceOnce(source,focusLine,focusLine+"\n      this.__mutationAudit={generation:this.generation,focus:frontierMutationFocus,stagnantFrontier,safeLeaderStopped,stagnation:this.stagnation,leader:safeProgressLeader?{id:safeProgressLeader.id,progressM:safeProgressLeader.bestProgress/(this.track.pixelsPerMeter||1),speedMps:safeProgressLeader.vehicle?.speedMps,outputs:safeProgressLeader.outputs.slice(),reason:safeProgressLeader.reason}:null};");
  const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(source,file);
  return {F:m.exports,sourceSha256:crypto.createHash('sha256').update(source).digest('hex')};
}
function samePhysical(a,b){return a.id===b.id&&a.tick===b.tick&&a.reason===b.reason&&a.safe===b.safe&&a.laps===b.laps&&
  ['lifetime','x','y','heading','progressM','fitness'].every(k=>near(a[k],b[k]))&&a.outputs.every((v,i)=>near(v,b.outputs[i]));}
function run(arm,F,state,sourceHash){
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:40,circuitId:'monza',circuits,seed:state.seed});
  P.restore(sim,structuredClone(state));check(hash(P.capture(sim))===hash(state),'Initial state changed on restore');sim.running=true;
  let terminal=new Map(),ticks=0,last=Date.now();const rows=[],started=Date.now();
  sim.onTrialTick=s=>{
    for(const c of s.cars)if(!c.alive&&!terminal.has(c.id))terminal.set(c.id,{id:c.id,tick:s.ticks,reason:c.reason,lifetime:c.lifetime,
      x:c.x,y:c.y,heading:c.heading,progressM:c.bestProgress/(c.pixelsPerMeter||1),laps:c.laps,outputs:c.outputs.slice(),fitness:c.fitness,safe:F.isSafeLearningOutcome(c)});
    if(Date.now()-last>=20000){last=Date.now();console.log('COMBINED_FRONTIER_PROGRESS '+JSON.stringify({arm,generation:s.generation,
      alive:s.cars.filter(c=>c.alive).length,gpuCalls:Cuda.stats().gpuCalls}));}
  };
  while(rows.length<4){
    check(ticks<60000,'Diagnostic watchdog exceeded');const generation=sim.generation;sim.tick();ticks++;
    if(sim.generation!==generation){
      check(terminal.size===40,'Incomplete physical generation');
      const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(c=>c.safe);
      const row={generation,ticks,safeCount:safe.length,collisionCount:outcomes.filter(c=>c.reason==='urto').length,
        bestSafeProgressM:safe.length?Math.max(...safe.map(c=>c.progressM)):null,maxSafeLaps:safe.length?Math.max(...safe.map(c=>c.laps)):0,
        safeAtLeast500M:safe.filter(c=>c.progressM>=500).length,meanSafeProgressM:safe.length?safe.reduce((a,c)=>a+c.progressM,0)/safe.length:null,
        bestSafeFitness:safe.length?Math.max(...safe.map(c=>c.fitness)):null,mutation:structuredClone(sim.__mutationAudit),outcomes};
      rows.push(row);
      const next={format:'private-combined-frontier-ab-checkpoint-v1',arm,completedGenerations:rows.length,nextGeneration:sim.generation,
        state:P.capture(sim),runnerSha256:sha(__filename),inputSaveSha256:expected.copy,experimentalSourceSha256:sourceHash};
      P.validateTraining(next.state,sim.graph,sim.circuits);
      fs.writeFileSync(path.join(out,arm+'-generation-'+generation+'.private.json'),JSON.stringify(next)+'\n',{flag:'wx'});
      const short={arm,generation,ticks,safe:row.safeCount,collisions:row.collisionCount,bestSafeProgressM:row.bestSafeProgressM,
        safeAtLeast500M:row.safeAtLeast500M,meanSafeProgressM:row.meanSafeProgressM,laps:row.maxSafeLaps,mutation:row.mutation,
        gpuCalls:Cuda.stats().gpuCalls,wallSeconds:(Date.now()-started)/1000};
      fs.appendFileSync(path.join(out,'progress.ndjson'),JSON.stringify(short)+'\n');
      console.log('COMBINED_FRONTIER_GENERATION '+JSON.stringify(short));terminal=new Map();ticks=0;
    }
  }
  sim.running=false;return {arm,rows,wallSeconds:(Date.now()-started)/1000};
}
async function main(){
  check(process.versions.node==='24.19.0'&&!fs.existsSync(out),'Pinned Node and new output required');
  for(const [file,key] of [[original,'original'],[copy,'copy'],[checkpoint,'checkpoint'],[reference,'reference']])check(sha(file)===expected[key],key+' differs');
  const before=hashes(),cp=JSON.parse(fs.readFileSync(checkpoint,'utf8')),payload=(await P.decode(fs.readFileSync(copy,'utf8'),'5.6.0')).payload;
  check(cp.state.generation===92&&cp.state.population===40&&cp.state.rewardRevision==='progress-7-moving-pace'&&
    hash(payload.workers[0].state)===hash(cp.state),'Checkpoint/save mismatch');
  const a=engine(false),b=engine(true),oldStep=Dense.step;fs.mkdirSync(out,{recursive:false});
  fs.writeFileSync(path.join(out,'metadata.json'),JSON.stringify({format:'private-combined-frontier-ab-v1',model:'V3',circuit:'Monza',
    startGeneration:92,worker:0,population:40,seed:cp.state.seed,generationsPerArm:4,
    treatment:'When a safe, stalled no-lap frontier parent is stopped without throttle, mutate both motor action heads (steering and longitudinal) in the actual learned neural contexts instead of the longitudinal head alone.',
    sourceHashes:before,runnerSha256:sha(__filename),inputSaveSha256:expected.copy,inputCheckpointSha256:expected.checkpoint,
    memoryEngineHashes:{control:a.sourceSha256,treatment:b.sourceSha256},
    boundary:'Research only; same saved V3 policy, actual MaleCNS action outputs, circuit, physics, sensors, reward, population, RNG and optimizer. No app code or user save is changed.'},null,2)+'\n',{flag:'wx'});
  try{
    Dense.step=(...args)=>Cuda.pass(...args);
    const control=run('control',a.F,cp.state,a.sourceSha256),afterControl=Cuda.stats();
    const treatment=run('combined-motor-focus',b.F,cp.state,b.sourceSha256),gpu=Cuda.stats();
    check(control.rows[0].generation===92&&treatment.rows[0].generation===92&&
      control.rows[0].outcomes.every((c,i)=>samePhysical(c,treatment.rows[0].outcomes[i])),'Paired starting episodes differ');
    check(control.rows.every(r=>r.mutation.focus==='longitudinal'&&r.mutation.stagnantFrontier&&r.mutation.safeLeaderStopped),'Control focus condition not active in every generation');
    check(treatment.rows.every(r=>r.mutation.focus==='combined'&&r.mutation.stagnantFrontier&&r.mutation.safeLeaderStopped),'Treatment focus condition not active in every generation');
    check(gpu.gpuCalls>0&&gpu.cpuFallbacks===0&&gpu.device?.name.includes('RTX 4060'),'CUDA not verified');
    check(JSON.stringify(before)===JSON.stringify(hashes()),'Application source changed');
    for(const [file,key] of [[original,'original'],[copy,'copy'],[checkpoint,'checkpoint'],[reference,'reference']])check(sha(file)===expected[key],key+' changed');
    const pairs=control.rows.map((c,i)=>({generation:c.generation,controlBestM:c.bestSafeProgressM,treatmentBestM:treatment.rows[i].bestSafeProgressM,
      deltaM:treatment.rows[i].bestSafeProgressM-c.bestSafeProgressM,controlSafe:c.safeCount,treatmentSafe:treatment.rows[i].safeCount,
      controlCollisions:c.collisionCount,treatmentCollisions:treatment.rows[i].collisionCount,controlLaps:c.maxSafeLaps,treatmentLaps:treatment.rows[i].maxSafeLaps}));
    const result={passed:true,learningSucceeded:treatment.rows.some(r=>r.maxSafeLaps>=2),approvedForApp:false,
      originalSaveSha256:expected.original,copySha256:expected.copy,checkpointSha256:expected.checkpoint,referenceSha256:expected.reference,
      runnerSha256:sha(__filename),sourceHashes:{before,after:hashes()},memoryEngineHashes:{control:a.sourceSha256,treatment:b.sourceSha256},
      settings:{model:'V3',circuit:'Monza',worker:0,seed:cp.state.seed,population:40,startGeneration:92,generationsPerArm:4,
        revision:cp.state.rewardRevision,neuralBackend:'private exact V3 CUDA kernel'},
      firstPairedGenerationMatches:true,control,treatment,pairs,gpu:{...gpu,controlGpuCalls:afterControl.gpuCalls,bandGpuCalls:gpu.gpuCalls-afterControl.gpuCalls},
      boundary:'One actual checkpoint and seed, four complete natural generations per arm. The experimental mutation changes offspring generation only and does not intervene in neural driving. No complete two-lap learning or generalization claim.'};
    const file=path.join(out,'report.json');fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log('COMBINED_FRONTIER_REPORT '+JSON.stringify({file,sha256:sha(file),pairs,learningSucceeded:result.learningSucceeded,
      mutationFocus:{control:control.rows.map(r=>r.mutation),treatment:treatment.rows.map(r=>r.mutation)},
      gpu:{calls:gpu.gpuCalls,controlGpuCalls:afterControl.gpuCalls,bandGpuCalls:gpu.gpuCalls-afterControl.gpuCalls,cpuFallbacks:gpu.cpuFallbacks,device:gpu.device}}));
  }finally{Dense.step=oldStep;Cuda.close();}
}
main().catch(e=>{console.error('COMBINED_FRONTIER_FAILED '+(e.stack||e));process.exitCode=1;});
