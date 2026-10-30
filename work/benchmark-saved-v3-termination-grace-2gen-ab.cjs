'use strict';
// Paired natural-generation diagnostic for slower V3 termination on the exact
// saved Monza checkpoint. In-memory threshold variant only; no app/save writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-termination-grace-2gen-ab-20261022-02');
const P=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js'));
const circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourcePaths=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js'];
const sourceHashes=()=>Object.fromEntries(sourcePaths.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
const sample=car=>({id:car.id,alive:car.alive,reason:car.reason,lifetime:car.lifetime,x:car.x,y:car.y,
  bestProgress:car.bestProgress,laps:car.laps,speedMps:car.vehicle?.speedMps??0,outputs:car.outputs.slice(),
  lastProgressTime:car.lastProgressTime,paceTime:car.rewardState?.paceTime,paceProgress:car.rewardState?.paceProgress,
  fitness:car.fitness,safe:null});

function runArm(F,savedState,data,name,generations=2,maxTicksPerGeneration=20000){
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:savedState.population,circuitId:'monza',circuits,seed:savedState.seed});
  P.restore(sim,structuredClone(savedState));sim.running=true;
  const firstGeneration=sim.generation,rows=[];let tickCount=0,currentTick=0,terminal=new Map(),targetTrace=[];
  sim.onTrialTick=s=>{
    const target=s.cars.find(car=>car.id===3);if(target&&s.generation===firstGeneration)targetTrace.push({tick:s.ticks,...sample(target)});
    if(s.cars.every(car=>!car.alive))for(const car of s.cars)if(!terminal.has(car.id))terminal.set(car.id,{tick:s.ticks,...sample(car),safe:F.isSafeLearningOutcome(car)});
  };
  const started=Date.now();
  while(sim.generation<firstGeneration+generations){
    if(currentTick>=maxTicksPerGeneration)throw Error(`${name}: generation ${sim.generation} exceeded ${maxTicksPerGeneration} ticks`);
    const generation=sim.generation;sim.tick();currentTick++;tickCount++;
    if(sim.generation!==generation){
      if(terminal.size!==savedState.population)throw Error(`${name}: incomplete terminal census at generation ${generation}`);
      const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(x=>x.safe),history=sim.history.at(-1);
      rows.push({generation:history.generation,ticks:currentTick,safeAgentCount:safe.length,unsafeCount:outcomes.length-safe.length,
        bestSafeProgressM:safe.length?Math.max(...safe.map(x=>x.bestProgress)):null,maxSafeLaps:safe.length?Math.max(...safe.map(x=>x.laps)):0,
        rawBestProgressM:Math.max(...outcomes.map(x=>x.bestProgress)),rawMaxLaps:Math.max(...outcomes.map(x=>x.laps)),
        fitnessLeader:history.best,stagnation:history.stagnation,mutationAmount:history.mutationAmount,
        outcomes:outcomes.map(x=>({...x,progressM:x.bestProgress/(sim.track.pixelsPerMeter||1)}))});
      console.log('TERMINATION_GRACE_2GEN '+JSON.stringify({arm:name,generation:history.generation,bestSafeProgressM:rows.at(-1).bestSafeProgressM,
        maxSafeLaps:rows.at(-1).maxSafeLaps,safeAgentCount:safe.length,ticks:currentTick}));
      terminal=new Map();currentTick=0;
    }
  }
  sim.running=false;
  return {name,startGeneration:firstGeneration,seed:savedState.seed,population:savedState.population,rows,
    targetFirstGenerationTrace:targetTrace,wallSeconds:(Date.now()-started)/1000,totalTicks:tickCount};
}

