'use strict';
// Paired same-save CPU benchmark for negative rank feedback. Unsafe episodes
// are included only in the treatment optimizer update, never in safe selection.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_NEGATIVE_RANK_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-negative-rank-feedback-ab-20261021-01'));
const generationCount=Math.max(1,Math.min(8,Number(process.env.MALECNS_NEGATIVE_RANK_GENERATIONS)||3));
const treatmentSampleFraction=Number(process.env.MALECNS_NEGATIVE_RANK_TREATMENT_SAMPLE_FRACTION)||.1;
if(treatmentSampleFraction<.1||treatmentSampleFraction>.75)throw Error('Treatment ES sample fraction must be between .1 and .75');
const simFile=path.join(root,'outputs/simulation.js'),simSource=fs.readFileSync(simFile,'utf8');
const Progress=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js'));
const compact=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function replaceExactly(text,before,after){const count=text.split(before).length-1;if(count!==1)throw Error(`Expected one source contract, got ${count}: ${before}`);return text.replace(before,after);}
function makeData(){return Legacy.tagV3(JSON.parse(JSON.stringify(compact)));}
function makeEngine(includeUnsafeFeedback){
  let text=simSource;
  if(!includeUnsafeFeedback)text=replaceExactly(text,
    'if(this.mutation>0&&!noSafeLearningCandidate)this.optimizer?.update(optimizerRanked,usesLearningOutcome?compareOptimizerAgents:undefined);',
    'if(this.mutation>0&&!noSafeLearningCandidate)this.optimizer?.update(learningRanked,usesLearningOutcome?compareLearningAgents:undefined);');
  else if(treatmentSampleFraction!==.1)text=replaceExactly(text,
    'Math.floor(this.population*.1)',`Math.floor(this.population*${treatmentSampleFraction})`);
  const m=new Module(simFile,module);m.filename=simFile;m.paths=Module._nodeModulePaths(path.dirname(simFile));
  const localRequire=m.require.bind(m);m.require=request=>request==='./neural-learning.js'?require(path.join(root,'outputs/neural-learning.js')):localRequire(request);
  m._compile(text,simFile);return m.exports;
}
function terminalRows(cars,engine,ppm){return cars.filter(c=>!c.diagnosticVehicle).map(c=>({id:c.id,progressM:c.bestProgress/ppm,laps:c.laps,
  reason:c.reason,fitness:c.fitness,safe:engine.isSafeLearningOutcome(c)})).sort((a,b)=>a.id-b.id);}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing diagnostic report');
  if(!fs.existsSync(savePath))throw Error('Exact supplied V3/Monza save is missing');
  const saveBytes=fs.readFileSync(savePath),saveSha=sha(saveBytes),decoded=await Progress.decode(saveBytes.toString('utf8'),'5.6.0');
  const sourceRun=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-brake-lock-migration-ab-20261020-01/report.json'),'utf8'));
  const stateOriginal=decoded.payload.workers[0].state;
  const validationEngine=makeEngine(false),validationSim=new validationEngine.Simulation(makeData(),{modelId:'v3',population:stateOriginal.population,circuitId:'monza',circuits});
  Progress.validatePayload(decoded.payload,{graph:validationSim.graph,circuits:validationSim.circuits});
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||stateOriginal.generation!==64||stateOriginal.seed!==7717||stateOriginal.population!==40||stateOriginal.rewardRevision!=='progress-3')
    throw Error('The supplied save does not match the verified V3/Monza generation-64 identity');
  validationSim.running=false;
  function run(label,includeUnsafeFeedback){
    const engine=makeEngine(includeUnsafeFeedback),state=structuredClone(stateOriginal),sim=new engine.Simulation(makeData(),{modelId:'v3',population:state.population,circuitId:'monza',circuits});
    state.history=[];Progress.restore(sim,state);sim.running=true;
    const generations=[],started=performance.now();let terminal=null,lastLog=performance.now();
    sim.onTrialTick=s=>{
      if(s.cars.every(c=>!c.alive))terminal=terminalRows(s.cars,engine,s.track.pixelsPerMeter||1);
      if(performance.now()-lastLog>25000){lastLog=performance.now();console.log('NEGATIVE_RANK_PROGRESS '+JSON.stringify({arm:label,generation:s.generation,alive:s.cars.filter(c=>c.alive).length,bestM:Math.max(...s.cars.map(c=>c.bestProgress))/(s.track.pixelsPerMeter||1)}));}
    };
    for(let i=0;i<generationCount;i++){
      const generation=sim.generation,meanBefore=sim.optimizer.mean.slice();let ticks=0;
      while(sim.generation===generation&&ticks<60000){sim.tick();ticks++;}
      if(sim.generation===generation||!terminal)throw Error(`${label}: generation ${generation} did not end naturally with terminal outcomes`);
      const ppm=sim.track.pixelsPerMeter||1,h=sim.history.at(-1),cars=terminal,reasons=cars.reduce((a,c)=>(a[c.reason||'n/a']=(a[c.reason||'n/a']||0)+1,a),{});
      const safe=cars.filter(c=>c.safe),safeLeader=safe.slice().sort((a,b)=>b.progressM-a.progressM)[0],rawLeader=cars.slice().sort((a,b)=>b.progressM-a.progressM)[0];
      const meanRms=Math.sqrt(sim.optimizer.mean.reduce((sum,v,j)=>sum+(v-meanBefore[j])**2,0)/sim.optimizer.mean.length);
      generations.push({generation:h.generation,ticks,wallSeconds:(performance.now()-started)/1000,bestProgressM:h.bestProgress/ppm,
        meanProgressM:h.meanProgress/ppm,maxLaps:h.maxLaps,noLapCount:h.noLapCount,reasons,safeEpisodeCount:safe.length,
        safeLeader:safeLeader?{id:safeLeader.id,progressM:safeLeader.progressM,reason:safeLeader.reason}:null,
        rawLeader:{id:rawLeader?.id,progressM:rawLeader?.progressM,reason:rawLeader?.reason},
        optimizer:{...sim.optimizer.metrics(),meanRmsDelta:meanRms,sampledPolicies:sim.lastOptimizerSampleCount||0},
        nextPopulationSha256:sha(Buffer.from(JSON.stringify(sim.cars.map(c=>c.genome.policyWeights)))),
        optimizerMeanSha256:sha(Buffer.from(JSON.stringify(sim.optimizer.mean))),terminal:cars});
      terminal=null;console.log('NEGATIVE_RANK_GENERATION '+JSON.stringify({arm:label,generation:h.generation,bestProgressM:h.bestProgress/ppm,maxLaps:h.maxLaps,reasons,safeEpisodes:safe.length,meanRmsDelta:meanRms}));
    }
    sim.running=false;return {label,generations,wallSeconds:(performance.now()-started)/1000};
  }
  const baseline=run('safe-only-feedback',false),treatment=run('safe-positive-crash-negative',true);
  const baselineFirst=baseline.generations[0].terminal.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}));
  const treatmentFirst=treatment.generations[0].terminal.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}));
  const expected=sourceRun.baseline.finishedCars[0].map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}));
  const firstGenerationMatches=JSON.stringify(baselineFirst)===JSON.stringify(treatmentFirst),historicalReferenceMatches=JSON.stringify(baselineFirst)===JSON.stringify(expected);
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;if(!saveUnchanged)throw Error('Original user save SHA-256 changed');
  const report={format:'male-cns-saved-v3-negative-rank-feedback-ab-v1',appVersion:'5.6.0',passed:firstGenerationMatches&&saveUnchanged,
    learningSucceeded:treatment.generations.some(r=>r.maxLaps>=2),settings:{model:'V3',circuit:'Monza',seed:stateOriginal.seed,startGeneration:stateOriginal.generation,
      population:stateOriginal.population,naturalGenerations:generationCount,baselineEsSampleFraction:.1,treatmentEsSampleFraction:treatmentSampleFraction,historyReset:true},save:{sha256:saveSha,unchanged:saveUnchanged},firstPhysicalGenerationMatches:firstGenerationMatches,historicalPreFixReferenceMatches:historicalReferenceMatches,
    method:`Paired in-memory branches from the exact supplied save. Both arms use the same negative-rank EvolutionStrategy and unchanged rewards/physics. Baseline sends safe outcomes only to the optimizer and reserves a 10% ES sample fraction; treatment also ranks crash/off-track outcomes as the negative tail and reserves ${Math.round(treatmentSampleFraction*100)}% ES samples. Safe-only parent, champion, archive, practice and progress-frontier paths are identical. No route or teacher.`,
    baseline,treatment,comparison:{safeProgressDeltaMeters:treatment.generations.map((r,i)=>(r.safeLeader?.progressM??0)-(baseline.generations[i].safeLeader?.progressM??0)),lapDelta:treatment.generations.map((r,i)=>r.maxLaps-baseline.generations[i].maxLaps),promoteTreatment:false},
    sourceHashes:{simulation:sha(Buffer.from(simSource)),learning:sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js')))},
    boundary:`${generationCount} generations from one seed are a diagnostic, not a general learning claim. No lap completion, second seed, circuit generalization, native package, app version, release or save migration is implied.`};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('NEGATIVE_RANK_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged,
    firstGenerationMatches,historicalReferenceMatches,nextPopulationsIdentical:baseline.generations.every((r,i)=>r.nextPopulationSha256===treatment.generations[i]?.nextPopulationSha256),
    baseline:baseline.generations.map(r=>({generation:r.generation,safeM:r.safeLeader?.progressM,laps:r.maxLaps,samples:r.optimizer.sampledPolicies,nextPopulationSha256:r.nextPopulationSha256})),
    treatment:treatment.generations.map(r=>({generation:r.generation,safeM:r.safeLeader?.progressM,laps:r.maxLaps,samples:r.optimizer.sampledPolicies,nextPopulationSha256:r.nextPopulationSha256})),comparison:report.comparison,output:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
