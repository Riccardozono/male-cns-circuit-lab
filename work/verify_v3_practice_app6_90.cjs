'use strict';
// End-to-end CPU replay of the actual development source after the local
// practice consistency correction, without modifying either saved session.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const copy=path.join(base,'saved-v3-moving-pace-copy-20261027-85/SPERIMENTALE-solo-dev-v3-monza-progress7-copia.malecns-save');
const prior=path.join(base,'saved-v3-progress7-safe-practice-ab-cuda-20261027-89/report.json');
const out=path.join(base,'saved-v3-progress7-practice-fixes-app-cpu-20261027-90');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),L=require('../outputs/neural-learning.js'),Legacy=require('../outputs/legacy-models.js');
const circuits=require('../outputs/data/circuits.json'),data=require('../outputs/data/connectome.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const originalHash='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3',copyHash='9ec19c8ea77f45327a863c935a0ea8774db435166bc26447870fe4dc96893bd2';
const paths=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/dense-neural.js'];
const hashes=()=>Object.fromEntries(paths.map(f=>[f,sha(path.join(root,f))]));
const check=(v,m)=>{if(!v)throw Error(m);},near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
async function main(){
  check(!fs.existsSync(out)&&process.versions.node==='24.19.0','New output and pinned Node required');
  check(sha(original)===originalHash&&sha(copy)===copyHash&&typeof F.shouldPromotePracticeCandidate==='function','Save or corrected app source mismatch');
  const before=hashes(),reference=JSON.parse(fs.readFileSync(prior,'utf8'));
  check(reference.passed&&reference.referenceFirstTwoGenerationsMatch&&reference.originalSaveSha256===originalHash&&reference.migratedCopySha256===copyHash,'Unverified GPU reference');
  const decoded=await P.decode(fs.readFileSync(copy,'utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  check(state.generation===64&&state.population===40&&state.rewardRevision==='progress-7-moving-pace','Unexpected saved state');
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{population:state.population,modelId:'v3',circuitId:'monza',circuits,seed:state.seed});
  P.restore(sim,structuredClone(state));sim.running=true;const rows=[];let terminal=new Map(),genTicks=0,started=Date.now(),lastLog=Date.now();
  sim.onTrialTick=s=>{
    for(const car of s.cars)if(!car.alive&&!terminal.has(car.id)){
      const snapshot=F.capturePracticeState(car);
      check(Number.isInteger(snapshot.nextControlPhase)&&snapshot.nextControlPhase>=0&&snapshot.nextControlPhase<snapshot.controlInterval&&
        snapshot.controlInterval===L.CONTROL_INTERVAL&&Array.isArray(snapshot.heldOutputs)&&snapshot.heldOutputs.length===3,'Terminal phase missing');
      terminal.set(car.id,{id:car.id,tick:s.ticks,reason:car.reason,lifetime:car.lifetime,x:car.x,y:car.y,heading:car.heading,
        progressM:car.bestProgress/(car.pixelsPerMeter||1),laps:car.laps,outputs:car.outputs.slice(),fitness:car.fitness,safe:F.isSafeLearningOutcome(car),
        nextControlPhase:snapshot.nextControlPhase});
    }
    if(Date.now()-lastLog>=20000){lastLog=Date.now();console.log('PRACTICE_APP_CPU_PROGRESS '+JSON.stringify({generation:s.generation,
      alive:s.cars.filter(c=>c.alive).length,bestM:Math.max(...s.cars.map(c=>c.bestProgress))/(s.track.pixelsPerMeter||1)}));}
  };
  while(rows.length<6){
    check(genTicks<20000,'Diagnostic generation guard reached');const generation=sim.generation;sim.tick();genTicks++;
    if(sim.generation!==generation){
      check(terminal.size===40,'Missing terminal car');const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(x=>x.safe);
      if(rows.length<2){const ref=reference.control.rows[rows.length];check(ref.generation===generation&&ref.ticks===genTicks,'GPU reference shape differs');
        for(const a of outcomes){const b=ref.outcomes[a.id];check(a.id===b.id&&a.tick===b.tick&&a.reason===b.reason&&a.safe===b.safe&&a.laps===b.laps&&
          ['lifetime','x','y','heading','progressM','fitness'].every(k=>near(a[k],b[k]))&&a.outputs.every((v,i)=>near(v,b.outputs[i])),
          'Physical first-generation baseline differs for car '+a.id);}}
      const practice=structuredClone(sim.practiceResults||[]),unsafe=practice.filter(x=>x.improved&&!x.best.safe).length;
      check(unsafe===0,'Current app promoted an unsafe local improvement');
      const row={generation,ticks:genTicks,safeCount:safe.length,bestSafeProgressM:Math.max(...safe.map(x=>x.progressM)),
        maxSafeLaps:Math.max(...safe.map(x=>x.laps)),collisionCount:outcomes.filter(x=>x.reason==='urto').length,
        practiceEvaluations:sim.practiceEvaluations,practice,unsafePromotions:unsafe,outcomes};
      rows.push(row);console.log('PRACTICE_APP_CPU_GENERATION '+JSON.stringify({generation,ticks:genTicks,safe:row.safeCount,
        bestSafeProgressM:row.bestSafeProgressM,laps:row.maxSafeLaps,collisions:row.collisionCount,practiceEvaluations:row.practiceEvaluations,
        improved:practice.filter(x=>x.improved).length,unsafe,wallSeconds:(Date.now()-started)/1000}));terminal=new Map();genTicks=0;
    }
  }
  sim.running=false;const after=hashes();check(JSON.stringify(before)===JSON.stringify(after)&&sha(original)===originalHash&&sha(copy)===copyHash,'Source or save changed');
  const comparison=rows.map((r,i)=>({generation:r.generation,currentSafeProgressM:r.bestSafeProgressM,
    previousSafeProgressM:reference.control.rows[i].bestSafeProgressM,filteredOnlySafeProgressM:reference.treatment.rows[i].bestSafeProgressM,
    currentLaps:r.maxSafeLaps,previousLaps:reference.control.rows[i].maxSafeLaps,filteredOnlyLaps:reference.treatment.rows[i].maxSafeLaps}));
  const report={passed:true,learningSucceeded:rows.some(r=>r.maxSafeLaps>=2),approvedForApp:false,appVersion:'5.6.0',model:'V3',circuit:'Monza',
    originalSaveSha256:originalHash,migratedCopySha256:copyHash,referenceReportSha256:sha(prior),runnerSha256:sha(__filename),sourceHashes:{before,after},
    settings:{worker:0,seed:state.seed,population:40,generations:6,revision:state.rewardRevision,runtime:'Node CPU development source'},
    firstTwoGenerationsMatchGpuReference:true,terminalSnapshotsWithPhase:240,rows,comparison,
    boundary:'Actual development source, one saved worker, one seed and six natural full generations; no route teacher or forced controls. This tests the combined phase/safe-promotion corrections, but not other circuits/models, robustness or the Windows packaged release. The two saved files and app version are unchanged.'};
  fs.mkdirSync(out,{recursive:false});const file=path.join(out,'report.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log('PRACTICE_APP_CPU_REPORT '+JSON.stringify({report:file,sha256:sha(file),comparison,learningSucceeded:report.learningSucceeded}));
}
main().catch(error=>{console.error('PRACTICE_APP_CPU_FAILED '+(error.stack||error));process.exitCode=1;});
