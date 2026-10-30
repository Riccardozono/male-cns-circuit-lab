'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const root=path.resolve(__dirname,'..'),F=require('../outputs/simulation.js'),L=require('../outputs/neural-learning.js'),P=require('../outputs/progress-save.js'),
  Legacy=require('../outputs/legacy-models.js'),data=require('../outputs/data/connectome.json'),circuits=require('../outputs/data/circuits.json'),
  {fullRollout,outcome}=require('./practice-full-rollout.cjs'),Mutation=require('./prefix-output-mutation.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const radiusSweep=process.argv.includes('--radius-sweep'),radiusFactors=[1,.03,.003,.0003,.00003];
const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','work/practice-full-rollout.cjs','work/prefix-output-mutation.cjs'];
const hashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
function setup(){return new F.Simulation(Legacy.tagV3(structuredClone(data)),{population:1,modelId:'v3',circuitId:'monza',circuits,seed:7717});}
function run(sim,genome,revision,previousLap){
  const r=fullRollout(F,sim.track,sim.graph,genome,{rewardRevision:revision,previousLapTime:previousLap,maxTicks:60000});
  return {...outcome(F,r),progressM:r.car.bestProgress/(sim.track.pixelsPerMeter||1)};
}
function same(a,b){return ['fitness','bestProgress','laps','reason','ticks','censored','safe'].every(key=>a[key]===b[key]);}
if(!isMainThread){
  try{
    if(JSON.stringify(hashes())!==JSON.stringify(workerData.sources))throw Error('Worker source mismatch');
    const sim=setup(),baseline=run(sim,workerData.genome,workerData.revision,workerData.previousLap);
    if(!same(baseline,workerData.expected))throw Error('Worker real-parent baseline mismatch');
    parentPort.postMessage({kind:'baseline',worker:workerData.index,baseline});
    for(const task of workerData.tasks){const result=run(sim,task.genome,workerData.revision,workerData.previousLap);parentPort.postMessage({kind:'case',hash:task.hash,result});}
    parentPort.postMessage({kind:'done',worker:workerData.index});
  }catch(error){parentPort.postMessage({kind:'error',error:error.stack||String(error)});process.exitCode=1;}
}else main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});

