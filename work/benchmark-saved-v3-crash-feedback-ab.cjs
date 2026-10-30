'use strict';
// Matched in-memory V3/Monza test: treatment lets valid collision episodes
// influence only the optimizer's neural mean; actual penalties and safe
// parent/champion/archive gates remain unchanged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_CRASH_FEEDBACK_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-crash-learning-feedback-ab-20261020-01'));
const simFile=path.join(root,'outputs/simulation.js'),simSource=fs.readFileSync(simFile,'utf8'),
  Progress=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js')),
  compact=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),
  circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function replaceExactly(text,before,after){const count=text.split(before).length-1;if(count!==1)throw Error(`Expected one source contract, got ${count}: ${before}`);return text.replace(before,after);}
function makeData(){return Legacy.tagV3(JSON.parse(JSON.stringify(compact)));}
function makeEngine(treatment){
  let text=simSource;
  if(treatment)text=replaceExactly(text,
    'if(this.mutation>0&&!noSafeLearningCandidate)this.optimizer?.update(learningRanked,usesLearningOutcome?compareLearningAgents:undefined);',
    `if(this.mutation>0&&!noSafeLearningCandidate){
      const feedback=this.experimentalUnsafeLearningFeedback
        ?eligible.filter(car=>!car.censored&&!car.overlap&&!['fuori pista','progresso non valido','collision','off track','invalid progress'].includes(String(car.reason||'').trim().toLowerCase())&&!(Number(car.rewardBreakdown?.penalties?.invalid)>0)).slice().sort(compareAgents)
        :learningRanked;
      if(this.experimentalUnsafeLearningFeedback){const top=Math.min(feedback.length,Math.max(2,Math.ceil(feedback.length/4)));this.experimentalFeedbackDiagnostics={episodes:feedback.length,unsafeEpisodes:feedback.filter(car=>!isSafeLearningOutcome(car)).length,unsafeTopQuartile:feedback.slice(0,top).filter(car=>!isSafeLearningOutcome(car)).length};}
      this.optimizer?.update(feedback,usesLearningOutcome?(this.experimentalUnsafeLearningFeedback?compareAgents:compareLearningAgents):undefined);
    }`);
  const m=new Module(simFile,module);m.filename=simFile;m.paths=Module._nodeModulePaths(path.dirname(simFile));
  const requireWithLearning=m.require.bind(m);m.require=request=>request==='./neural-learning.js'?require(path.join(root,'outputs/neural-learning.js')):requireWithLearning(request);
  m._compile(text,simFile);return {Simulation:m.exports.Simulation,compareAgents:m.exports.compareAgents,isSafeLearningOutcome:m.exports.isSafeLearningOutcome};
}
function finishedCars(cars,ppm,engine){return cars.filter(c=>!c.diagnosticVehicle).map(c=>({id:c.id,progressM:c.bestProgress/ppm,laps:c.laps,reason:c.reason,fitness:c.fitness,safe:engine.isSafeLearningOutcome(c)})).sort((a,b)=>a.id-b.id);}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing A/B report');
  if(!fs.existsSync(savePath))throw Error('Exact supplied V3/Monza save is missing');
  const bytes=fs.readFileSync(savePath),saveSha=sha(bytes),decoded=await Progress.decode(bytes.toString('utf8'),'5.6.0'),
    baselineEvidence=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-brake-lock-migration-ab-20261020-01/report.json'),'utf8')),
    stateOriginal=decoded.payload.workers[0].state;
  const baseEngine=makeEngine(false),initial=new baseEngine.Simulation(makeData(),{modelId:'v3',population:stateOriginal.population,circuitId:'monza',circuits});
  Progress.validatePayload(decoded.payload,{graph:initial.graph,circuits:initial.circuits});
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||stateOriginal.generation!==64||stateOriginal.seed!==7717||stateOriginal.population!==40||stateOriginal.rewardRevision!=='progress-3')
    throw Error('The supplied save does not match the verified V3/Monza generation-64 identity');
  initial.running=false;
  function run(label,treatment){
    const engine=makeEngine(treatment),state=structuredClone(stateOriginal),sim=new engine.Simulation(makeData(),{modelId:'v3',population:state.population,circuitId:'monza',circuits});
    state.history=[];Progress.restore(sim,state);sim.running=true;if(treatment)sim.experimentalUnsafeLearningFeedback=true;
    const results=[],started=performance.now();let terminal=null,lastLog=performance.now();
    sim.onTrialTick=s=>{
      if(s.cars.every(c=>!c.alive))terminal=finishedCars(s.cars,s.track.pixelsPerMeter||1,engine);
      if(performance.now()-lastLog>25000){lastLog=performance.now();console.log('CRASH_FEEDBACK_PROGRESS '+JSON.stringify({arm:label,generation:s.generation,alive:s.cars.filter(c=>c.alive).length,bestM:Math.max(...s.cars.map(c=>c.bestProgress))/(s.track.pixelsPerMeter||1)}));}
    };
    for(let i=0;i<3;i++){
      const generation=sim.generation;let ticks=0;
      while(sim.generation===generation&&ticks<60000){sim.tick();ticks++;}
      if(sim.generation===generation||!terminal)throw Error(`${label}: generation ${generation} did not end naturally with terminal outcomes`);
      const ppm=sim.track.pixelsPerMeter||1,h=sim.history.at(-1),cars=terminal;
      const reasons=cars.reduce((a,c)=>(a[c.reason||'n/a']=(a[c.reason||'n/a']||0)+1,a),{}),
        progressLeader=cars.slice().sort((a,b)=>b.progressM-a.progressM||engine.compareAgents(a,b))[0],
        safeCount=cars.filter(c=>c.safe).length;
      results.push({generation:h.generation,ticks,wallSeconds:(performance.now()-started)/1000,bestProgressM:h.bestProgress/ppm,
        meanProgressM:h.meanProgress/ppm,maxLaps:h.maxLaps,noLapCount:h.noLapCount,reasons,
        progressLeader:{id:progressLeader?.id,progressM:progressLeader?.progressM,reason:progressLeader?.reason,fitness:progressLeader?.fitness},
        optimizer:{...sim.optimizer.metrics()},feedback:treatment?sim.experimentalFeedbackDiagnostics||null:null,safeEpisodeCount:safeCount,
        gen64Outcomes:cars.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}))});
      terminal=null;
      if(treatment)sim.experimentalFeedbackDiagnostics=null;
      console.log('CRASH_FEEDBACK_GENERATION '+JSON.stringify({arm:label,generation:h.generation,bestProgressM:h.bestProgress/ppm,maxLaps:h.maxLaps,reasons,feedback:results.at(-1).feedback}));
    }
    sim.running=false;return {label,results,wallSeconds:(performance.now()-started)/1000};
  }
  const baseline=run('current-safe-feedback',false),treatment=run('valid-collision-feedback-only',true);
  const firstGenerationMatches=JSON.stringify(baseline.results[0].gen64Outcomes)===JSON.stringify(treatment.results[0].gen64Outcomes),
    expected=baselineEvidence.baseline.finishedCars[0].map(({id,progressM,laps,reason})=>({id,progressM,laps,reason})),
    actual=baseline.results[0].gen64Outcomes;
  const normalizeRows=rows=>rows.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}));
  if(!firstGenerationMatches||JSON.stringify(normalizeRows(expected))!==JSON.stringify(normalizeRows(actual)))throw Error('Gen64 physical results did not match the protected reference across both arms');
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;if(!saveUnchanged)throw Error('Original user save SHA-256 changed');
  const report={format:'male-cns-saved-v3-collision-learning-feedback-ab-v1',appVersion:'5.6.0',passed:true,learningSucceeded:treatment.results.some(r=>r.maxLaps>=2),
    settings:{model:'V3',circuit:'Monza',seed:stateOriginal.seed,startGeneration:stateOriginal.generation,population:stateOriginal.population,
      rewardRevision:stateOriginal.rewardRevision,naturalGenerations:3,historyReset:true},
    save:{sha256:saveSha,unchanged:saveUnchanged},method:'Matched CPU branches from the exact supplied save, with the previously approved history-only reset. Treatment changes only the per-generation EvolutionStrategy.update feedback list: valid collision outcomes are ranked by the existing physical fitness including unchanged collision/impact/no-lap penalties. Safety filters for parents, champions, hall-of-fame, safe progress frontier, and physical actions remain unchanged. No synthetic labels, route, physics or reward changes.',
    firstPhysicalGenerationMatches:firstGenerationMatches,baseline,treatment,
    comparison:{progressDeltaMeters:treatment.results.map((r,i)=>r.bestProgressM-baseline.results[i].bestProgressM),lapDelta:treatment.results.map((r,i)=>r.maxLaps-baseline.results[i].maxLaps),
      promoteTreatment:false},sourceHashes:{simulation:sha(Buffer.from(simSource)),learning:sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js')))},
    boundary:'A three-generation one-save test is only a local causal signal; a second seed, cold-start, multiple circuits, and two completed laps remain unverified.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('CRASH_FEEDBACK_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged,firstGenerationMatches,
    baseline:baseline.results.map(r=>({generation:r.generation,bestProgressM:r.bestProgressM,maxLaps:r.maxLaps,reasons:r.reasons})),
    treatment:treatment.results.map(r=>({generation:r.generation,bestProgressM:r.bestProgressM,maxLaps:r.maxLaps,reasons:r.reasons,feedback:r.feedback})),output:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