async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing 2-generation diagnostic');
  const saveBytes=fs.readFileSync(savePath),saveSha=sha(saveBytes),decoded=await P.decode(saveBytes.toString('utf8'),'5.6.0'),payload=decoded.payload,savedState=payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||payload.modelId!=='v3'||payload.circuitId!=='monza'||savedState.generation!==64||savedState.seed!==7717||
    savedState.population!==40||savedState.rewardRevision!=='progress-3')throw Error('Unexpected V3/Monza checkpoint');
  const data=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),sourceBefore=sourceHashes();
  const simPath=require.resolve(path.join(root,'outputs/simulation.js')),rewardsPath=require.resolve(path.join(root,'outputs/rewards.js'));
  const baseRewards=require(rewardsPath),Fcontrol=require(simPath),control=runArm(Fcontrol,savedState,data,'production-thresholds');
  const known=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-all-workers-3gen-20261022-01/report.json'),'utf8'));
  const expected=known.workers[0].generations[0].outcomes.map(({id,progressM,laps,reason,safe})=>({id,progressM,laps,reason,safe}));
  const observed=control.rows[0].outcomes.map(({id,progressM,laps,reason,safe})=>({id,progressM,laps,reason,safe}));
  const controlReplayMatches=JSON.stringify(expected)===JSON.stringify(observed);
  if(!controlReplayMatches)throw Error('Control generation 64 did not match the verified saved replay');
  const source=fs.readFileSync(rewardsPath,'utf8'),diagnosticSource=source.replace('stall:1400,stallSeconds:8,progressWindowMeters:1','stall:1400,stallSeconds:120,progressWindowMeters:1')
    .replace('minPaceFraction:.05,paceWindowSeconds:8,paceGraceSeconds:16','minPaceFraction:.05,paceWindowSeconds:8,paceGraceSeconds:120');
  if(diagnosticSource===source)throw Error('Failed to build in-memory extended-stop reward source');
  const diagnosticModule=new Module(rewardsPath,module);diagnosticModule.filename=rewardsPath;diagnosticModule.paths=Module._nodeModulePaths(path.dirname(rewardsPath));
  diagnosticModule._compile(diagnosticSource,rewardsPath);diagnosticModule.loaded=true;require.cache[rewardsPath]=diagnosticModule;delete require.cache[simPath];
  const Fextended=require(simPath);
  if(Fextended.Rewards.RULES.stallSeconds!==120||Fextended.Rewards.RULES.paceGraceSeconds!==120)throw Error('Extended thresholds are not active');
  const treatment=runArm(Fextended,savedState,data,'120-second-termination-thresholds');
  const controlTarget=control.rows[0].outcomes.find(x=>x.id===3),treatmentTrace=treatment.targetFirstGenerationTrace;
  const prefix=control.rows[0].outcomes.find(x=>x.id===3).tick;
  const priorTrace=control.targetFirstGenerationTrace.slice(0,prefix),extendedTrace=treatmentTrace.slice(0,prefix);
  const physical=({alive,reason,fitness,safe,...state})=>state;
  const prefixMatches=priorTrace.length===prefix&&extendedTrace.length===prefix&&priorTrace.every((row,i)=>JSON.stringify(physical(row))===JSON.stringify(physical(extendedTrace[i])));
  if(!prefixMatches)throw Error('Generation-64 target diverged before the production termination tick');
  delete require.cache[simPath];require.cache[rewardsPath]={id:rewardsPath,filename:rewardsPath,loaded:true,exports:baseRewards};
  const safeLapMaximum=Math.max(...control.rows.map(r=>r.maxSafeLaps),...treatment.rows.map(r=>r.maxSafeLaps));
  const report={format:'male-cns-saved-v3-termination-grace-two-natural-generations-ab-v1',appVersion:'5.6.0',
    passed:control.rows.length===2&&treatment.rows.length===2&&controlReplayMatches&&prefixMatches,learningSucceeded:safeLapMaximum>=2,
    save:{sha256:saveSha,unchanged:sha(fs.readFileSync(savePath))===saveSha,model:'V3',circuit:'Monza',worker:0,generation:64,seed:savedState.seed,population:savedState.population,rewardRevision:savedState.rewardRevision},
    runtime:'Node 24.19.0 CPU-only',settings:{generationsPerArm:2,control:'production reward-3 termination thresholds',treatment:{stallSeconds:120,paceGraceSeconds:120}},
    method:'Natural generation evolution from matched in-memory copies of the exact saved worker-0 checkpoint. Control uses production rules; treatment changes only two termination-time thresholds. Neural controller, physics, sensors, reward amounts, parent selection, seed, population and mutation are unchanged. No checkpoint write.',
    controlReplayMatchesPriorGeneration64:controlReplayMatches,targetGeneration64PhysicalPrefixMatchesThroughControlStop:prefixMatches,
    initialTarget:{control:controlTarget,extended:treatment.rows[0].outcomes.find(x=>x.id===3)},control,treatment,
    comparison:{safeProgressDeltaByGeneration:treatment.rows.map((r,i)=>r.bestSafeProgressM-control.rows[i].bestSafeProgressM),
      safeLapDeltaByGeneration:treatment.rows.map((r,i)=>r.maxSafeLaps-control.rows[i].maxSafeLaps),promoteTreatment:false},
    sourceHashes:{before:sourceBefore,after:sourceHashes()},saveUnchanged:sha(fs.readFileSync(savePath))===saveSha,
    boundary:'One saved worker, one seed, two natural generations. Longer episodes alter reward timing, so this only tests this checkpoint and cannot establish generalized learning or convergence. A two-lap safe outcome is still required. No production source, app, save, version, package or release changed.'};
  report.passed=report.passed&&report.save.unchanged&&JSON.stringify(report.sourceHashes.before)===JSON.stringify(report.sourceHashes.after);
  if(!report.passed)throw Error('Integrity or paired-replay check failed');
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('TERMINATION_GRACE_2GEN_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged:report.save.unchanged,
    sourceHashesUnchanged:JSON.stringify(report.sourceHashes.before)===JSON.stringify(report.sourceHashes.after),controlReplayMatches,prefixMatches,
    control:control.rows.map(r=>({generation:r.generation,bestSafeProgressM:r.bestSafeProgressM,maxSafeLaps:r.maxSafeLaps,safeAgentCount:r.safeAgentCount})),
    treatment:treatment.rows.map(r=>({generation:r.generation,bestSafeProgressM:r.bestSafeProgressM,maxSafeLaps:r.maxSafeLaps,safeAgentCount:r.safeAgentCount})),
    safeProgressDeltaByGeneration:report.comparison.safeProgressDeltaByGeneration,report:path.join(out,'report.json')}));
}
main().catch(error=>{delete require.cache[require.resolve(path.join(__dirname,'..','outputs/simulation.js'))];
  const rp=require.resolve(path.join(__dirname,'..','outputs/rewards.js'));if(require.cache[rp])delete require.cache[rp];console.error(error.stack||error);process.exitCode=1;});