async function main(){
  const out=path.join(root,radiusSweep?'.impeccable/review/learning-ml/saved-v3-motor-radius-screen-20261024-01':'.impeccable/review/learning-ml/saved-v3-prefix-output-screen-20261024-01');
  if(fs.existsSync(out))throw Error('Refusing to overwrite prior screen');
  const started=Date.now(),sources=hashes(),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',bytes=fs.readFileSync(savePath),saveHash=sha(bytes),
    decoded=await P.decode(bytes.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state,
    controlPath=path.join(root,'.impeccable/review/learning-ml/saved-v3-practice-revision-transfer-20261024-01/report.json'),control=JSON.parse(fs.readFileSync(controlPath,'utf8'));
  if(!control.passed||control.integrity.patchedSourceSha256!==sources['outputs/simulation.js']||control.save.sha256!==saveHash||
    state.generation!==64||state.population!==40||state.rewardRevision!=='progress-3'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza')throw Error('Exact corrected-source checkpoint required');
  const sim=setup(),genome=F.cloneGenome(state.genomes[3]),observations=[],previousLap=state.history.at(-1)?.bestLapTime??null;
  const physical=fullRollout(F,sim.track,sim.graph,genome,{rewardRevision:state.rewardRevision,previousLapTime:previousLap,maxTicks:60000,onControl:(car,tick)=>{
    L.rememberActivity(car.brain);observations.push({tick,progress:car.bestProgress,features:Array.from(car.brain.policyFeatures)});
  }}),baseline={...outcome(F,physical),progressM:physical.car.bestProgress/(sim.track.pixelsPerMeter||1)},expected=control.rows[0].leader;
  if(baseline.progressM!==expected.progressM||baseline.fitness!==expected.fitness||baseline.reason!==expected.reason||baseline.laps!==0||baseline.censored)throw Error('Real save parent identity failed');
  const prefixFraction=.85,prefix=observations.filter(x=>x.progress<=physical.car.bestProgress*prefixFraction).map(x=>x.features),experience=physical.car.brain.policyExperience,
    seeds=[101,211,307,401],focuses=['steering','longitudinal','combined'],budgets=[{id:'rms03',rmsLimit:.03,maxLimit:.1},{id:'rms06',rmsLimit:.06,maxLimit:.2}],cases=[],tasks=new Map();
  for(const focus of focuses)for(const seed of seeds){
    const raw=L.safeMotorMutation(sim.graph,genome.policyWeights,F.rng(seed),.24,experience,focus),modes=[{id:'raw',factor:1,child:raw,mirror:L.mirroredMutation(genome.policyWeights,raw)}];
    if(radiusSweep){
      modes.length=0;
      for(const factor of radiusFactors)modes.push({id:'radius-'+factor,factor,child:L.scaleMutation(genome.policyWeights,raw,factor),mirror:L.scaleMutation(genome.policyWeights,raw,-factor)});
    }else for(const budget of budgets)modes.push({id:budget.id,...Mutation.rescale(sim.graph.learning,genome.policyWeights,raw,prefix,budget)});
    for(const mode of modes)for(const sign of [1,-1]){
      const candidate=F.cloneGenome(genome);candidate.policyWeights=(sign===1?mode.child:mode.mirror).slice();if(!L.valid(sim.graph,candidate.policyWeights))throw Error('Invalid candidate bounds');
      const hash=sha(JSON.stringify(candidate)),id=[focus,seed,mode.id,sign].join(':'),response=Mutation.response(sim.graph.learning,genome.policyWeights,candidate.policyWeights,prefix),
        terminalChange=Mutation.response(sim.graph.learning,genome.policyWeights,candidate.policyWeights,[observations.at(-1).features]);
      cases.push({id,focus,seed,sign,mode:mode.id,factor:mode.factor,genomeSha256:hash,prefixResponse:response,terminalResponse:terminalChange});
      if(!tasks.has(hash))tasks.set(hash,{hash,genome:candidate});
    }
  }
  console.log('PREFIX_SCREEN_START '+JSON.stringify({baseline,controls:observations.length,prefixSamples:prefix.length,centres:experience.centres.length,planned:cases.length,unique:tasks.size,workers:2}));
  const pending=[...tasks.values()],outcomes=new Map(),workerBaselines=[],workers=[],workerCount=2;let best=baseline.progressM,completed=0;
  try{
    await Promise.all(Array.from({length:workerCount},(_,index)=>new Promise((resolve,reject)=>{
      const worker=new Worker(__filename,{workerData:{index,genome,revision:state.rewardRevision,previousLap,expected:baseline,sources,tasks:pending.filter((_,i)=>i%workerCount===index)}});workers.push(worker);let done=false;
      worker.on('message',message=>{
        if(message.kind==='error'){reject(Error(message.error));return;}
        if(message.kind==='baseline'){workerBaselines.push(message);return;}
        if(message.kind==='case'){
          outcomes.set(message.hash,message.result);completed++;const improved=message.result.safe&&message.result.progressM>best+1e-9;if(improved)best=message.result.progressM;
          if(completed%8===0||improved)console.log('PREFIX_SCREEN_PROGRESS '+JSON.stringify({completed,total:pending.length,bestSafeM:best,laps:message.result.laps}));return;
        }
        if(message.kind==='done'){done=true;resolve();}
      });worker.once('error',reject);worker.once('exit',code=>{if(!done)reject(Error('Worker exited early: '+code));});
    })));
  }finally{await Promise.all(workers.map(worker=>worker.terminate()));}
  if(outcomes.size!==tasks.size||workerBaselines.length!==2)throw Error('Incomplete physical case census');
  for(const row of cases){row.outcome=outcomes.get(row.genomeSha256);row.safeProgressDeltaM=row.outcome.safe?row.outcome.progressM-baseline.progressM:null;}
  const summaries=[];
  for(const focus of focuses)for(const mode of radiusSweep?radiusFactors.map(x=>'radius-'+x):['raw',...budgets.map(x=>x.id)]){
    const rows=cases.filter(x=>x.focus===focus&&x.mode===mode),safe=rows.filter(x=>x.outcome.safe);
    summaries.push({focus,mode,planned:rows.length,unique:new Set(rows.map(x=>x.genomeSha256)).size,safe:safe.length,
      meanProgressM:rows.reduce((s,x)=>s+x.outcome.progressM,0)/rows.length,bestSafeM:safe.length?Math.max(...safe.map(x=>x.outcome.progressM)):null,
      improvedSafe:safe.filter(x=>x.outcome.progressM>baseline.progressM+1).length,meanPrefixRms:rows.reduce((s,x)=>s+x.prefixResponse.rms,0)/rows.length,
      maxPrefixDrift:Math.max(...rows.map(x=>x.prefixResponse.max)),maxLaps:Math.max(...rows.map(x=>x.outcome.laps))});
  }
  const bestCase=cases.filter(x=>x.outcome.safe).sort((a,b)=>F.compareLearningAgents(a.outcome,b.outcome))[0]||null;
  let confirmation=null;if(bestCase&&bestCase.outcome.progressM>baseline.progressM+1){confirmation=run(sim,tasks.get(bestCase.genomeSha256).genome,state.rewardRevision,previousLap);if(!same(confirmation,bestCase.outcome))throw Error('Best candidate independent replay mismatch');}
  const sourcesAfter=hashes(),saveUnchanged=sha(fs.readFileSync(savePath))===saveHash,sourceStable=JSON.stringify(sources)===JSON.stringify(sourcesAfter);
  const report={format:radiusSweep?'saved-v3-motor-radius-screen-v1':'saved-v3-prefix-output-screen-v1',created:new Date().toISOString(),appVersion:'5.6.0',passed:saveUnchanged&&sourceStable,
    learningSucceeded:cases.some(x=>x.outcome.safe&&x.outcome.laps>=2),candidateImproved:Boolean(confirmation),baseline,
    save:{sha256:saveHash,generation:64,agentId:3,modelId:'v3',circuitId:'monza',population:40,rewardRevision:state.rewardRevision},
    method:radiusSweep?'Measure the physical learning neighborhood using identical signed readout directions at five geometric coefficient radii. Every candidate starts at the line with the real policy and vehicle; no controller input, reward or physics changes. The recorded neuronal prefix is diagnostic only in this sweep.':'Compare identical signed readout mutations before and after output rescaling on real observed prefix neuronal states. The genotype is static; it receives no position, clock, desired action or route. Every unique candidate is evaluated in a natural physical episode from the line. The reference path is used only as training evidence for retaining the parent response, not as driving commands.',
    scientificReference:'https://arxiv.org/abs/1712.06563',algorithmScope:'Custom measured-output rescaling inspired by safe mutation through rescaling, not a reproduction of all paper algorithms.',
    settings:{runtime:`Node ${process.versions.node} CPU-only`,workers:2,focuses,seeds,mutationAmount:.24,prefixFraction,budgets:radiusSweep?null:budgets,radiusFactors:radiusSweep?radiusFactors:null,maxTicks:60000,watchdog:'Censored and ineligible, never counted as a safe result'},
    calibration:{totalControls:observations.length,prefixSamples:prefix.length,centres:experience.centres.length,observationsSha256:sha(JSON.stringify(observations)),featuresPerState:sim.graph.learning.nodes.length},
    plannedCases:cases.length,uniqueEpisodes:tasks.size,workerBaselines,summaries,cases,bestCase,confirmation,
    integrity:{saveUnchanged,sourceStable,before:sources,after:sourcesAfter,controlReportSha256:sha(fs.readFileSync(controlPath))},wallSeconds:(Date.now()-started)/1000,
    boundary:'One saved parent and circuit, four mutation seeds per action focus. A safer prefix response is not evidence of two laps, multi-generation improvement or generalization.'};
  if(!report.passed)throw Error('Integrity failed');fs.mkdirSync(out,{recursive:false});const target=path.join(out,'report.json');fs.writeFileSync(target,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  fs.copyFileSync(__filename,path.join(out,'runner-at-run.cjs'));if(confirmation)fs.writeFileSync(path.join(out,'candidate.private.json'),JSON.stringify({format:'private-prefix-output-research-candidate-v1',appVersion:'5.6.0',genome:tasks.get(bestCase.genomeSha256).genome,sourceReport:'report.json'},null,2),{flag:'wx'});
  console.log('PREFIX_SCREEN_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,candidateImproved:report.candidateImproved,baseline,summaries,
    bestCase,confirmation,planned:cases.length,unique:tasks.size,saveUnchanged,sourceStable,wallSeconds:report.wallSeconds,report:target,sha256:sha(fs.readFileSync(target))}));
}
