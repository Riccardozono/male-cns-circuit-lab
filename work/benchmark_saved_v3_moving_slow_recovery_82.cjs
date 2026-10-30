'use strict';
// Two natural generations from two in-memory copies of the user's exact save.
// The treatment changes only slow-pace termination while actively recovering;
// the slow penalty, no-progress stop, collision handling and controls remain.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-moving-slow-recovery-2gen-ab-20261026-82');
const priorFile=path.join(root,'.impeccable/review/learning-ml/saved-v3-paired-sensor-longitudinal-4updates-cuda-20261026-01/report.json');
const researchFile=path.join(root,'.impeccable/review/learning-ml/statehead-moving-slow-recovery-paired-20261026-81/report.json');
const expectedSave='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
const P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js'),circuits=require('../outputs/data/circuits.json');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),shaFile=f=>sha(fs.readFileSync(f));
const sourcePaths=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js',
  'outputs/dense-neural.js','outputs/vehicle-992.js','outputs/data/circuits.json','outputs/data/connectome.json'];
const sourceHashes=()=>Object.fromEntries(sourcePaths.map(f=>[f,shaFile(path.join(root,f))]));
const physical=(car,tick)=>[tick,car.x,car.y,car.heading,car.bestProgress,car.laps,car.lifetime,
  car.vehicle?.speedMps??0,car.outputs.slice(),car.fitness];
const sample=(car,tick,F)=>({id:car.id,tick,reason:car.reason,lifetime:car.lifetime,x:car.x,y:car.y,heading:car.heading,
  progressM:car.bestProgress/(car.pixelsPerMeter||1),laps:car.laps,speedMps:car.vehicle?.speedMps??0,
  outputs:car.outputs.slice(),fitness:car.fitness,safe:F.isSafeLearningOutcome(car),
  slowPenalty:car.rewardBreakdown.penalties.slowProgress,deferrals:car.__diagnosticSlowPaceDeferrals||0,
  deferralEvents:car.__diagnosticSlowPaceEvents||[]});

function runArm(F,savedState,data,name,baseline=null){
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:savedState.population,
    circuitId:'monza',circuits,seed:savedState.seed});
  P.restore(sim,structuredClone(savedState));sim.running=true;
  const startGeneration=sim.generation,rows=[],hashes=new Map(),prefixCounts=new Map(),prefixAtStop=new Map();
  let ticks=0,generationTicks=0,terminal=new Map();
  for(let id=0;id<savedState.population;id++){hashes.set(id,crypto.createHash('sha256'));prefixCounts.set(id,0);}
  sim.onTrialTick=s=>{
    const first=s.generation===startGeneration;
    for(const car of s.cars){
      if(first){
        const reference=baseline?.get(car.id);
        if(baseline&&!reference)throw Error('Missing paired control car');
        const include=baseline?s.ticks<reference.tick:car.alive;
        if(include){
          if(!car.alive)throw Error('Treatment ended before its control prefix');
          hashes.get(car.id).update(JSON.stringify(physical(car,s.ticks))+'\n');
          prefixCounts.set(car.id,prefixCounts.get(car.id)+1);
        }
        if(baseline&&s.ticks===reference.tick)
          prefixAtStop.set(car.id,sample(car,s.ticks,F));
      }
      if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,sample(car,s.ticks,F));
    }
  };
  const started=Date.now();
  while(sim.generation<startGeneration+2){
    if(generationTicks>=20000)throw Error(`${name}: diagnostic guard reached; generation incomplete`);
    const generation=sim.generation;sim.tick();generationTicks++;ticks++;
    if(sim.generation!==generation){
      if(terminal.size!==savedState.population)throw Error('Generation ended without a complete terminal census');
      const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(e=>e.safe),history=sim.history.at(-1);
      rows.push({generation:history.generation,ticks:generationTicks,safeAgentCount:safe.length,
        bestSafeProgressM:safe.length?Math.max(...safe.map(e=>e.progressM)):null,
        maxSafeLaps:safe.length?Math.max(...safe.map(e=>e.laps)):0,
        reasonCounts:outcomes.reduce((a,e)=>(a[e.reason]=(a[e.reason]||0)+1,a),{}),
        optimizerUpdates:sim.optimizer?.updates??null,outcomes});
      console.log('MOVING_SLOW_GENERATION '+JSON.stringify({arm:name,generation:history.generation,
        safe:rows.at(-1).safeAgentCount,bestSafeProgressM:rows.at(-1).bestSafeProgressM,maxSafeLaps:rows.at(-1).maxSafeLaps,ticks:generationTicks}));
      terminal=new Map();generationTicks=0;
    }
  }
  sim.running=false;
  const prefixes=new Map([...hashes].map(([id,hash])=>[id,{sha256:hash.digest('hex'),controls:prefixCounts.get(id)}]));
  return {name,startGeneration,rows,prefixes,prefixAtStop,wallSeconds:(Date.now()-started)/1000,totalTicks:ticks};
}

