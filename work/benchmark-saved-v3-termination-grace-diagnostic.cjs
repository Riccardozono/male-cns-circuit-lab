'use strict';
// Read-only paired diagnostic: does the saved V3 car move again if ordinary
// slow/stall termination is delayed? No source, save, or release is changed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-termination-grace-diagnostic-20261022-02');
const P=require(path.join(root,'outputs/progress-save.js'));
const Legacy=require(path.join(root,'outputs/legacy-models.js'));
const circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourcePaths=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js'];
const sourceHashes=()=>Object.fromEntries(sourcePaths.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
const sample=car=>({id:car.id,alive:car.alive,reason:car.reason,lifetime:car.lifetime,x:car.x,y:car.y,
  bestProgress:car.bestProgress,laps:car.laps,speedMps:car.vehicle?.speedMps??0,outputs:car.outputs.slice(),
  lastProgressTime:car.lastProgressTime,paceTime:car.rewardState?.paceTime,paceProgress:car.rewardState?.paceProgress});

function runGeneration(F,savedState,data,name,maxTicks=20000){
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:savedState.population,
    circuitId:'monza',circuits,seed:savedState.seed});
  P.restore(sim,structuredClone(savedState));
  sim.running=true;
  const generation=sim.generation,terminal=new Map(),targetTrace=[];let ticks=0;
  sim.onTrialTick=s=>{
    const target=s.cars.find(car=>car.id===3);
    if(target)targetTrace.push({tick:s.ticks,...sample(target)});
    if(s.cars.every(car=>!car.alive))for(const car of s.cars)if(!terminal.has(car.id))terminal.set(car.id,{tick:s.ticks,...sample(car),
      progressM:car.bestProgress/(s.track.pixelsPerMeter||1),fitness:car.fitness,safe:F.isSafeLearningOutcome(car)});
  };
  const started=Date.now();
  while(sim.generation===generation&&ticks<maxTicks){sim.tick();ticks++;}
  const complete=sim.generation!==generation&&terminal.size===savedState.population;
  sim.running=false;
  return {name,complete,ticks,wallSeconds:(Date.now()-started)/1000,terminal:[...terminal.values()].sort((a,b)=>a.id-b.id),targetTrace,
    maxSafeLaps:Math.max(0,...[...terminal.values()].filter(x=>x.safe).map(x=>x.laps)),
    maxSafeProgressM:Math.max(0,...[...terminal.values()].filter(x=>x.safe).map(x=>x.progressM))};
}

