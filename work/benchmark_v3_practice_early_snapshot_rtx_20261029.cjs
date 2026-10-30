'use strict';
// Four real V3 generations from a verified private checkpoint. In-memory-only
// instrumentation records local practice candidates; no route/action teacher.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const checkpoint=path.join(base,'progress7-natural-continue-cuda-practice-longitudinal-20261029-4/checkpoint-1.private.json');
const reference=path.join(base,'progress7-natural-continue-cuda-practice-longitudinal-20261029-4/report.json');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(base,'progress8-practice-early-snapshot-rtx-20261029');
const P=require('../outputs/progress-save.js'),L=require('../outputs/neural-learning.js'),Legacy=require('../outputs/legacy-models.js');
const Dense=require('../outputs/dense-neural.js'),Cuda=require('./cuda-exact-v3-runtime.cjs');
const circuits=require('../outputs/data/circuits.json'),data=require('../outputs/data/connectome.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const check=(v,m)=>{if(!v)throw Error(m);};
const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/dense-neural.js','work/cuda-exact-v3-pass.cjs'];
const sourceHashes=()=>Object.fromEntries(sourceFiles.map(f=>[f,sha(path.join(root,f))]));
const summarize=r=>({progress:r.progress,fitness:r.fitness,laps:r.laps,reason:r.reason,safe:r.safe,brakeMax:r.brakeMax,steeringMax:r.steeringMax});
async function main(){
  check(process.versions.node==='24.19.0'&&!fs.existsSync(out),'Pinned Node and a new output folder are required');
  const cpSha=sha(checkpoint),originalSha='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
  check(sha(original)===originalSha,'Personal save identity differs');
  const cp=JSON.parse(fs.readFileSync(checkpoint,'utf8')),ref=JSON.parse(fs.readFileSync(reference,'utf8'));
  check(ref.passed===true&&cp.state.generation===83&&cp.state.population===40&&cp.state.rewardRevision==='progress-7-moving-pace','Unexpected checkpoint or reference');
  const before=sourceHashes();
  for(const [file,digest] of Object.entries(ref.sourceHashes.before))if(file!=='outputs/progress-save.js')check(before[file]===digest,'Simulation source differs from reference: '+file);
  check(before['outputs/progress-save.js']!==ref.sourceHashes.before['outputs/progress-save.js'],'Expected save-compatibility change is missing');
  let source=fs.readFileSync(path.join(root,'outputs/simulation.js'),'utf8');
  const oldGate='car.speed/(car.pixelsPerMeter||1)>2&&(!car.practiceState';
  check(source.split(oldGate).length===2,'Live practice speed gate missing or ambiguous');
  source=source.replace(oldGate,'car.speed/(car.pixelsPerMeter||1)>8&&(!car.practiceState');
  const helper='function shouldPromotePracticeCandidate(result,baseline,best,pixelsPerMeter,rewardRevision){';
  check(source.split(helper).length===2,'Practice helper injection point missing or ambiguous');
  source=source.replace(helper,'function practiceResultSummary(r){return {progress:r.progress,fitness:r.fitness,laps:r.laps,reason:r.reason,safe:r.safe,brakeMax:r.brakeMax,steeringMax:r.steeringMax};}\n  '+helper);
  const edits=[
    ['let best=baseline,bestWeights=null;','let best=baseline,bestWeights=null,practiceTrials=[];'],
    ['if(shouldPromotePracticeCandidate(result,baseline,best,this.track.pixelsPerMeter||1,this.rewardRevision)){best=result;bestWeights=candidate.policyWeights;}','const promoted=shouldPromotePracticeCandidate(result,baseline,best,this.track.pixelsPerMeter||1,this.rewardRevision);practiceTrials.push({factor,...practiceResultSummary(result),promoted});if(promoted){best=result;bestWeights=candidate.policyWeights;}'],
    ['this.practiceResults.push({parentId:parent.id,baseline,best,improved:Boolean(bestWeights)});','this.practiceResults.push({parentId:parent.id,practiceStart:{speedMps:parent.practiceState.speed/(this.track.pixelsPerMeter||1),progressM:parent.practiceState.bestProgress/(this.track.pixelsPerMeter||1)},baseline:practiceResultSummary(baseline),best:practiceResultSummary(best),improved:Boolean(bestWeights),trials:practiceTrials});']
  ];
  for(const [from,to] of edits){check(source.split(from).length===2,'In-memory trace patch target missing or ambiguous');source=source.replace(from,to);}
  const simulatedModule={exports:{}};
  const mappedRequire=id=>id.startsWith('.')?require(path.resolve(root,'outputs',id)):require(id);
  new Function('module','exports','require',source)(simulatedModule,simulatedModule.exports,mappedRequire);
  const F=simulatedModule.exports;
  check(typeof F.Simulation==='function'&&typeof F.capturePracticeState==='function','Instrumented simulation load failed');
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{population:40,modelId:'v3',circuitId:'monza',circuits,seed:cp.state.seed});
  P.restore(sim,structuredClone(cp.state));
  check(hash(P.capture(sim))===hash(cp.state),'Checkpoint restore does not match');
  P.validateTraining(P.capture(sim),sim.graph,sim.circuits);
  sim.running=true;fs.mkdirSync(out,{recursive:false});
  fs.writeFileSync(path.join(out,'metadata.json'),JSON.stringify({format:'private-v3-natural-practice-trace-v1',model:'V3',circuit:'Monza',
    workerIndex:cp.workerIndex,seed:cp.state.seed,population:cp.state.population,startGeneration:cp.state.generation,maxGenerations:4,
    checkpointSha256:cpSha,referenceSha256:sha(reference),originalSaveSha256:originalSha,sourceHashes:before,
    instrumentation:'In-memory-only experiment: retain observed practice snapshots only above 8 m/s instead of the current 2 m/s gate, plus record per-candidate outcomes; app files unchanged.',
    resumeCompatibility:'Current progress-save.js differs from the reference run: it restores the checkpoint reward revision, derives a safe-only frontier, and restores without stale ES sample IDs. The serialized state round-trips exactly, but resulting trajectories are not a byte-for-byte continuation of the reference runner.',
    boundary:'Private research continuation from one worker and one seed. Not a replacement save or release.'},null,2)+'\n',{flag:'wx'});
  let terminal=new Map(),genTicks=0,started=Date.now(),lastLog=Date.now();const rows=[];
  sim.onTrialTick=s=>{
    for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,tick:s.ticks,reason:car.reason,
      progressM:car.bestProgress/(car.pixelsPerMeter||1),laps:car.laps,fitness:car.fitness,safe:F.isSafeLearningOutcome(car),outputs:car.outputs.slice()});
    if(Date.now()-lastLog>=20000){lastLog=Date.now();console.log('V3_PRACTICE_TRACE_PROGRESS '+JSON.stringify({generation:s.generation,
      alive:s.cars.filter(c=>c.alive).length,bestM:Math.max(...s.cars.map(c=>c.bestProgress))/(s.track.pixelsPerMeter||1),gpuCalls:Cuda.stats().gpuCalls}));}
  };
  const oldStep=Dense.step;
  try{
    Dense.step=(...args)=>Cuda.pass(...args);
    while(rows.length<4){
      const generation=sim.generation;sim.tick();genTicks++;
      if(sim.generation!==generation){
        check(terminal.size===40,'Terminal population census incomplete');
        const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(x=>x.safe),practiceResults=structuredClone(sim.practiceResults||[]);
        const practiceSummary={evaluations:sim.practiceEvaluations,parents:practiceResults.length,improved:practiceResults.filter(x=>x.improved).length,
          safeImprovements:practiceResults.filter(x=>x.improved&&x.best.safe).length,unsafeImprovements:practiceResults.filter(x=>x.improved&&!x.best.safe).length,
          trials:practiceResults.flatMap(x=>x.trials||[]).length,trialPromotions:practiceResults.flatMap(x=>x.trials||[]).filter(x=>x.promoted).length};
        const row={generation,ticks:genTicks,safeCount:safe.length,collisionCount:outcomes.filter(x=>x.reason==='urto').length,
          bestSafeProgressM:safe.length?Math.max(...safe.map(x=>x.progressM)):null,maxSafeLaps:safe.length?Math.max(...safe.map(x=>x.laps)):0,
          safeAtLeast500M:safe.filter(x=>x.progressM>=500).length,practiceSummary,practiceResults,optimizerUpdates:sim.optimizer?.updates??null,outcomes};
        check(practiceSummary.unsafeImprovements===0,'Unsafe practice candidate promoted');rows.push(row);
        const saved={format:'private-v3-practice-trace-checkpoint-v1',checkpointSha256:cpSha,referenceSha256:sha(reference),sourceHashes:before,
          runnerSha256:sha(__filename),completedGenerations:rows.length,lastGeneration:generation,nextGeneration:sim.generation,workerIndex:cp.workerIndex,
          state:P.capture(sim),rows:rows.map(({outcomes,practiceResults,...small})=>small)};
        P.validateTraining(saved.state,sim.graph,sim.circuits);
        const cpFile=path.join(out,'checkpoint-'+(rows.length%2)+'.private.json');fs.writeFileSync(cpFile,JSON.stringify(saved)+'\n');
        const short={generation,ticks:genTicks,safe:safe.length,collisions:row.collisionCount,bestSafeProgressM:row.bestSafeProgressM,
          maxSafeLaps:row.maxSafeLaps,practice:practiceSummary,optimizerUpdates:row.optimizerUpdates,gpuCalls:Cuda.stats().gpuCalls,
          checkpointSha256:sha(cpFile),wallSeconds:(Date.now()-started)/1000};
        fs.appendFileSync(path.join(out,'progress.ndjson'),JSON.stringify(short)+'\n');console.log('V3_PRACTICE_TRACE_GENERATION '+JSON.stringify(short));
        terminal=new Map();genTicks=0;
      }
      if(genTicks>=60000)throw Error('Diagnostic tick guard exceeded; last completed checkpoints remain available');
    }
    sim.running=false;const gpu=Cuda.stats(),after=sourceHashes();
    check(gpu.gpuCalls>0&&gpu.cpuFallbacks===0&&gpu.device?.name.includes('RTX 4060'),'CUDA RTX 4060 was not confirmed');
    check(JSON.stringify(before)===JSON.stringify(after)&&sha(checkpoint)===cpSha&&sha(original)===originalSha,'Source, checkpoint or user save changed');
    const report={passed:true,learningSucceeded:rows.some(x=>x.maxSafeLaps>=2),approvedForApp:false,model:'V3',circuit:'Monza',
      settings:{seed:cp.state.seed,population:cp.state.population,startGeneration:cp.state.generation,generationsCompleted:rows.length,
        revision:cp.state.rewardRevision,practiceSnapshotSpeedThresholdMps:8,neuralBackend:'private exact V3 CUDA kernel'},checkpointSha256:cpSha,referenceSha256:sha(reference),
      originalSaveSha256:originalSha,sourceHashes:{before,after},gpu,rows,
      boundary:'Four natural training updates from the exact saved research checkpoint. Per-candidate practice telemetry is instrumented in memory only. This single-seed run does not establish generalization or release readiness.'};
    const reportFile=path.join(out,'report.json');fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log('V3_PRACTICE_TRACE_REPORT '+JSON.stringify({report:reportFile,sha256:sha(reportFile),generations:rows.length,
      learningSucceeded:report.learningSucceeded,finalSafeProgressM:rows.at(-1).bestSafeProgressM,finalLaps:rows.at(-1).maxSafeLaps,
      practice:rows.map(x=>({g:x.generation,...x.practiceSummary})),gpu}));
  }finally{Dense.step=oldStep;Cuda.close();}
}
main().catch(error=>{console.error('V3_PRACTICE_TRACE_FAILED '+(error.stack||error));process.exitCode=1;});
