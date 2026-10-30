'use strict';
// Two ordinary generations from worker 0 of each real file, no action override.
// The experimental copy changes scoring and clears old records; it is not a
// controlled comparison of just the slow-stop rule after the first generation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const out=path.join(base,'saved-v3-moving-pace-copy-two-generations-20261027-86');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const migrated=path.join(base,'saved-v3-moving-pace-copy-20261027-85/SPERIMENTALE-solo-dev-v3-monza-progress7-copia.malecns-save');
const prior=path.join(base,'saved-v3-moving-slow-recovery-2gen-ab-20261026-82/report.json');
const appCheck=path.join(base,'saved-v3-moving-pace-app-verification-20261026-83/report.json');
const P=require('../outputs/progress-save.js'),F=require('../outputs/simulation.js'),Legacy=require('../outputs/legacy-models.js');
const circuits=require('../outputs/data/circuits.json'),data=require('../outputs/data/connectome.json');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const objectSha=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const check=(x,msg)=>{if(!x)throw Error(msg);},near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-8;
const originalSha='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
const migratedSha='9ec19c8ea77f45327a863c935a0ea8774db435166bc26447870fe4dc96893bd2';
const files=['outputs/rewards.js','outputs/simulation.js','outputs/neural-learning.js','outputs/progress-save.js',
  'outputs/dense-neural.js','outputs/vehicle-992.js','outputs/data/circuits.json','outputs/data/connectome.json'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,sha(path.join(root,f))]));
const observe=(car,tick)=>({id:car.id,tick,reason:car.reason,lifetime:car.lifetime,x:car.x,y:car.y,heading:car.heading,
  progressM:car.bestProgress/(car.pixelsPerMeter||1),laps:car.laps,outputs:car.outputs.slice(),fitness:car.fitness,
  safe:F.isSafeLearningOutcome(car),slowPenalty:car.rewardBreakdown.penalties.slowProgress});
function run(state,name){
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  P.restore(sim,structuredClone(state));sim.running=true;const start=sim.generation,rows=[];let terminal=new Map(),ticks=0,totalTicks=0;
  const optimizerBefore=objectSha(sim.optimizer.mean),started=Date.now();
  sim.onTrialTick=s=>{for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,observe(car,s.ticks));};
  while(sim.generation<start+2){
    check(ticks<20000,name+': diagnostic guard reached before natural generation completion');
    const generation=sim.generation;sim.tick();ticks++;totalTicks++;
    if(sim.generation!==generation){
      check(terminal.size===state.population,'Incomplete agent census');
      const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(c=>c.safe),h=sim.history.at(-1);
      rows.push({generation:h.generation,ticks,safeCount:safe.length,bestSafeProgressM:safe.length?Math.max(...safe.map(c=>c.progressM)):null,
        maxSafeLaps:safe.length?Math.max(...safe.map(c=>c.laps)):0,collisionCount:outcomes.filter(c=>c.reason==='urto').length,
        optimizerUpdates:sim.optimizer.updates,outcomes});
      console.log('MIGRATED_COPY_GENERATION '+JSON.stringify({arm:name,...Object.fromEntries(Object.entries(rows.at(-1)).filter(([k])=>k!=='outcomes'))}));
      terminal=new Map();ticks=0;
    }
  }
  sim.running=false;return {name,rows,totalTicks,wallSeconds:(Date.now()-started)/1000,
    optimizerMeanBeforeSha256:optimizerBefore,optimizerMeanAfterSha256:objectSha(sim.optimizer.mean)};
}
function comparePhysical(a,b,{fitness=false}={}){
  check(a.length===b.length,'Population mismatch');
  for(let i=0;i<a.length;i++){
    const x=a[i],y=b[i];check(x.id===y.id&&x.tick===y.tick&&x.reason===y.reason&&x.laps===y.laps&&x.safe===y.safe&&x.slowPenalty===y.slowPenalty,'Outcome mismatch for '+x.id);
    for(const k of ['lifetime','x','y','heading','progressM'])check(near(x[k],y[k]),'Different '+k+' for '+x.id);
    check(x.outputs.every((v,j)=>near(v,y.outputs[j])),'Command mismatch for '+x.id);
    if(fitness)check(near(x.fitness,y.fitness),'Historical score mismatch for '+x.id);
  }
}
async function main(){
  check(process.versions.node==='24.19.0'&&!fs.existsSync(out),'Pinned runtime and new output required');
  check(sha(original)===originalSha&&sha(migrated)===migratedSha,'Save identity mismatch');
  const a=(await P.decode(fs.readFileSync(original,'utf8'),'5.6.0')).payload.workers[0].state,
    b=(await P.decode(fs.readFileSync(migrated,'utf8'),'5.6.0')).payload.workers[0].state;
  check(a.generation===64&&b.generation===64&&a.population===40&&b.population===40&&
    a.rewardRevision==='progress-3'&&b.rewardRevision===F.Rewards.REVISION&&b.history.length===0&&
    JSON.stringify(a.genomes)===JSON.stringify(b.genomes),'Unexpected migrated worker');
  const before=hashes(),control=run(a,'original-progress3'),copy=run(b,'migrated-progress7');
  const reference=JSON.parse(fs.readFileSync(prior,'utf8')),physical=JSON.parse(fs.readFileSync(appCheck,'utf8'));
  for(let i=0;i<2;i++)comparePhysical(control.rows[i].outcomes,reference.control.rows[i].outcomes,{fitness:true});
  comparePhysical(copy.rows[0].outcomes,physical.updated.outcomes);
  check(sha(original)===originalSha&&sha(migrated)===migratedSha&&JSON.stringify(before)===JSON.stringify(hashes()),'File or source changed');
  const report={passed:true,learningSucceeded:copy.rows.some(r=>r.maxSafeLaps>=2),approvedForApp:false,
    originalSaveSha256:originalSha,migratedCopySha256:migratedSha,priorControlReportSha256:sha(prior),appPhysicalReportSha256:sha(appCheck),
    sourceHashes:before,runnerSha256:sha(__filename),controlMatchesPriorBothGenerations:true,migratedFirstGenerationMatchesPriorPhysical:true,
    control,copy,comparison:{bestSafeProgressDeltas:copy.rows.map((x,i)=>x.bestSafeProgressM-control.rows[i].bestSafeProgressM),
      safeCountDeltas:copy.rows.map((x,i)=>x.safeCount-control.rows[i].safeCount),
      collisionDeltas:copy.rows.map((x,i)=>x.collisionCount-control.rows[i].collisionCount)},
    boundary:'Two natural CPU generations, worker 0 only, one save and one seed. The copied session also clears old records and uses all progress-7 costs, so later changes cannot be attributed solely to the slow-stop fix. No forced driving, no user save modification, and no cross-model/circuit or convergence claim.'};
  fs.mkdirSync(out,{recursive:false});const target=path.join(out,'report.json');fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log('MIGRATED_COPY_REPORT '+JSON.stringify({report:target,sha256:sha(target),learningSucceeded:report.learningSucceeded,
    control:control.rows.map(({outcomes,...summary})=>summary),copy:copy.rows.map(({outcomes,...summary})=>summary),comparison:report.comparison}));
}
main().catch(error=>{console.error('MIGRATED_COPY_BENCHMARK_FAILED '+(error.stack||error));process.exitCode=1;});
