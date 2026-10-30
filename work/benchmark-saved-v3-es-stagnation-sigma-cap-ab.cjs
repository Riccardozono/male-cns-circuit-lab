'use strict';
// Paired, CPU-only experiment: cap ES sigma during prolonged stagnation.
// The user save and all production sources are read-only throughout.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-es-stagnation-sigma-cap-ab-20261022-01');
const F=require(path.join(root,'outputs/simulation.js'));
const P=require(path.join(root,'outputs/progress-save.js'));
const Legacy=require(path.join(root,'outputs/legacy-models.js'));
const circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourcePaths=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js'];
const sourceHashes=()=>Object.fromEntries(sourcePaths.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));

function runArm(name,savedState,data,cap){
  const sim=new F.Simulation(Legacy.tagV3(JSON.parse(JSON.stringify(data))),{modelId:'v3',population:savedState.population,
    circuitId:'monza',circuits,seed:savedState.seed});
  P.restore(sim,structuredClone(savedState));
  const baseScales=sim.graph.learning.scales.slice();
  const sigmaBefore=sim.optimizer.sigma.slice();
  if(cap){
    sim.optimizer.sigma=sim.optimizer.sigma.map((s,j)=>Math.min(s,baseScales[j]*cap));
    sim.optimizer.explore=stagnation=>{
      if(stagnation<3)return;
      sim.optimizer.sigma=sim.optimizer.sigma.map((s,j)=>Math.min(baseScales[j]*cap,Math.max(s*1.2,baseScales[j]*.8)));
    };
  }
  sim.running=true;
  const rows=[],started=Date.now();
  for(let offset=0;offset<5;offset++){
    const generation=sim.generation,terminal=new Map();let ticks=0;
    sim.onTrialTick=s=>{
      if(s.cars.every(car=>!car.alive))for(const car of s.cars)if(!terminal.has(car.id))terminal.set(car.id,{
        id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,
        bestLapTime:Number.isFinite(car.bestLapTime)?car.bestLapTime:null,fitness:car.fitness,
        reason:car.reason||'',safe:F.isSafeLearningOutcome(car),outputs:Array.isArray(car.outputs)?car.outputs.slice():[]
      });
    };
    while(sim.generation===generation&&ticks<60000){sim.tick();ticks++;}
    if(sim.generation===generation||terminal.size!==savedState.population)throw Error(`${name}: generation ${generation} incomplete (${ticks} ticks, ${terminal.size}/${savedState.population} terminal)`);
    const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(x=>x.safe);
    const bestSafe=safe.slice().sort((a,b)=>b.laps-a.laps||b.progressM-a.progressM||b.fitness-a.fitness)[0]||null;
    const h=sim.history.at(-1),sigma=sim.optimizer.sigma;
    rows.push({generation:h.generation,ticks,safeAgentCount:safe.length,unsafeCount:outcomes.length-safe.length,
      crashCount:outcomes.filter(x=>x.reason==='urto').length,
      bestSafeProgressM:safe.length?Math.max(...safe.map(x=>x.progressM)):null,
      maxSafeLaps:safe.length?Math.max(...safe.map(x=>x.laps)):0,bestSafe,
      rawBestProgressM:Math.max(...outcomes.map(x=>x.progressM)),rawMaxLaps:Math.max(...outcomes.map(x=>x.laps)),
      fitnessLeader:h.best,stagnation:h.stagnation,mutationAmount:h.mutationAmount,immigrantCount:h.immigrantCount,
      optimizerUpdates:h.learning?.updates,optimizerMeanExploration:h.learning?.meanExploration,
      sigmaMin:Math.min(...sigma),sigmaMean:sigma.reduce((a,b)=>a+b,0)/sigma.length,sigmaMax:Math.max(...sigma),outcomes});
    console.log('SIGMA_CAP_GENERATION '+JSON.stringify({arm:name,generation:h.generation,bestSafeProgressM:rows.at(-1).bestSafeProgressM,
      maxSafeLaps:rows.at(-1).maxSafeLaps,rawBestProgressM:rows.at(-1).rawBestProgressM,
      safeAgentCount:safe.length,sigmaMean:rows.at(-1).sigmaMean,stagnation:h.stagnation}));
  }
  sim.running=false;
  return {name,startGeneration:savedState.generation,seed:savedState.seed,population:savedState.population,
    sigmaBefore:{min:Math.min(...sigmaBefore),mean:sigmaBefore.reduce((a,b)=>a+b,0)/sigmaBefore.length,max:Math.max(...sigmaBefore)},
    rows,wallSeconds:(Date.now()-started)/1000};
}

