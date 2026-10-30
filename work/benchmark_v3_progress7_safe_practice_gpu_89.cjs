'use strict';
// Paired natural generations of the experimental saved V3 population.
// The treatment only refuses to promote a locally unsafe trial as an
// improvement. Candidate exploration and all driving remain neural.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const copy=path.join(base,'saved-v3-moving-pace-copy-20261027-85/SPERIMENTALE-solo-dev-v3-monza-progress7-copia.malecns-save');
const prior=path.join(base,'saved-v3-moving-pace-copy-two-generations-20261027-86/report.json');
const diagnostic=path.join(base,'saved-v3-terminal-practice-phase-selection-20261027-88/report.json');
const out=path.join(base,'saved-v3-progress7-safe-practice-ab-cuda-20261027-89');
const P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js'),Dense=require('../outputs/dense-neural.js'),Cuda=require('./cuda-exact-v3-runtime.cjs');
const circuits=require('../outputs/data/circuits.json'),data=require('../outputs/data/connectome.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const shaText=s=>crypto.createHash('sha256').update(s).digest('hex');
const expected={original:'29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3',
 copy:'9ec19c8ea77f45327a863c935a0ea8774db435166bc26447870fe4dc96893bd2',
 prior:'babf14a5091ebf2e5043777a4e66aa80517776c5ba86498d9a6559e4464cca7f',
 diagnostic:'9f1e8ba4a28233be28f31beb1d68715fdb84d005fc17f7485317b4ca53328ebe'};
const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/dense-neural.js'];
const hashes=()=>Object.fromEntries(sourceFiles.map(f=>[f,sha(path.join(root,f))]));
const check=(v,m)=>{if(!v)throw Error(m);},near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
function replaceOnce(s,a,b){check(s.split(a).length===2,'Expected exact source anchor: '+a);return s.replace(a,b);}
function engine(safePromotion){
  const file=path.join(root,'outputs/simulation.js');let source=fs.readFileSync(file,'utf8');
  source=replaceOnce(source,'return {fitness:car.fitness,progress:car.bestProgress,laps:car.laps,reason:car.reason,brakeMax,steeringMax};',
    'return {fitness:car.fitness,progress:car.bestProgress,laps:car.laps,reason:car.reason,brakeMax,steeringMax,safe:isSafeLearningOutcome(car)};');
  if(safePromotion)source=replaceOnce(source,
    'if(result.progress>baseline.progress+(this.track.pixelsPerMeter||1)&&result.fitness>best.fitness){best=result;bestWeights=candidate.policyWeights;}',
    'if(result.safe&&result.progress>baseline.progress+(this.track.pixelsPerMeter||1)&&result.fitness>best.fitness){best=result;bestWeights=candidate.policyWeights;}');
  const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(source,file);
  return {F:m.exports,sha:shaText(source)};
}
function run(name,F,state,n,reference){
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{population:state.population,modelId:'v3',circuitId:'monza',circuits,seed:state.seed});
  P.restore(sim,structuredClone(state));sim.running=true;
  const rows=[];let terminal=new Map(),generationTicks=0,started=Date.now(),lastLog=Date.now();
  sim.onTrialTick=s=>{
    for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,tick:s.ticks,reason:car.reason,lifetime:car.lifetime,
      x:car.x,y:car.y,heading:car.heading,progressM:car.bestProgress/(car.pixelsPerMeter||1),laps:car.laps,outputs:car.outputs.slice(),
      fitness:car.fitness,safe:F.isSafeLearningOutcome(car)});
    if(Date.now()-lastLog>=20000){lastLog=Date.now();console.log('SAFE_PRACTICE_GPU_PROGRESS '+JSON.stringify({arm:name,generation:s.generation,
      alive:s.cars.filter(c=>c.alive).length,bestM:Math.max(...s.cars.map(c=>c.bestProgress))/(s.track.pixelsPerMeter||1),gpuCalls:Cuda.stats().gpuCalls}));}
  };
  while(rows.length<n){
    check(generationTicks<20000,'Generation did not terminate within diagnostic guard');const generation=sim.generation;sim.tick();generationTicks++;
    if(sim.generation!==generation){
      check(terminal.size===state.population,'Incomplete generation census');
      const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(x=>x.safe),practice=structuredClone(sim.practiceResults||[]),history=sim.history.at(-1);
      const row={generation,ticks:generationTicks,safeCount:safe.length,bestSafeProgressM:safe.length?Math.max(...safe.map(x=>x.progressM)):null,
        maxSafeLaps:safe.length?Math.max(...safe.map(x=>x.laps)):0,collisionCount:outcomes.filter(x=>x.reason==='urto').length,
        stagnation:sim.stagnation,practiceEvaluations:sim.practiceEvaluations,practice,
        unsafeImprovementCount:practice.filter(x=>x.improved&&!x.best.safe).length,outcomes};
      if(reference&&rows.length<reference.length){const ref=reference[rows.length];check(ref.generation===generation&&ref.ticks===generationTicks&&ref.outcomes.length===outcomes.length,'Reference generation mismatch');
        for(const a of outcomes){const b=ref.outcomes[a.id];check(a.id===b.id&&a.tick===b.tick&&a.reason===b.reason&&a.safe===b.safe&&a.laps===b.laps&&
          ['lifetime','x','y','heading','progressM','fitness'].every(k=>near(a[k],b[k]))&&a.outputs.every((v,i)=>near(v,b.outputs[i])),
          'CUDA replay differs from CPU reference for generation '+generation+' car '+a.id);}}
      rows.push(row);console.log('SAFE_PRACTICE_GPU_GENERATION '+JSON.stringify({arm:name,generation,ticks:generationTicks,safe:row.safeCount,
        bestSafeProgressM:row.bestSafeProgressM,laps:row.maxSafeLaps,collisions:row.collisionCount,practiceEvaluations:row.practiceEvaluations,
        practiceImproved:practice.filter(x=>x.improved).length,unsafePromoted:row.unsafeImprovementCount,stagnation:row.stagnation,wallSeconds:(Date.now()-started)/1000}));
      terminal=new Map();generationTicks=0;
    }
  }
  sim.running=false;return {name,rows,wallSeconds:(Date.now()-started)/1000};
}
async function main(){
  check(!fs.existsSync(out)&&process.versions.node==='24.19.0','New output directory and pinned Node required');
  for(const [file,key] of [[original,'original'],[copy,'copy'],[prior,'prior'],[diagnostic,'diagnostic']])check(sha(file)===expected[key],key+' hash mismatch');
  const before=hashes(),priorReport=JSON.parse(fs.readFileSync(prior,'utf8')),audit=JSON.parse(fs.readFileSync(diagnostic,'utf8'));
  check(priorReport.passed&&audit.passed&&audit.results.filter(x=>x.selectedOld.reason==='urto').length===2,'Expected verified diagnostic');
  for(const [f,h] of Object.entries(audit.sourceHashes.before))check(before[f]===h,'Source changed since diagnostic: '+f);
  const decoded=await P.decode(fs.readFileSync(copy,'utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  check(state.generation===64&&state.population===40&&state.rewardRevision==='progress-7-moving-pace','Unexpected saved state');
  const controlEngine=engine(false),treatmentEngine=engine(true),oldStep=Dense.step;
  try{
    Dense.step=(...args)=>Cuda.pass(...args);
    const control=run('control',controlEngine.F,state,6,priorReport.copy.rows),afterControl=Cuda.stats();
    const treatment=run('safe-local-promotion',treatmentEngine.F,state,6,priorReport.copy.rows),gpu=Cuda.stats();
    const matchFirst=JSON.stringify(control.rows[0].outcomes)===JSON.stringify(treatment.rows[0].outcomes);
    check(matchFirst,'Paired first physical generation differs');
    check(gpu.gpuCalls>0&&gpu.cpuFallbacks===0&&gpu.device?.name.includes('RTX 4060'),'CUDA did not run correctly');
    check(treatment.rows.every(r=>r.unsafeImprovementCount===0),'Treatment promoted unsafe local trial');
    const after=hashes();check(JSON.stringify(before)===JSON.stringify(after)&&sha(original)===expected.original&&sha(copy)===expected.copy,'Sources or saves changed');
    const pairs=control.rows.map((c,i)=>({generation:c.generation,controlSafeProgressM:c.bestSafeProgressM,treatmentSafeProgressM:treatment.rows[i].bestSafeProgressM,
      safeProgressDeltaM:treatment.rows[i].bestSafeProgressM-c.bestSafeProgressM,controlLaps:c.maxSafeLaps,treatmentLaps:treatment.rows[i].maxSafeLaps,
      controlCollisions:c.collisionCount,treatmentCollisions:treatment.rows[i].collisionCount}));
    const report={passed:true,learningSucceeded:treatment.rows.some(r=>r.maxSafeLaps>=2),approvedForApp:false,appVersion:'5.6.0',model:'V3',circuit:'Monza',
      originalSaveSha256:expected.original,migratedCopySha256:expected.copy,referenceReportSha256:expected.prior,diagnosticSha256:expected.diagnostic,
      runnerSha256:sha(__filename),sourceHashes:{before,after},memoryEngineHashes:{control:controlEngine.sha,treatment:treatmentEngine.sha},
      settings:{worker:0,seed:state.seed,population:40,startGeneration:64,generationsPerArm:6,revision:state.rewardRevision,
        neuralBackend:'private exact V3 CUDA kernel',treatment:'only locally safe results may be promoted as local improvements'},
      referenceFirstTwoGenerationsMatch:true,firstPairedGenerationMatches:matchFirst,control,treatment,pairs,
      gpu:{...gpu,controlGpuCalls:afterControl.gpuCalls,treatmentGpuCalls:gpu.gpuCalls-afterControl.gpuCalls},
      boundary:'One saved worker, one seed, six natural generations per arm. An unselected mutated child remains eligible for ordinary exploration; the gate only prevents treating an unsafe local trial as an improvement. No forced route or actions, original or copied save, source, version, release or distributed build is modified. This experiment alone is not a claim of general learning.'};
    fs.mkdirSync(out,{recursive:false});const file=path.join(out,'report.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log('SAFE_PRACTICE_GPU_REPORT '+JSON.stringify({report:file,sha256:sha(file),pairs,gpu:report.gpu,learningSucceeded:report.learningSucceeded}));
  }finally{Dense.step=oldStep;Cuda.close();}
}
main().catch(error=>{console.error('SAFE_PRACTICE_GPU_FAILED '+(error.stack||error));process.exitCode=1;});