async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing diagnostic report');
  const saveBytes=fs.readFileSync(savePath),saveSha=sha(saveBytes),decoded=await P.decode(saveBytes.toString('utf8'),'5.6.0');
  const payload=decoded.payload,savedState=payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||payload.modelId!=='v3'||payload.circuitId!=='monza'||savedState.generation!==64||
    savedState.seed!==7717||savedState.population!==40||savedState.rewardRevision!=='progress-3')throw Error('Unexpected V3/Monza checkpoint');
  const data=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'));
  const sourceBefore=sourceHashes();
  const simPath=require.resolve(path.join(root,'outputs/simulation.js'));
  const rewardsPath=require.resolve(path.join(root,'outputs/rewards.js'));
  const baseRewards=require(rewardsPath),Fcontrol=require(simPath);
  const control=runGeneration(Fcontrol,savedState,data,'production-termination');
  const prior=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-all-workers-3gen-20261022-01/report.json'),'utf8'));
  const expected=prior.workers[0].generations[0].outcomes.map(({id,progressM,laps,reason,safe})=>({id,progressM,laps,reason,safe}));
  const observed=control.terminal.map(({id,progressM,laps,reason,safe})=>({id,progressM,laps,reason,safe}));
  const controlReplayMatches=JSON.stringify(expected)===JSON.stringify(observed);
  if(!control.complete||!controlReplayMatches)throw Error('Production-termination control did not reproduce the verified gen64 outcome');

  const Module=require('node:module'),rewardSource=fs.readFileSync(rewardsPath,'utf8');
  const diagnosticSource=rewardSource.replace('stall:1400,stallSeconds:8,progressWindowMeters:1','stall:1400,stallSeconds:120,progressWindowMeters:1')
    .replace('minPaceFraction:.05,paceWindowSeconds:8,paceGraceSeconds:16','minPaceFraction:.05,paceWindowSeconds:8,paceGraceSeconds:120');
  if(diagnosticSource===rewardSource||!diagnosticSource.includes('stallSeconds:120')||!diagnosticSource.includes('paceGraceSeconds:120'))
    throw Error('Failed to create the in-memory termination-threshold variant');
  const diagnosticModule=new Module(rewardsPath,module);diagnosticModule.filename=rewardsPath;
  diagnosticModule.paths=Module._nodeModulePaths(path.dirname(rewardsPath));diagnosticModule._compile(diagnosticSource,rewardsPath);diagnosticModule.loaded=true;
  require.cache[rewardsPath]=diagnosticModule;
  delete require.cache[simPath];
  const Fextended=require(simPath);
  if(Fextended.Rewards.RULES.stallSeconds!==120||Fextended.Rewards.RULES.paceGraceSeconds!==120)
    throw Error('Extended termination rules are not active in the treatment engine');
  const treatment=runGeneration(Fextended,savedState,data,'termination-grace-120s');
  delete require.cache[simPath];
  require.cache[rewardsPath]={id:rewardsPath,filename:rewardsPath,loaded:true,exports:baseRewards};

  const controlTarget=control.terminal.find(car=>car.id===3),treatmentTarget=treatment.terminal.find(car=>car.id===3);
  const targetControlPrefix=control.targetTrace.slice(0,controlTarget.tick),extendedPrefix=treatment.targetTrace.slice(0,controlTarget.tick);
  const prefixMatches=targetControlPrefix.length===controlTarget.tick&&extendedPrefix.length===controlTarget.tick&&
    targetControlPrefix.every((row,index)=>{
      const other=extendedPrefix[index];
      const physical=({alive,reason,...state})=>state;
      return JSON.stringify(physical(row))===JSON.stringify(physical(other));
    });
  if(!prefixMatches)throw Error('The treatment trajectory diverged before the production termination boundary');
  const continued=treatment.targetTrace.filter(row=>row.tick>controlTarget.tick);
  const extraProgressM=continued.length?Math.max(...continued.map(row=>row.bestProgress-controlTarget.bestProgress)):0;
  const maximumSpeedAfterStop=continued.length?Math.max(...continued.map(row=>row.speedMps)):0;
  const report={format:'male-cns-saved-v3-termination-grace-diagnostic-v1',appVersion:'5.6.0',passed:Boolean(controlReplayMatches&&prefixMatches&&control.complete&&treatment.complete),
    learningSucceeded:false,save:{sha256:saveSha,unchanged:sha(fs.readFileSync(savePath))===saveSha,model:'V3',circuit:'Monza',worker:0,generation:64,seed:savedState.seed,population:savedState.population,rewardRevision:savedState.rewardRevision},
    runtime:'Node 24.19.0 CPU-only',method:'Matched in-memory replays of the exact saved worker-0 population. Control uses production reward-3 timing. Treatment changes only stallSeconds and paceGraceSeconds to 120 seconds; physics, sensors, brain, actions, reward amounts, population, seed and checkpoint are unchanged. Verify identical target trajectory up to the control termination tick, then measure any spontaneous recovery. The checkpoint is never written.',
    settings:{control:{stallSeconds:baseRewards.RULES.stallSeconds,paceGraceSeconds:baseRewards.RULES.paceGraceSeconds},treatment:{stallSeconds:120,paceGraceSeconds:120},maxTicks:20000,targetAgentId:3},
    controlReplayMatchesPriorGeneration64:controlReplayMatches,control:{complete:control.complete,ticks:control.ticks,wallSeconds:control.wallSeconds,maxSafeProgressM:control.maxSafeProgressM,maxSafeLaps:control.maxSafeLaps,target:controlTarget},
    treatment:{complete:treatment.complete,ticks:treatment.ticks,wallSeconds:treatment.wallSeconds,maxSafeProgressM:treatment.maxSafeProgressM,maxSafeLaps:treatment.maxSafeLaps,target:treatmentTarget,
      targetTraceAfterControlStop:{samples:continued.length,extraProgressM,maximumSpeedMps:maximumSpeedAfterStop,firstAfterStop:continued[0]||null,last:continued.at(-1)||null}},
    targetPrefixMatchesThroughControlTermination:prefixMatches,sourceHashes:{before:sourceBefore,after:sourceHashes()},saveUnchanged:sha(fs.readFileSync(savePath))===saveSha,
    boundary:'A single saved worker and seed, one diagnostic generation, CPU-only. Extending termination is counterfactual, not a production recommendation or proof of learning. Success requires safe two-lap behavior in independent natural generations; no app source, reward, model weights, save, version, package or release was changed.'};
  report.passed=report.passed&&report.saveUnchanged&&JSON.stringify(report.sourceHashes.before)===JSON.stringify(report.sourceHashes.after);
  if(!report.passed)throw Error('Replay, prefix parity, completion or integrity check failed');
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('TERMINATION_GRACE_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged:report.saveUnchanged,
    sourceHashesUnchanged:JSON.stringify(report.sourceHashes.before)===JSON.stringify(report.sourceHashes.after),controlReplayMatches,prefixMatches,
    control:{ticks:control.ticks,target:controlTarget},treatment:{ticks:treatment.ticks,target:treatmentTarget,extraProgressM,maximumSpeedAfterStop},report:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
