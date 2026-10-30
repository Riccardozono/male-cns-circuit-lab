'use strict';
// Continue the user's experimental V3 worker by real neuroevolution. The
// CUDA kernel computes the actual MaleCNS graph; no route or action teacher.
// Two alternating private checkpoints preserve completed generations if this
// research run is interrupted. Neither user save is ever overwritten.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const copy=path.join(base,'saved-v3-moving-pace-copy-20261027-85/SPERIMENTALE-solo-dev-v3-monza-progress7-copia.malecns-save');
const reference=path.join(base,'saved-v3-progress7-practice-fixes-app-cpu-20261027-90/report.json');
const out=path.join(base,'progress7-natural-training-cuda-20261027-92');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),L=require('../outputs/neural-learning.js'),Legacy=require('../outputs/legacy-models.js');
const Dense=require('../outputs/dense-neural.js'),Cuda=require('./cuda-exact-v3-runtime.cjs');
const circuits=require('../outputs/data/circuits.json'),data=require('../outputs/data/connectome.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const check=(v,m)=>{if(!v)throw Error(m);},near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
const expected={original:'29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3',
 copy:'9ec19c8ea77f45327a863c935a0ea8774db435166bc26447870fe4dc96893bd2',
 reference:'8ce8abbb543f7b21bb5801d9e8ec688b7959c1a212d3bd8c948e8fe3c1e59df2'};
const paths=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/dense-neural.js','work/cuda-exact-v3-pass.cjs'];
const hashes=()=>Object.fromEntries(paths.map(f=>[f,sha(path.join(root,f))]));
function matches(a,b){return a.id===b.id&&a.tick===b.tick&&a.reason===b.reason&&a.safe===b.safe&&a.laps===b.laps&&
 ['lifetime','x','y','heading','progressM','fitness'].every(k=>near(a[k],b[k]))&&a.outputs.every((v,i)=>near(v,b.outputs[i]));}
async function main(){
  check(process.versions.node==='24.19.0'&&!fs.existsSync(out),'Pinned Node and a fresh output directory are required');
  for(const [p,k] of [[original,'original'],[copy,'copy'],[reference,'reference']])check(sha(p)===expected[k],k+' identity differs');
  const ref=JSON.parse(fs.readFileSync(reference,'utf8')),before=hashes();check(ref.passed&&ref.rows.length===6,'Six-generation reference required');
  for(const [f,h] of Object.entries(ref.sourceHashes.before))check(before[f]===h,'Source changed since reference: '+f);
  const decoded=await P.decode(fs.readFileSync(copy,'utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  check(state.generation===64&&state.population===40&&state.rewardRevision==='progress-7-moving-pace','Unexpected saved worker');
  fs.mkdirSync(out,{recursive:false});
  fs.writeFileSync(path.join(out,'metadata.json'),JSON.stringify({format:'private-v3-progress7-natural-training-v1',model:'V3',circuit:'Monza',
    worker:0,seed:state.seed,population:40,startGeneration:64,maxGenerations:16,referenceSha256:expected.reference,
    originalSaveSha256:expected.original,experimentalSaveSha256:expected.copy,runnerSha256:sha(__filename),sourceHashes:before,
    boundary:'Private local research. Checkpoints hold a single worker, not a shareable five-worker save. No version, release or user file is replaced.'},null,2)+'\n',{flag:'wx'});
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{population:state.population,modelId:'v3',circuitId:'monza',circuits,seed:state.seed});
  P.restore(sim,structuredClone(state));sim.running=true;
  let terminal=new Map(),genTicks=0,started=Date.now(),lastLog=Date.now(),guardExceeded=false;const rows=[];
  sim.onTrialTick=s=>{
    for(const car of s.cars)if(!car.alive&&!terminal.has(car.id)){
      const snap=F.capturePracticeState(car);
      check(Number.isInteger(snap.nextControlPhase)&&snap.controlInterval===L.CONTROL_INTERVAL,'Missing observed phase');
      terminal.set(car.id,{id:car.id,tick:s.ticks,reason:car.reason,lifetime:car.lifetime,x:car.x,y:car.y,heading:car.heading,
        progressM:car.bestProgress/(car.pixelsPerMeter||1),laps:car.laps,outputs:car.outputs.slice(),fitness:car.fitness,
        safe:F.isSafeLearningOutcome(car),nextControlPhase:snap.nextControlPhase});
    }
    if(Date.now()-lastLog>=20000){lastLog=Date.now();console.log('V3_NATURAL_GPU_PROGRESS '+JSON.stringify({generation:s.generation,
      alive:s.cars.filter(c=>c.alive).length,bestRawM:Math.max(...s.cars.map(c=>c.bestProgress))/(s.track.pixelsPerMeter||1),gpuCalls:Cuda.stats().gpuCalls}));}
  };
  const previousStep=Dense.step;
  try{
    Dense.step=(...args)=>Cuda.pass(...args);
    while(rows.length<16){
      if(genTicks>=60000){guardExceeded=true;break;}
      const generation=sim.generation;sim.tick();genTicks++;
      if(sim.generation!==generation){
        check(terminal.size===state.population,'Incomplete natural terminal census');
        const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(a=>a.safe),practice=structuredClone(sim.practiceResults||[]);
        if(rows.length<6){const saved=ref.rows[rows.length];check(saved.generation===generation&&saved.ticks===genTicks,'Reference generation mismatch');
          for(const observed of outcomes)check(matches(observed,saved.outcomes[observed.id]),'Reference car differs: generation '+generation+' car '+observed.id);}
        const row={generation,ticks:genTicks,safeCount:safe.length,collisionCount:outcomes.filter(a=>a.reason==='urto').length,
          bestSafeProgressM:safe.length?Math.max(...safe.map(a=>a.progressM)):null,maxSafeLaps:safe.length?Math.max(...safe.map(a=>a.laps)):0,
          meanSafeProgressM:safe.length?safe.reduce((s,a)=>s+a.progressM,0)/safe.length:null,
          safeAtLeast500M:safe.filter(a=>a.progressM>=500).length,practiceEvaluations:sim.practiceEvaluations,
          unsafePromotions:practice.filter(x=>x.improved&&!x.best.safe).length,optimizerUpdates:sim.optimizer?.updates??null,outcomes};
        check(row.unsafePromotions===0,'Unsafe local improvement was promoted');rows.push(row);
        const checkpoint={format:'private-v3-progress7-natural-checkpoint-v1',originalSaveSha256:expected.original,experimentalSaveSha256:expected.copy,
          referenceSha256:expected.reference,sourceHashes:before,runnerSha256:sha(__filename),completedGenerations:rows.length,lastGeneration:generation,
          nextGeneration:sim.generation,workerIndex:0,state:P.capture(sim),rows:rows.map(({outcomes,...small})=>small)};
        P.validateTraining(checkpoint.state,sim.graph,sim.circuits);
        const checkpointFile=path.join(out,'checkpoint-'+(rows.length%2)+'.private.json');
        // Alternating slots keep the last completed checkpoint if one write is interrupted.
        fs.writeFileSync(checkpointFile,JSON.stringify(checkpoint)+'\n');
        const short={generation,ticks:row.ticks,safe:row.safeCount,collisions:row.collisionCount,bestSafeProgressM:row.bestSafeProgressM,
          meanSafeProgressM:row.meanSafeProgressM,safeAtLeast500M:row.safeAtLeast500M,laps:row.maxSafeLaps,
          practiceEvaluations:row.practiceEvaluations,optimizerUpdates:row.optimizerUpdates,checkpointSha256:sha(checkpointFile),
          gpuCalls:Cuda.stats().gpuCalls,wallSeconds:(Date.now()-started)/1000};
        fs.appendFileSync(path.join(out,'progress.ndjson'),JSON.stringify(short)+'\n');console.log('V3_NATURAL_GPU_GENERATION '+JSON.stringify(short));
        terminal=new Map();genTicks=0;
        if(row.maxSafeLaps>=2)break;
      }
    }
    sim.running=false;const gpu=Cuda.stats(),after=hashes();
    check(gpu.gpuCalls>0&&gpu.cpuFallbacks===0&&gpu.device?.name.includes('RTX 4060'),'CUDA use not verified');
    check(JSON.stringify(before)===JSON.stringify(after)&&sha(original)===expected.original&&sha(copy)===expected.copy,'Source or user save changed');
    const complete=rows.some(r=>r.maxSafeLaps>=2),checkpoints=[0,1].map(i=>path.join(out,'checkpoint-'+i+'.private.json')).filter(fs.existsSync);
    const report={passed:!guardExceeded,learningSucceeded:complete,approvedForApp:false,model:'V3',circuit:'Monza',appVersion:'5.6.0',
      settings:{worker:0,seed:state.seed,population:40,startGeneration:64,maxGenerations:16,diagnosticGuardTicks:60000,revision:state.rewardRevision,
        neuralBackend:'private exact V3 CUDA kernel'},originalSaveSha256:expected.original,experimentalSaveSha256:expected.copy,
      referenceSha256:expected.reference,runnerSha256:sha(__filename),sourceHashes:{before,after},firstSixGenerationsMatchCpu:rows.length>=6,
      generationsCompleted:rows.length,diagnosticGuardExceeded:guardExceeded,gpu,rows,checkpoints:checkpoints.map(file=>({file,sha256:sha(file)})),
      boundary:'Natural from-line runs from one experimental saved worker, one seed and one circuit. The 60,000-tick guard only stops this diagnostic and does not alter app termination. Checkpoints are local, single-worker, and not replacements for the five-worker user save. A two-lap result requires separate repeat/robustness and native-app verification before release.'};
    const file=path.join(out,'report.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log('V3_NATURAL_GPU_REPORT '+JSON.stringify({report:file,sha256:sha(file),generations:rows.length,guardExceeded,learningSucceeded:complete,
      last:rows.at(-1)&&{generation:rows.at(-1).generation,bestSafeProgressM:rows.at(-1).bestSafeProgressM,maxSafeLaps:rows.at(-1).maxSafeLaps},gpu}));
  }finally{Dense.step=previousStep;Cuda.close();}
}
main().catch(error=>{console.error('V3_NATURAL_GPU_FAILED '+(error.stack||error));process.exitCode=1;});
