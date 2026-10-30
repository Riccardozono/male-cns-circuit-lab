'use strict';
// Physical verification of application scoring on an in-memory copy of one
// real saved generation. No saved session is migrated or written here.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const out=path.join(base,'saved-v3-moving-pace-app-verification-20261026-83');
const reference=path.join(base,'saved-v3-moving-slow-recovery-2gen-ab-20261026-82/report.json');
const originalRewards=path.join(base,'saved-v3-moving-slow-recovery-2gen-ab-20261026-82/rewards-before.js');
const save='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),L=require('../outputs/legacy-models.js');
const circuits=require('../outputs/data/circuits.json'),data=require('../outputs/data/connectome.json');
const files=['outputs/rewards.js','outputs/simulation.js','outputs/neural-learning.js','outputs/progress-save.js',
  'outputs/dense-neural.js','outputs/vehicle-992.js','outputs/data/circuits.json','outputs/data/connectome.json'];
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const hashes=()=>Object.fromEntries(files.map(f=>[f,sha(path.join(root,f))]));
const expectedSave='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
const check=(condition,message)=>{if(!condition)throw Error(message);};
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-8;
const observe=(car,tick)=>({id:car.id,tick,reason:car.reason,lifetime:car.lifetime,x:car.x,y:car.y,heading:car.heading,
  progressM:car.bestProgress/(car.pixelsPerMeter||1),laps:car.laps,speedMps:car.vehicle?.speedMps??0,
  outputs:car.outputs.slice(),fitness:car.fitness,safe:F.isSafeLearningOutcome(car),
  slowPenalty:car.rewardBreakdown.penalties.slowProgress});
function run(saved,revision){
  const sim=new F.Simulation(L.tagV3(structuredClone(data)),{modelId:'v3',population:saved.population,
    circuitId:'monza',circuits,seed:saved.seed});
  P.restore(sim,structuredClone(saved));
  // A temporary diagnostic override is intentionally not exported as a save:
  // the old history and records must not be misrepresented as new scoring.
  sim.rewardRevision=revision;for(const car of sim.cars)car.rewardRevision=revision;
  sim.running=true;const start=sim.generation,terminal=new Map();let ticks=0;
  sim.onTrialTick=s=>{for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,observe(car,s.ticks));};
  while(sim.generation===start){check(ticks<20000,'Diagnostic guard reached');sim.tick();ticks++;}
  check(terminal.size===saved.population,'Missing terminal car');
  const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(a=>a.safe);
  const summary={revision,ticks,safe:safe.length,bestSafeProgressM:Math.max(...safe.map(a=>a.progressM)),
    maxSafeLaps:Math.max(...safe.map(a=>a.laps)),collision:outcomes.filter(a=>a.reason==='urto').length};
  console.log('APP_MOVING_PACE_GENERATION '+JSON.stringify(summary));return {summary,outcomes};
}
async function main(){
  check(process.versions.node==='24.19.0'&&!fs.existsSync(out),'Expected runtime and an unused output directory');
  check(sha(save)===expectedSave,'Original save hash mismatch');
  const ref=JSON.parse(fs.readFileSync(reference,'utf8')),snapshot=require(originalRewards);
  check(ref.passed&&ref.save.sha256===expectedSave&&sha(originalRewards)===ref.sourceHashes.before['outputs/rewards.js'],'Prior A/B or original reward snapshot invalid');
  check(F.Rewards.REVISION==='progress-7-moving-pace'&&F.Rewards.MISSING_LAP_REVISION===snapshot.REVISION,'Wrong reward revisions');
  check(snapshot.SUPPORTED_REVISIONS.includes(F.Rewards.REVISION)===false,'Old scoring unexpectedly accepts the new revision');
  const sourceBefore=hashes(),decoded=await P.decode(fs.readFileSync(save,'utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  check(state.generation===64&&state.population===40&&state.rewardRevision===F.Rewards.LEGACY_REVISION,'Unexpected saved session');
  const historical=run(state,F.Rewards.LEGACY_REVISION),updated=run(state,F.Rewards.REVISION);
  const compare=(actual,expected,fitness)=>{
    for(let i=0;i<actual.length;i++){
      const a=actual[i],b=expected[i];
      check(a.id===b.id&&a.tick===b.tick&&a.reason===b.reason&&a.laps===b.laps&&a.safe===b.safe&&a.slowPenalty===b.slowPenalty,
        'Outcome mismatch for car '+a.id);
      for(const k of ['lifetime','x','y','heading','progressM','speedMps'])check(near(a[k],b[k]),'Physical mismatch '+k+' car '+a.id);
      check(a.outputs.every((v,j)=>near(v,b.outputs[j])),'Output mismatch car '+a.id);
      if(fitness)check(near(a.fitness,b.fitness),'Historical fitness mismatch car '+a.id);
    }
  };
  compare(historical.outcomes,ref.control.rows[0].outcomes,true);
  compare(updated.outcomes,ref.treatment.rows[0].outcomes,false);
  check(sha(save)===expectedSave&&JSON.stringify(hashes())===JSON.stringify(sourceBefore),'Save or source changed during run');
  const report={passed:true,learningSucceeded:false,appVersion:'5.6.0',originalSaveSha256:sha(save),saveUnchanged:true,
    priorAbSha256:sha(reference),originalRewardSnapshotSha256:sha(originalRewards),runnerSha256:sha(__filename),sourceHashes:sourceBefore,
    originalRevisionAcceptedByCurrentApp:true,newRevisionRejectedByOldRewardList:true,
    historical:{...historical,all40PhysicalAndFitnessMatchPriorControl:true},
    updated:{...updated,all40PhysicalOutcomesMatchPriorTreatment:true,fitnessNotComparedBecauseScoringRevisionAlsoIncludesBrakeLock:true},
    boundary:'One CPU replay per revision of generation 64, worker 0, V3/Monza. The revision was changed only in memory; no migrated save, future-generation result, lap-learning or package claim.'};
  fs.mkdirSync(out,{recursive:false});const output=path.join(out,'report.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log('APP_MOVING_PACE_REPORT '+JSON.stringify({report:output,sha256:sha(output),historical:historical.summary,updated:updated.summary}));
}
main().catch(error=>{console.error('APP_MOVING_PACE_FAILED '+(error.stack||error));process.exitCode=1;});