async function main(){
  if(process.versions.node!=='24.19.0'||fs.existsSync(out))throw Error('Pinned runtime and new output directory required');
  if(shaFile(savePath)!==expectedSave)throw Error('Original save hash differs');
  const decoded=await P.decode(fs.readFileSync(savePath,'utf8'),'5.6.0'),payload=decoded.payload,savedState=payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||payload.modelId!=='v3'||payload.circuitId!=='monza'||savedState.generation!==64||
     savedState.seed!==7717||savedState.population!==40||savedState.rewardRevision!=='progress-3')throw Error('Unexpected saved session');
  const prior=JSON.parse(fs.readFileSync(priorFile,'utf8')),research=JSON.parse(fs.readFileSync(researchFile,'utf8'));
  if(!prior.passed||!research.passed||research.summary.resumed!==7||research.sourceRunSha256!==
     'a406b8c01d5525498f2d9ae94cbeb1b5e5f6bdedc70f40130494986a1a382f28')throw Error('Expected verified prior evidence');
  const sourceBefore=sourceHashes();
  for(const [file,digest] of Object.entries(prior.sourceHashes.after))if(sourceBefore[file]!==digest)throw Error('Current app source differs from the previous saved-session replay: '+file);
  const data=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'));
  const simPath=require.resolve('../outputs/simulation.js'),rewardsPath=require.resolve('../outputs/rewards.js');
  const baseRewards=require(rewardsPath),Fcontrol=require(simPath),control=runArm(Fcontrol,savedState,data,'control');
  const known=prior.control.records[0].outcomes,observed=control.rows[0].outcomes;
  const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-8;
  const baselineMatches=known.length===observed.length&&known.every((a,i)=>{
    const b=observed[i];return a.id===b.id&&a.laps===b.laps&&a.reason===b.reason&&a.safe===b.safe&&
      near(a.progressM,b.progressM)&&near(a.fitness,b.fitness)&&near(a.gas,b.outputs[1])&&near(a.brake,b.outputs[2])&&near(a.steering,b.outputs[0]);
  });
  if(!baselineMatches)throw Error('Current CPU control differs from the independently recorded GPU generation 64');
  const source=fs.readFileSync(rewardsPath,'utf8');
  const declaration='const s=car.rewardState,ppm=track.pixelsPerMeter||1,reference=referenceLapTime(track);';
  const terminal="if(car.lifetime>=RULES.paceGraceSeconds&&recentPace<minimum){debit(car,'slowProgress',RULES.stall);reason='troppo lenta / senza progresso';}";
  if(source.split(declaration).length!==2||source.split(terminal).length!==2)throw Error('Exact expected reward rule not found once');
  const modified=source.replace(declaration,'const s=car.rewardState,ppm=track.pixelsPerMeter||1,reference=referenceLapTime(track),previousHighWater=s.highWater;')
    .replace(terminal,"if(car.lifetime>=RULES.paceGraceSeconds&&recentPace<minimum){debit(car,'slowProgress',RULES.stall);if(v>=minimum/ppm&&s.highWater>previousHighWater+1e-12){car.__diagnosticSlowPaceDeferrals=(car.__diagnosticSlowPaceDeferrals||0)+1;(car.__diagnosticSlowPaceEvents||(car.__diagnosticSlowPaceEvents=[])).push({lifetime:car.lifetime,speedMps:v,minimumMps:minimum/ppm,progress:s.highWater,slowPenalty:car.rewardBreakdown.penalties.slowProgress});}else reason='troppo lenta / senza progresso';}");
  const diagnosticModule=new Module(rewardsPath,module);diagnosticModule.filename=rewardsPath;diagnosticModule.paths=Module._nodeModulePaths(path.dirname(rewardsPath));
  diagnosticModule._compile(modified,rewardsPath);diagnosticModule.loaded=true;require.cache[rewardsPath]=diagnosticModule;delete require.cache[simPath];
  const Ftreatment=require(simPath);
  if(Ftreatment.Rewards.RULES.stallSeconds!==8||Ftreatment.Rewards.RULES.paceGraceSeconds!==16||Ftreatment.Rewards.RULES.stall!==1400)
    throw Error('Original slow penalty and termination thresholds must be retained');
  const baselineById=new Map(control.rows[0].outcomes.map(e=>[e.id,e]));
  const treatment=runArm(Ftreatment,savedState,data,'moving-recovery',baselineById);
  const prefixChecks=[];
  for(const [id,reference] of baselineById){
    const a=control.prefixes.get(id),b=treatment.prefixes.get(id),stop=treatment.prefixAtStop.get(id);
    const matchingPrefix=a.sha256===b.sha256&&a.controls===b.controls;
    const matchingStop=Boolean(stop)&&['x','y','heading','progressM','lifetime'].every(k=>near(reference[k],stop[k]))&&
      JSON.stringify(reference.outputs)===JSON.stringify(stop.outputs);
    if(!matchingPrefix||!matchingStop)throw Error('Physical trajectory diverged before the original stopping point for car '+id);
    prefixChecks.push({id,matchedControls:a.controls,prefixSha256:a.sha256,matchingPrefix,matchingStop});
  }
  delete require.cache[simPath];require.cache[rewardsPath]={id:rewardsPath,filename:rewardsPath,loaded:true,exports:baseRewards};
  const byId=new Map(treatment.rows[0].outcomes.map(e=>[e.id,e]));
  const deferred=control.rows[0].outcomes.map(a=>({control:a,treatment:byId.get(a.id)})).filter(p=>p.treatment.deferrals>0);
  const sourceAfter=sourceHashes();
  if(shaFile(savePath)!==expectedSave||JSON.stringify(sourceBefore)!==JSON.stringify(sourceAfter))throw Error('Save or app source changed during A/B');
  const report={format:'saved-v3-moving-slow-recovery-two-generation-ab-v1',appVersion:'5.6.0',passed:true,
    learningSucceeded:Math.max(...treatment.rows.map(r=>r.maxSafeLaps))>=2,approvedForApp:false,
    save:{sha256:expectedSave,model:'V3',circuit:'Monza',worker:0,generation:64,seed:7717,population:40,rewardRevision:'progress-3'},
    runtime:'Node 24.19.0 CPU-only',settings:{generationsPerArm:2,diagnosticGuardTicksPerGeneration:20000,
      control:'current app slow-pace rule',treatment:'retain slow penalty; continue only if speed >= minimum and current high-water progress advances'},
    modifiedRewardSourceSha256:sha(modified),priorReportSha256:shaFile(priorFile),researchReportSha256:shaFile(researchFile),
    controlGeneration64MatchesGpuReference:baselineMatches,prefixChecks,sourceHashes:{before:sourceBefore,after:sourceAfter},
    runnerSha256:shaFile(__filename),saveUnchanged:true,
    control:{name:control.name,rows:control.rows,wallSeconds:control.wallSeconds,totalTicks:control.totalTicks},
    treatment:{name:treatment.name,rows:treatment.rows,wallSeconds:treatment.wallSeconds,totalTicks:treatment.totalTicks},
    comparison:{deferredGeneration64:deferred,safeProgressDeltaByGeneration:treatment.rows.map((r,i)=>r.bestSafeProgressM-control.rows[i].bestSafeProgressM),
      safeLapDeltaByGeneration:treatment.rows.map((r,i)=>r.maxSafeLaps-control.rows[i].maxSafeLaps)},
    boundary:'One real saved worker, one seed and two natural generations. All forty generation-64 prefixes are checked. In-memory reward rule only; no teacher, route command, save migration, production source, app package or version change. This is not cross-circuit/model generalization.'};
  fs.mkdirSync(out,{recursive:false});const reportFile=path.join(out,'report.json');
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  console.log('MOVING_SLOW_AB_REPORT '+JSON.stringify({report:reportFile,sha256:shaFile(reportFile),
    control:control.rows.map(r=>({generation:r.generation,safe:r.safeAgentCount,bestSafeProgressM:r.bestSafeProgressM,maxSafeLaps:r.maxSafeLaps})),
    treatment:treatment.rows.map(r=>({generation:r.generation,safe:r.safeAgentCount,bestSafeProgressM:r.bestSafeProgressM,maxSafeLaps:r.maxSafeLaps})),
    deferred:deferred.map(p=>({id:p.control.id,from:p.control.progressM,to:p.treatment.progressM,reason:p.treatment.reason,deferrals:p.treatment.deferrals})),
    prefixChecks:prefixChecks.length,learningSucceeded:report.learningSucceeded}));
}
main().catch(error=>{console.error('MOVING_SLOW_AB_FAILED '+(error.stack||error));process.exitCode=1;});
