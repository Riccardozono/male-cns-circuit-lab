'use strict';
// Matched in-memory V3/Monza test. Treatment mutates only a valid, higher-
// progress collision policy as an exploration lineage; it never becomes a
// selected parent, champion, archive entry, or trusted safe frontier.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_UNSAFE_FRONTIER_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-unsafe-progress-frontier-ab-20261020-01'));
const simFile=path.join(root,'outputs/simulation.js'),simSource=fs.readFileSync(simFile,'utf8'),Progress=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),compact=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),
  circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function replaceExactly(text,before,after){const count=text.split(before).length-1;if(count!==1)throw Error(`Expected one source contract, got ${count}: ${before}`);return text.replace(before,after);}
function makeData(){return Legacy.tagV3(JSON.parse(JSON.stringify(compact)));}
function makeEngine(treatment){
  let text=simSource;
  if(treatment)text=replaceExactly(text,'const frontierParent=progressExplorer||(stagnantFrontier?safeProgressLeader:null);',
    `const unsafeProgressFrontier=Boolean(this.experimentalUnsafeProgressFrontier&&progressLeader&&!isSafeLearningOutcome(progressLeader)&&
      !progressLeader.censored&&!progressLeader.overlap&&String(progressLeader.reason||'').trim().toLowerCase()==='urto'&&
      !(Number(progressLeader.rewardBreakdown?.penalties?.invalid)>0)&&
      progressLeader.bestProgress>(safeProgressLeader?.bestProgress??0)+(this.track.pixelsPerMeter||1));
      const frontierParent=unsafeProgressFrontier?progressLeader:progressExplorer||(stagnantFrontier?safeProgressLeader:null);`);
  const m=new Module(simFile,module);m.filename=simFile;m.paths=Module._nodeModulePaths(path.dirname(simFile));
  const localRequire=m.require.bind(m);m.require=request=>request==='./neural-learning.js'?require(path.join(root,'outputs/neural-learning.js')):localRequire(request);
  m._compile(text,simFile);return {Simulation:m.exports.Simulation,compareAgents:m.exports.compareAgents,isSafeLearningOutcome:m.exports.isSafeLearningOutcome};
}
function summarize(cars,ppm){return cars.filter(c=>!c.diagnosticVehicle).map(c=>({id:c.id,progressM:c.bestProgress/ppm,laps:c.laps,reason:c.reason,fitness:c.fitness,safe:F.isSafeLearningOutcome(c)})).sort((a,b)=>a.id-b.id);}
const F=require(path.join(root,'outputs/simulation.js'));
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing A/B report');
  const bytes=fs.readFileSync(savePath),saveSha=sha(bytes),decoded=await Progress.decode(bytes.toString('utf8'),'5.6.0'),stateOriginal=decoded.payload.workers[0].state,
    prior=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-brake-lock-migration-ab-20261020-01/report.json'),'utf8'));
  const baseEngine=makeEngine(false),descriptor=new baseEngine.Simulation(makeData(),{modelId:'v3',population:stateOriginal.population,circuitId:'monza',circuits});
  Progress.validatePayload(decoded.payload,{graph:descriptor.graph,circuits:descriptor.circuits});descriptor.running=false;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||stateOriginal.generation!==64||stateOriginal.seed!==7717||stateOriginal.population!==40||stateOriginal.rewardRevision!=='progress-3')
    throw Error('The exact supplied V3/Monza generation-64 save was not selected');
  function run(label,treatment){
    const engine=makeEngine(treatment),state=structuredClone(stateOriginal),sim=new engine.Simulation(makeData(),{modelId:'v3',population:state.population,circuitId:'monza',circuits});
    state.history=[];Progress.restore(sim,state);sim.running=true;if(treatment)sim.experimentalUnsafeProgressFrontier=true;
    const results=[],started=performance.now();let terminal=null,lastLog=performance.now();
    sim.onTrialTick=s=>{
      if(s.cars.every(c=>!c.alive))terminal=summarize(s.cars,s.track.pixelsPerMeter||1);
      if(performance.now()-lastLog>25000){lastLog=performance.now();console.log('UNSAFE_FRONTIER_PROGRESS '+JSON.stringify({arm:label,generation:s.generation,alive:s.cars.filter(c=>c.alive).length,bestM:Math.max(...s.cars.map(c=>c.bestProgress))/(s.track.pixelsPerMeter||1)}));}
    };
    for(let i=0;i<3;i++){
      const generation=sim.generation;let ticks=0;
      while(sim.generation===generation&&ticks<60000){sim.tick();ticks++;}
      if(sim.generation===generation||!terminal)throw Error(`${label}: generation ${generation} did not finish naturally`);
      const ppm=sim.track.pixelsPerMeter||1,h=sim.history.at(-1),all=terminal.slice().sort((a,b)=>b.progressM-a.progressM),safe=terminal.filter(c=>c.safe).sort((a,b)=>b.progressM-a.progressM),
        parentId=sim.lastFrontierDiagnostics?.frontierParentId??null,parentOutcome=terminal.find(c=>c.id===parentId)||null;
      results.push({generation:h.generation,ticks,wallSeconds:(performance.now()-started)/1000,bestProgressM:h.bestProgress/ppm,meanProgressM:h.meanProgress/ppm,maxLaps:h.maxLaps,
        reasons:terminal.reduce((a,c)=>(a[c.reason||'n/a']=(a[c.reason||'n/a']||0)+1,a),{}),overallLeader:all[0],safeProgressLeader:safe[0]||null,
        frontier:{parentId,parentReason:parentOutcome?.reason??null,parentProgressM:parentOutcome?.progressM??null,offspring:sim.lastFrontierDiagnostics?.frontierOffspringCount??0,
          selectedFromUnsafeProgressFrontier:Boolean(treatment&&parentOutcome&&!parentOutcome.safe)},
        gen64Outcomes:terminal.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}))});
      terminal=null;
      console.log('UNSAFE_FRONTIER_GENERATION '+JSON.stringify({arm:label,generation:h.generation,bestProgressM:h.bestProgress/ppm,maxLaps:h.maxLaps,
        overallLeader:all[0],safeProgressLeader:safe[0]||null,frontier:results.at(-1).frontier}));
    }
    sim.running=false;return {label,results,wallSeconds:(performance.now()-started)/1000};
  }
  const baseline=run('current-safe-frontier',false),treatment=run('unsafe-progress-mutation-lineage',true),
    firstGenerationMatches=JSON.stringify(baseline.results[0].gen64Outcomes)===JSON.stringify(treatment.results[0].gen64Outcomes),
    priorGen64=prior.baseline.finishedCars[0].map(({id,progressM,laps,reason})=>({id,progressM,laps,reason})),actualGen64=baseline.results[0].gen64Outcomes;
  if(!firstGenerationMatches||JSON.stringify(priorGen64)!==JSON.stringify(actualGen64))throw Error('Physical generation 64 failed deterministic comparison');
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;if(!saveUnchanged)throw Error('Original user save checksum changed');
  const report={format:'male-cns-saved-v3-unsafe-progress-frontier-ab-v1',appVersion:'5.6.0',passed:true,learningSucceeded:treatment.results.some(r=>r.maxLaps>=2),
    save:{sha256:saveSha,unchanged:saveUnchanged},settings:{model:'V3',circuit:'Monza',seed:stateOriginal.seed,startGeneration:stateOriginal.generation,population:stateOriginal.population,
      rewardRevision:stateOriginal.rewardRevision,naturalGenerations:3,historyReset:true},
    method:'Matched in-memory copies from the exact supplied save. Treatment changes only the exploration mutation parent when the raw progress leader is a valid collision outcome and exceeds the safe progress leader by more than one metre. The collided genotype supplies the existing bounded random motor mutations only. It is not admitted to selectionWinner, ordinary parent pool, champion, archive, or safe frontier; collision penalties and all physics remain unchanged.',
    firstPhysicalGenerationMatches:firstGenerationMatches,baseline,treatment,
    comparison:{progressDeltaMeters:treatment.results.map((r,i)=>r.bestProgressM-baseline.results[i].bestProgressM),lapDelta:treatment.results.map((r,i)=>r.maxLaps-baseline.results[i].maxLaps),
      unsafeMutationLineage:treatment.results.map(r=>r.frontier.selectedFromUnsafeProgressFrontier),promoteTreatment:false},
    sourceHashes:{simulation:sha(Buffer.from(simSource)),learning:sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js')))},
    boundary:'This three-generation one-save experiment is local evidence only. It does not validate two completed laps, other seeds, cold starts, or other circuits. No app source, save, version, release, or trained model is changed.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('UNSAFE_FRONTIER_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged,firstGenerationMatches,
    baseline:baseline.results.map(r=>({generation:r.generation,bestProgressM:r.bestProgressM,maxLaps:r.maxLaps,frontier:r.frontier})),
    treatment:treatment.results.map(r=>({generation:r.generation,bestProgressM:r.bestProgressM,maxLaps:r.maxLaps,frontier:r.frontier})),output:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