async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing sigma-cap report');
  const saveBytes=fs.readFileSync(savePath),saveSha=sha(saveBytes),decoded=await P.decode(saveBytes.toString('utf8'),'5.6.0');
  const payload=decoded.payload,savedState=payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||payload.modelId!=='v3'||payload.circuitId!=='monza'||savedState.generation!==64||
    savedState.seed!==7717||savedState.population!==40||savedState.rewardRevision!=='progress-3')throw Error('Unexpected source checkpoint');
  const data=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'));
  const descriptor=new F.Simulation(Legacy.tagV3(JSON.parse(JSON.stringify(data))),{modelId:'v3',population:40,circuitId:'monza',circuits});
  P.validatePayload(payload,{graph:descriptor.graph,circuits:descriptor.circuits});
  const before=sourceHashes();
  const control=runArm('current-sigma-exploration',savedState,data,null);
  const treatment=runArm('sigma-cap-1.5x-during-stagnation',savedState,data,1.5);
  const prior=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-all-workers-3gen-20261022-01/report.json'),'utf8'));
  const priorGen64=prior.workers[0].generations[0].outcomes.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}));
  const currentGen64=control.rows[0].outcomes.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}));
  const controlReplayMatches=JSON.stringify(priorGen64)===JSON.stringify(currentGen64);
  if(!controlReplayMatches)throw Error('Control generation 64 did not reproduce the prior verified worker-0 replay');
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,after=sourceHashes();
  const sourcesUnchanged=JSON.stringify(before)===JSON.stringify(after);
  const safeMaxLaps=Math.max(...control.rows.map(x=>x.maxSafeLaps),...treatment.rows.map(x=>x.maxSafeLaps));
  const report={format:'male-cns-saved-v3-es-stagnation-sigma-cap-ab-v1',appVersion:'5.6.0',
    passed:saveUnchanged&&sourcesUnchanged&&controlReplayMatches&&control.rows.length===5&&treatment.rows.length===5,
    learningSucceeded:safeMaxLaps>=2,save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',worker:0,
      generation:64,seed:savedState.seed,population:savedState.population,rewardRevision:savedState.rewardRevision},
    runtime:'Node 24.19.0 CPU-only',settings:{naturalGenerationsPerArm:5,historyPreserved:true,control:'current production sigma exploration',treatment:'cap ES sigma at 1.5x graph base scales, including stagnation explore'},
    method:'Matched in-memory copies of the exact saved worker-0 V3/Monza checkpoint. The treatment changes only the EvolutionStrategy sigma ceiling; policy, physics, reward, sensors, selection, parents, mutation families, seed, genomes, optimizer mean and saved reward revision are unchanged. The checkpoint is never written.',
    controlReplayMatchesPriorGeneration64:controlReplayMatches,control,treatment,
    comparison:{bestSafeProgressDeltaMeters:treatment.rows.map((r,i)=>r.bestSafeProgressM-control.rows[i].bestSafeProgressM),
      safeLapDelta:treatment.rows.map((r,i)=>r.maxSafeLaps-control.rows[i].maxSafeLaps),
      fitnessDelta:treatment.rows.map((r,i)=>r.fitnessLeader-control.rows[i].fitnessLeader),
      promoteTreatment:false},sourceHashes:{before,after,unchanged:sourcesUnchanged},
    boundary:'One saved worker, one seed, one circuit and five generations per arm; evidence cannot establish convergence or two laps. Integrate no change unless follow-up across more generations/seeds confirms a physical benefit.'};
  if(!report.passed)throw Error('Integrity, deterministic replay or save preservation check failed');
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('SIGMA_CAP_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged,sourcesUnchanged,
    controlReplayMatches,bestSafeProgressDeltaMeters:report.comparison.bestSafeProgressDeltaMeters,safeLapDelta:report.comparison.safeLapDelta,
    control:control.rows.map(x=>({generation:x.generation,bestSafeProgressM:x.bestSafeProgressM,maxSafeLaps:x.maxSafeLaps,sigmaMean:x.sigmaMean})),
    treatment:treatment.rows.map(x=>({generation:x.generation,bestSafeProgressM:x.bestSafeProgressM,maxSafeLaps:x.maxSafeLaps,sigmaMean:x.sigmaMean})),
    report:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
