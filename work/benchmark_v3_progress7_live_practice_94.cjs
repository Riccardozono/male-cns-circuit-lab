'use strict';
// Same actual stagnant checkpoint in both arms. The treatment preserves the
// first existing, physically visited live-practice snapshot instead of
// replacing it with the safe terminal snapshot; no route or actions injected.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const anchor=path.join(base,'progress7-moving-practice-anchor-20261027-94/anchor.private.json');
const prior=path.join(base,'progress7-natural-training-cuda-20261027-92/report.json');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const copy=path.join(base,'saved-v3-moving-pace-copy-20261027-85/SPERIMENTALE-solo-dev-v3-monza-progress7-copia.malecns-save');
const out=path.join(base,'progress7-live-practice-checkpoint-ab-cuda-20261027-94');
const P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js'),Dense=require('../outputs/dense-neural.js'),Cuda=require('./cuda-exact-v3-runtime.cjs');
const data=require('../outputs/data/connectome.json'),circuits=require('../outputs/data/circuits.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),shaText=s=>crypto.createHash('sha256').update(s).digest('hex');
const check=(v,m)=>{if(!v)throw Error(m);},near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
const expected={anchor:'eb675f057316ac9d30b65f6dbf6bb4537e154efef6f2498a8dcae3c0b8012cca',
 original:'29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3',copy:'9ec19c8ea77f45327a863c935a0ea8774db435166bc26447870fe4dc96893bd2'};
const sources=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/dense-neural.js','work/cuda-exact-v3-pass.cjs'];
const hashes=()=>Object.fromEntries(sources.map(f=>[f,sha(path.join(root,f))]));
function replaceOnce(s,a,b){check(s.split(a).length===2,'Missing exact source anchor: '+a);return s.replace(a,b);}
function engine(retainMoving){
  const file=path.join(root,'outputs/simulation.js');let source=fs.readFileSync(file,'utf8');
  if(retainMoving)source=replaceOnce(source,'for(const parent of learningRanked.slice(0,practiceEliteBudget))parent.practiceState=capturePracticeState(parent);',
    'for(const parent of learningRanked.slice(0,practiceEliteBudget))if(!parent.practiceState)parent.practiceState=capturePracticeState(parent);');
  source=replaceOnce(source,'this.practiceResults.push({parentId:parent.id,baseline,best,improved:Boolean(bestWeights)});',
    'this.practiceResults.push({parentId:parent.id,baseline,best,improved:Boolean(bestWeights),context:{speedMps:parent.practiceState.vehicle.speedMps,along:parent.practiceState.along,phase:parent.practiceState.nextControlPhase??null},terminal:{speedMps:parent.vehicle.speedMps,along:parent.rewardState.along}});');
  const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(source,file);
  return {F:m.exports,sourceSha256:shaText(source)};
}
function samePhysical(a,b){return a.id===b.id&&a.tick===b.tick&&a.reason===b.reason&&a.safe===b.safe&&a.laps===b.laps&&
  ['lifetime','x','y','heading','progressM','fitness'].every(k=>near(a[k],b[k]))&&a.outputs.every((v,i)=>near(v,b.outputs[i]));}
function run(label,F,state,reference){
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  P.restore(sim,structuredClone(state));sim.running=true;const rows=[];let terminal=new Map(),genTicks=0,start=Date.now(),last=Date.now();
  sim.onTrialTick=s=>{
    for(const c of s.cars)if(!c.alive&&!terminal.has(c.id))terminal.set(c.id,{id:c.id,tick:s.ticks,reason:c.reason,lifetime:c.lifetime,
      x:c.x,y:c.y,heading:c.heading,progressM:c.bestProgress/(c.pixelsPerMeter||1),laps:c.laps,outputs:c.outputs.slice(),fitness:c.fitness,safe:F.isSafeLearningOutcome(c)});
    if(Date.now()-last>=20000){last=Date.now();console.log('LIVE_PRACTICE_GPU_PROGRESS '+JSON.stringify({arm:label,generation:s.generation,
      alive:s.cars.filter(c=>c.alive).length,bestRawM:Math.max(...s.cars.map(c=>c.bestProgress))/(s.track.pixelsPerMeter||1),gpuCalls:Cuda.stats().gpuCalls}));}
  };
  while(rows.length<4){
    check(genTicks<60000,'Diagnostic watchdog: generation did not finish naturally');const generation=sim.generation;sim.tick();genTicks++;
    if(sim.generation!==generation){
      check(terminal.size===state.population,'Incomplete terminal census');const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(a=>a.safe);
      if(reference&&rows.length<reference.length){const saved=reference[rows.length];check(saved.generation===generation&&saved.ticks===genTicks,'Reference shape mismatch');
        for(const a of outcomes)check(samePhysical(a,saved.outcomes[a.id]),'Control differs from natural GPU run: generation '+generation+' car '+a.id);}
      const practice=structuredClone(sim.practiceResults||[]),row={generation,ticks:genTicks,safeCount:safe.length,
        bestSafeProgressM:safe.length?Math.max(...safe.map(a=>a.progressM)):null,maxSafeLaps:safe.length?Math.max(...safe.map(a=>a.laps)):0,
        meanSafeProgressM:safe.length?safe.reduce((s,a)=>s+a.progressM,0)/safe.length:null,collisionCount:outcomes.filter(a=>a.reason==='urto').length,
        practiceEvaluations:sim.practiceEvaluations,practice,movingPracticeCount:practice.filter(p=>Math.abs(p.context.speedMps)>1).length,outcomes};
      check(practice.every(p=>!p.improved||p.best.safe===true),'Unsafe local improvement');rows.push(row);
      console.log('LIVE_PRACTICE_GPU_GENERATION '+JSON.stringify({arm:label,generation,ticks:genTicks,safe:row.safeCount,bestSafeProgressM:row.bestSafeProgressM,
        maxSafeLaps:row.maxSafeLaps,collisions:row.collisionCount,practiceEvaluations:row.practiceEvaluations,movingPractice:row.movingPracticeCount,
        localImprovements:practice.filter(p=>p.improved).length,wallSeconds:(Date.now()-start)/1000}));terminal=new Map();genTicks=0;
    }
  }
  sim.running=false;return {label,rows,wallSeconds:(Date.now()-start)/1000};
}
async function main(){
  check(process.versions.node==='24.19.0'&&!fs.existsSync(out),'Pinned Node and fresh output required');
  for(const [file,key] of [[anchor,'anchor'],[original,'original'],[copy,'copy']])check(sha(file)===expected[key],key+' hash differs');
  const checkpoint=JSON.parse(fs.readFileSync(anchor,'utf8')),previous=JSON.parse(fs.readFileSync(prior,'utf8')),before=hashes();
  check(checkpoint.state.generation===78&&checkpoint.state.stagnation>=3&&checkpoint.state.population===40&&checkpoint.state.rewardRevision==='progress-7-moving-pace',
    'Expected verified stagnant checkpoint');
  check(previous.passed&&previous.firstSixGenerationsMatchCpu&&previous.originalSaveSha256===expected.original&&previous.experimentalSaveSha256===expected.copy,'Invalid natural run');
  for(const [f,h] of Object.entries(checkpoint.sourceHashes))check(before[f]===h,'Source changed since checkpoint: '+f);
  for(const [f,h] of Object.entries(previous.sourceHashes.before))check(before[f]===h&&previous.sourceHashes.after[f]===h,'Source changed since natural run: '+f);
  const reference=previous.rows.filter(row=>row.generation===78||row.generation===79);
  check(reference.length===2,'Reference does not include generations 78 and 79');
  const originalEngine=engine(false),movingEngine=engine(true),oldStep=Dense.step;
  try{
    Dense.step=(...args)=>Cuda.pass(...args);
    const control=run('terminal-snapshot',originalEngine.F,checkpoint.state,reference),afterControl=Cuda.stats();
    const treatment=run('retain-real-moving-snapshot',movingEngine.F,checkpoint.state,null),gpu=Cuda.stats();
    check(control.rows[0].outcomes.every((a,i)=>samePhysical(a,treatment.rows[0].outcomes[i])),'First paired physical generation differs');
    check(gpu.gpuCalls>0&&gpu.cpuFallbacks===0&&gpu.device?.name.includes('RTX 4060'),'CUDA evidence missing');
    const after=hashes();check(JSON.stringify(before)===JSON.stringify(after)&&sha(original)===expected.original&&sha(copy)===expected.copy&&sha(anchor)===expected.anchor,'Sources or saves changed');
    const pairs=control.rows.map((a,i)=>({generation:a.generation,controlSafeProgressM:a.bestSafeProgressM,treatmentSafeProgressM:treatment.rows[i].bestSafeProgressM,
      safeProgressDeltaM:treatment.rows[i].bestSafeProgressM-a.bestSafeProgressM,controlLaps:a.maxSafeLaps,treatmentLaps:treatment.rows[i].maxSafeLaps,
      controlCollisions:a.collisionCount,treatmentCollisions:treatment.rows[i].collisionCount}));
    const report={passed:true,learningSucceeded:treatment.rows.some(r=>r.maxSafeLaps>=2),approvedForApp:false,appVersion:'5.6.0',model:'V3',circuit:'Monza',
      anchorSha256:expected.anchor,originalSaveSha256:expected.original,experimentalSaveSha256:expected.copy,referenceReportSha256:sha(prior),runnerSha256:sha(__filename),
      sourceHashes:{before,after},memoryEngineHashes:{control:originalEngine.sourceSha256,treatment:movingEngine.sourceSha256},
      settings:{worker:0,startGeneration:78,population:40,seed:checkpoint.state.seed,generationsPerArm:4,revision:checkpoint.state.rewardRevision,
        intervention:'retain existing first visited live practice snapshot for an elite; fall back to terminal when absent'},
      firstPairedGenerationMatches:true,controlFirstTwoGenerationsMatchNaturalRun:true,control,treatment,pairs,
      gpu:{...gpu,controlGpuCalls:afterControl.gpuCalls,treatmentGpuCalls:gpu.gpuCalls-afterControl.gpuCalls},
      boundary:'One genuine stagnant checkpoint, one seed, four full natural generations per arm. A real moving snapshot is used only when the existing simulator captured one; this is not a hand-authored path or action. No application source, saved user file, version or distributed package is changed. Local gains and this limited sample do not establish two-lap learning or generalization.'};
    fs.mkdirSync(out,{recursive:false});const file=path.join(out,'report.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log('LIVE_PRACTICE_GPU_REPORT '+JSON.stringify({file,sha256:sha(file),pairs,
      movingPractice:control.rows.concat(treatment.rows).map(r=>({generation:r.generation,count:r.movingPracticeCount,improved:r.practice.filter(p=>p.improved).length})),
      learningSucceeded:report.learningSucceeded,gpu}));
  }finally{Dense.step=oldStep;Cuda.close();}
}
main().catch(error=>{console.error('LIVE_PRACTICE_GPU_FAILED '+(error.stack||error));process.exitCode=1;});
