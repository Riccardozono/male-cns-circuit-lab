'use strict';
// Resume a verified single-worker checkpoint, retaining the actual graph,
// learned policy, optimizer and RNG. No controller, route or action is added.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const checkpoint=path.join(base,'progress7-natural-training-cuda-20261027-92/checkpoint-0.private.json');
const saved=path.join(base,'progress7-trained-copy-20261027-93/SPERIMENTALE-solo-dev-v3-monza-gen80-worker0.malecns-save');
const reference=path.join(base,'progress7-live-practice-checkpoint-ab-cuda-20261027-94/report.json');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(base,'progress7-natural-continue-cuda-20261027-100');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),L=require('../outputs/neural-learning.js'),Legacy=require('../outputs/legacy-models.js');
const Dense=require('../outputs/dense-neural.js'),Cuda=require('./cuda-exact-v3-runtime.cjs');
const data=require('../outputs/data/connectome.json'),circuits=require('../outputs/data/circuits.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const check=(v,m)=>{if(!v)throw Error(m);},near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
const expected={checkpoint:'2637c32e9bf92cbbb4af2e73f46f091c4ca8af091a726756a21bc051f6141b26',
 saved:'616f3040487aed072e09cb1961e3b9c135925156ad199d9b44609ec89eba5fbb',
 reference:'0bef71e166c94267021c998cde6cc70ad633d6bd7beacaa53874a4b518fe1c0f',
 original:'29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'};
const sources=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/dense-neural.js','work/cuda-exact-v3-pass.cjs'];
const hashes=()=>Object.fromEntries(sources.map(f=>[f,sha(path.join(root,f))]));
const samePhysical=(a,b)=>a.id===b.id&&a.tick===b.tick&&a.reason===b.reason&&a.safe===b.safe&&a.laps===b.laps&&
  ['lifetime','x','y','heading','progressM','fitness'].every(k=>near(a[k],b[k]))&&a.outputs.every((v,i)=>near(v,b.outputs[i]));
async function main(){
  check(!fs.existsSync(out)&&process.versions.node==='24.19.0','Fresh output and pinned Node required');
  for(const [f,k] of [[checkpoint,'checkpoint'],[saved,'saved'],[reference,'reference'],[original,'original']])check(sha(f)===expected[k],k+' identity differs');
  const cp=JSON.parse(fs.readFileSync(checkpoint,'utf8')),payload=(await P.decode(fs.readFileSync(saved,'utf8'),'5.6.0')).payload,
    prior=JSON.parse(fs.readFileSync(reference,'utf8')),before=hashes();
  check(cp.state.generation===80&&cp.state.population===40&&cp.state.rewardRevision==='progress-7-moving-pace'&&cp.state.externalChampion===null&&
    hash(payload.workers[0].state)===hash(cp.state)&&prior.passed,'Unexpected verified checkpoint');
  const initialReference=prior.control.rows.filter(row=>row.generation===80||row.generation===81);
  check(initialReference.length===2,'Two natural reference generations required');
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:40,circuitId:'monza',circuits,seed:cp.state.seed});
  P.restore(sim,structuredClone(cp.state));check(hash(P.capture(sim))===hash(cp.state),'Initial restore differs');sim.running=true;
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'metadata.json'),JSON.stringify({format:'private-v3-progress7-continuation-v1',
    model:'V3',circuit:'Monza',worker:0,seed:cp.state.seed,population:40,startGeneration:80,maxGenerations:12,
    inputCheckpointSha256:expected.checkpoint,inputSaveSha256:expected.saved,originalSaveSha256:expected.original,referenceSha256:expected.reference,
    runnerSha256:sha(__filename),sourceHashes:before,boundary:'Private one-worker research continuation; not a replacement for the user save or a release.'},null,2)+'\n',{flag:'wx'});
  let terminal=new Map(),genTicks=0,started=Date.now(),lastLog=Date.now(),guardExceeded=false;const rows=[];
  sim.onTrialTick=s=>{
    for(const c of s.cars)if(!c.alive&&!terminal.has(c.id)){
      const snap=F.capturePracticeState(c);check(Number.isInteger(snap.nextControlPhase)&&snap.controlInterval===L.CONTROL_INTERVAL,'Missing actual phase');
      terminal.set(c.id,{id:c.id,tick:s.ticks,reason:c.reason,lifetime:c.lifetime,x:c.x,y:c.y,heading:c.heading,
        progressM:c.bestProgress/(c.pixelsPerMeter||1),laps:c.laps,outputs:c.outputs.slice(),fitness:c.fitness,safe:F.isSafeLearningOutcome(c)});
    }
    if(Date.now()-lastLog>=20000){lastLog=Date.now();console.log('V3_CONTINUE_GPU_PROGRESS '+JSON.stringify({generation:s.generation,
      alive:s.cars.filter(c=>c.alive).length,bestRawM:Math.max(...s.cars.map(c=>c.bestProgress))/(s.track.pixelsPerMeter||1),gpuCalls:Cuda.stats().gpuCalls}));}
  };
  const oldStep=Dense.step;
  try{
    Dense.step=(...args)=>Cuda.pass(...args);
    while(rows.length<12){
      if(genTicks>=60000){guardExceeded=true;break;}
      const generation=sim.generation;sim.tick();genTicks++;
      if(sim.generation!==generation){
        check(terminal.size===40,'Incomplete real terminal census');const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(a=>a.safe);
        if(rows.length<2){const ref=initialReference[rows.length];check(ref.generation===generation&&ref.ticks===genTicks,'Reference shape mismatch');
          for(const observed of outcomes)check(samePhysical(observed,ref.outcomes[observed.id]),'Physical reference differs for car '+observed.id);}
        const practice=structuredClone(sim.practiceResults||[]),row={generation,ticks:genTicks,safeCount:safe.length,
          collisionCount:outcomes.filter(a=>a.reason==='urto').length,bestSafeProgressM:safe.length?Math.max(...safe.map(a=>a.progressM)):null,
          maxSafeLaps:safe.length?Math.max(...safe.map(a=>a.laps)):0,meanSafeProgressM:safe.length?safe.reduce((s,a)=>s+a.progressM,0)/safe.length:null,
          safeAtLeast500M:safe.filter(a=>a.progressM>=500).length,practiceEvaluations:sim.practiceEvaluations,
          unsafePromotions:practice.filter(x=>x.improved&&!x.best.safe).length,optimizerUpdates:sim.optimizer?.updates??null,outcomes};
        check(row.unsafePromotions===0,'Unsafe practice improvement promoted');rows.push(row);
        const savedCheckpoint={format:'private-v3-progress7-continuation-checkpoint-v1',inputCheckpointSha256:expected.checkpoint,inputSaveSha256:expected.saved,
          originalSaveSha256:expected.original,referenceSha256:expected.reference,sourceHashes:before,runnerSha256:sha(__filename),
          completedGenerations:rows.length,lastGeneration:generation,nextGeneration:sim.generation,workerIndex:0,state:P.capture(sim),rows:rows.map(({outcomes,...small})=>small)};
        P.validateTraining(savedCheckpoint.state,sim.graph,sim.circuits);
        const cpFile=path.join(out,'checkpoint-'+(rows.length%2)+'.private.json');fs.writeFileSync(cpFile,JSON.stringify(savedCheckpoint)+'\n');
        const short={generation,ticks:row.ticks,safe:row.safeCount,collisions:row.collisionCount,bestSafeProgressM:row.bestSafeProgressM,
          meanSafeProgressM:row.meanSafeProgressM,safeAtLeast500M:row.safeAtLeast500M,laps:row.maxSafeLaps,
          practiceEvaluations:row.practiceEvaluations,optimizerUpdates:row.optimizerUpdates,checkpointSha256:sha(cpFile),gpuCalls:Cuda.stats().gpuCalls,
          wallSeconds:(Date.now()-started)/1000};
        fs.appendFileSync(path.join(out,'progress.ndjson'),JSON.stringify(short)+'\n');console.log('V3_CONTINUE_GPU_GENERATION '+JSON.stringify(short));
        terminal=new Map();genTicks=0;if(row.maxSafeLaps>=2)break;
      }
    }
    sim.running=false;const gpu=Cuda.stats(),after=hashes();
    check(gpu.gpuCalls>0&&gpu.cpuFallbacks===0&&gpu.device?.name.includes('RTX 4060'),'CUDA was not verified');
    check(JSON.stringify(before)===JSON.stringify(after)&&sha(checkpoint)===expected.checkpoint&&sha(saved)===expected.saved&&sha(original)===expected.original,'Source or input changed');
    const completed=rows.some(r=>r.maxSafeLaps>=2),checkpointFiles=[0,1].map(i=>path.join(out,'checkpoint-'+i+'.private.json')).filter(fs.existsSync);
    const report={passed:!guardExceeded,learningSucceeded:completed,approvedForApp:false,appVersion:'5.6.0',model:'V3',circuit:'Monza',
      settings:{worker:0,seed:cp.state.seed,population:40,startGeneration:80,maxGenerations:12,diagnosticGuardTicks:60000,revision:cp.state.rewardRevision,
        neuralBackend:'private exact V3 CUDA kernel'},inputCheckpointSha256:expected.checkpoint,inputSaveSha256:expected.saved,originalSaveSha256:expected.original,
      referenceReportSha256:expected.reference,runnerSha256:sha(__filename),sourceHashes:{before,after},firstTwoGenerationsMatchReference:rows.length>=2,
      generationsCompleted:rows.length,diagnosticGuardExceeded:guardExceeded,gpu,rows,checkpoints:checkpointFiles.map(file=>({file,sha256:sha(file)})),
      boundary:'Natural real from-line runs for one worker and one seed. The watchdog stops only this diagnostic without changing app termination. Checkpoints are private one-worker research data, not replacements for the user save. A two-lap result needs independent replay, robustness, native app and package verification.'};
    const result=path.join(out,'report.json');fs.writeFileSync(result,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log('V3_CONTINUE_GPU_REPORT '+JSON.stringify({report:result,sha256:sha(result),generations:rows.length,guardExceeded,learningSucceeded:completed,
      bestSafeProgressM:Math.max(...rows.map(r=>r.bestSafeProgressM??0)),maxSafeLaps:Math.max(...rows.map(r=>r.maxSafeLaps)),gpu}));
  }finally{Dense.step=oldStep;Cuda.close();}
}
main().catch(error=>{console.error('V3_CONTINUE_GPU_FAILED '+(error.stack||error));process.exitCode=1;});
