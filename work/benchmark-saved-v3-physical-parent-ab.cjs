'use strict';
// In-memory saved V3 test: valid higher-fitness collision outcomes may seed
// mutation offspring only. Safe selection, champion, archives and all physics
// and reward penalties remain unchanged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_PHYSICAL_PARENT_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-physical-parent-ab-20261020-01')),
  simFile=path.join(root,'outputs/simulation.js'),simSource=fs.readFileSync(simFile,'utf8'),Progress=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),compact=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),
  circuits=require(path.join(root,'outputs/data/circuits.json')),F=require(path.join(root,'outputs/simulation.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function replaceExactly(text,before,after){const n=text.split(before).length-1;if(n!==1)throw Error(`Expected one source contract, found ${n}: ${before}`);return text.replace(before,after);}
function makeData(){return Legacy.tagV3(JSON.parse(JSON.stringify(compact)));}
function makeEngine(){
  let text=simSource;
  text=replaceExactly(text,'const eliteCandidates=learningRanked;',
    `const reproductionRanked=this.experimentalUnsafeLearningParents
        ?eligible.filter(car=>!car.censored&&!car.overlap&&!(Number(car.rewardBreakdown?.penalties?.invalid)>0)).slice().sort(compareAgents)
        :learningRanked;
      const eliteCandidates=reproductionRanked;`);
  text=replaceExactly(text,'const parent=learningRanked[Math.min(eliteCount-1,Math.floor(Math.pow(this.random(),1.6)*eliteCount))];',
    'const parent=reproductionRanked[Math.min(eliteCount-1,Math.floor(Math.pow(this.random(),1.6)*eliteCount))];');
  const m=new Module(simFile,module);m.filename=simFile;m.paths=Module._nodeModulePaths(path.dirname(simFile));
  const localRequire=m.require.bind(m);m.require=request=>request==='./neural-learning.js'?require(path.join(root,'outputs/neural-learning.js')):localRequire(request);
  m._compile(text,simFile);return {Simulation:m.exports.Simulation,isSafeLearningOutcome:m.exports.isSafeLearningOutcome};
}
function summarize(cars,ppm,engine){return cars.filter(c=>!c.diagnosticVehicle).map(c=>({id:c.id,progressM:c.bestProgress/ppm,laps:c.laps,reason:c.reason,fitness:c.fitness,safe:engine.isSafeLearningOutcome(c),
  valid:!c.censored&&!c.overlap&&!(Number(c.rewardBreakdown?.penalties?.invalid)>0)})).sort((a,b)=>a.id-b.id);}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing A/B report');
  const bytes=fs.readFileSync(savePath),saveSha=sha(bytes),decoded=await Progress.decode(bytes.toString('utf8'),'5.6.0'),stateOriginal=decoded.payload.workers[0].state,
    controlReport=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-brake-lock-migration-ab-20261020-01/report.json'),'utf8')),
    sourceHashes={simulation:sha(Buffer.from(simSource)),learning:sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js')))};
  const baseHashes=controlReport.baseline.sourceHashes;
  if(!baseHashes||baseHashes['simulation.js']!==sourceHashes.simulation||baseHashes['neural-learning.js']!==sourceHashes.learning)throw Error('The deterministic control does not match current app sources');
  const engine=makeEngine(),descriptor=new engine.Simulation(makeData(),{modelId:'v3',population:stateOriginal.population,circuitId:'monza',circuits});
  Progress.validatePayload(decoded.payload,{graph:descriptor.graph,circuits:descriptor.circuits});descriptor.running=false;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||stateOriginal.generation!==64||stateOriginal.seed!==7717||stateOriginal.population!==40||stateOriginal.rewardRevision!=='progress-3')
    throw Error('The exact supplied V3/Monza generation-64 save was not selected');
  const state=structuredClone(stateOriginal);state.history=[];
  const sim=new engine.Simulation(makeData(),{modelId:'v3',population:state.population,circuitId:'monza',circuits});
  Progress.restore(sim,state);sim.running=true;sim.experimentalUnsafeLearningParents=true;
  const results=[],started=performance.now();let terminal=null,lastLog=performance.now();
  sim.onTrialTick=s=>{
    if(s.cars.every(c=>!c.alive))terminal=summarize(s.cars,s.track.pixelsPerMeter||1,engine);
    if(performance.now()-lastLog>25000){lastLog=performance.now();console.log('PHYSICAL_PARENT_PROGRESS '+JSON.stringify({generation:s.generation,alive:s.cars.filter(c=>c.alive).length,bestM:Math.max(...s.cars.map(c=>c.bestProgress))/(s.track.pixelsPerMeter||1)}));}
  };
  for(let i=0;i<3;i++){
    const generation=sim.generation;let ticks=0;
    while(sim.generation===generation&&ticks<60000){sim.tick();ticks++;}
    if(sim.generation===generation||!terminal)throw Error(`Generation ${generation} did not finish naturally`);
    const ppm=sim.track.pixelsPerMeter||1,h=sim.history.at(-1),all=terminal.slice().sort((a,b)=>b.progressM-a.progressM),safe=terminal.filter(c=>c.safe).sort((a,b)=>b.progressM-a.progressM),
      parents=terminal.filter(c=>c.valid).slice().sort((a,b)=>b.fitness-a.fitness||b.laps-a.laps||b.progressM-a.progressM).slice(0,Math.min(4,state.population-2));
    results.push({generation:h.generation,ticks,wallSeconds:(performance.now()-started)/1000,bestProgressM:h.bestProgress/ppm,meanProgressM:h.meanProgress/ppm,maxLaps:h.maxLaps,
      reasons:terminal.reduce((a,c)=>(a[c.reason||'n/a']=(a[c.reason||'n/a']||0)+1,a),{}),overallLeader:all[0],safeProgressLeader:safe[0]||null,
      reproductiveCandidates:parents.map(({id,progressM,reason,fitness,safe})=>({id,progressM,reason,fitness,safe})),
      unsafeCandidatesEligibleForMutation:parents.filter(c=>!c.safe).length,
      gen64Outcomes:terminal.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}))});
    terminal=null;
    console.log('PHYSICAL_PARENT_GENERATION '+JSON.stringify({generation:h.generation,bestProgressM:h.bestProgress/ppm,maxLaps:h.maxLaps,overallLeader:all[0],safeProgressLeader:safe[0]||null,
      unsafeParents:results.at(-1).unsafeCandidatesEligibleForMutation,topParents:results.at(-1).reproductiveCandidates.map(c=>({id:c.id,progressM:c.progressM,reason:c.reason}))}));
  }
  const reference=controlReport.baseline.history.slice(0,3).map(h=>({generation:h.generation,bestProgressM:h.bestProgressM,maxLaps:h.maxLaps})),
    firstGenerationMatches=JSON.stringify(controlReport.baseline.finishedCars[0].map(({id,progressM,laps,reason})=>({id,progressM,laps,reason})))===JSON.stringify(results[0].gen64Outcomes);
  if(!firstGenerationMatches)throw Error('First physical generation did not match the verified control and saved outcomes');
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;if(!saveUnchanged)throw Error('Original user save checksum changed');
  const report={format:'male-cns-saved-v3-physical-parent-ab-v1',appVersion:'5.6.0',passed:true,learningSucceeded:results.some(r=>r.maxLaps>=2),
    save:{sha256:saveSha,unchanged:saveUnchanged},settings:{model:'V3',circuit:'Monza',seed:stateOriginal.seed,startGeneration:stateOriginal.generation,population:stateOriginal.population,
      rewardRevision:stateOriginal.rewardRevision,naturalGenerations:3,historyReset:true},sourceHashes,
    method:'Matched against the deterministic, source-hash-identical safe-only control. Treatment changes only the genotypes admitted to the small reproduction/variation elite: all valid outcomes are ranked by the existing physical fitness, including full collision/impact/no-lap penalties. Safe selectionWinner, optimizer feedback, champion, hall of fame, safe frontier, and physics remain unchanged. Unsafe policies are only evaluated after ordinary mutations; they cannot be accepted as champions or safe archive entries.',
    baselineReference:reference,firstPhysicalGenerationMatches:firstGenerationMatches,treatment:{label:'fitness-ranked valid mutation parents',results},
    comparison:{progressDeltaMeters:results.map((r,i)=>r.bestProgressM-reference[i].bestProgressM),lapDelta:results.map((r,i)=>r.maxLaps-reference[i].maxLaps),
      unsafeParentsUsed:results.map(r=>r.unsafeCandidatesEligibleForMutation),promoteTreatment:false},
    boundary:'Three natural generations from one saved model can show only a local signal. Two laps and generalization to another seed, fresh model, or circuit remain unverified. No app code, user save, version, release or trained weights are changed.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('PHYSICAL_PARENT_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged,firstGenerationMatches,
    baselineReference:reference,treatment:results.map(r=>({generation:r.generation,bestProgressM:r.bestProgressM,maxLaps:r.maxLaps,unsafeParents:r.unsafeCandidatesEligibleForMutation})),output:path.join(out,'report.json')}));
  sim.running=false;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
