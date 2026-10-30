'use strict';
// Single-arm follow-up to the verified safe-frontier control: steering-only
// bounded mutations of a valid high-progress crash policy. In-memory only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_UNSAFE_STEERING_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-unsafe-frontier-steering-ab-20261020-01')),
  simFile=path.join(root,'outputs/simulation.js'),learningFile=path.join(root,'outputs/neural-learning.js'),simSource=fs.readFileSync(simFile,'utf8'),learningSource=fs.readFileSync(learningFile,'utf8'),
  Progress=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js')),
  compact=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),circuits=require(path.join(root,'outputs/data/circuits.json')),
  F=require(path.join(root,'outputs/simulation.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function replaceExactly(text,before,after){const n=text.split(before).length-1;if(n!==1)throw Error(`Expected one source contract, found ${n}: ${before}`);return text.replace(before,after);}
function makeLearning(){
  let text=replaceExactly(learningSource,'function safeMotorMutation(graph,values,r,amount,experience){','function safeMotorMutation(graph,values,r,amount,experience,focusMode=null){');
  text=replaceExactly(text,'const roll=r(),actions=roll<.35?[0]:roll<.7?[1]:[0,1],child=values.slice();',
    `const roll=r(),actions=focusMode==='steering'?[0]:roll<.35?[0]:roll<.7?[1]:[0,1],child=values.slice();`);
  const m=new Module(learningFile,module);m.filename=learningFile;m.paths=Module._nodeModulePaths(path.dirname(learningFile));m._compile(text,learningFile);return m.exports;
}
function makeEngine(){
  let text=simSource;
  text=replaceExactly(text,'const frontierParent=progressExplorer||(stagnantFrontier?safeProgressLeader:null);',
    `const unsafeProgressFrontier=Boolean(this.experimentalUnsafeProgressFrontier&&progressLeader&&!isSafeLearningOutcome(progressLeader)&&
      !progressLeader.censored&&!progressLeader.overlap&&String(progressLeader.reason||'').trim().toLowerCase()==='urto'&&
      !(Number(progressLeader.rewardBreakdown?.penalties?.invalid)>0)&&
      progressLeader.bestProgress>(safeProgressLeader?.bestProgress??0)+(this.track.pixelsPerMeter||1));
      const frontierParent=unsafeProgressFrontier?progressLeader:progressExplorer||(stagnantFrontier?safeProgressLeader:null);`);
  text=replaceExactly(text,'frontierParent.brain.policyExperience);',"frontierParent.brain.policyExperience,unsafeProgressFrontier?'steering':null);");
  const learning=makeLearning(),m=new Module(simFile,module);m.filename=simFile;m.paths=Module._nodeModulePaths(path.dirname(simFile));
  const localRequire=m.require.bind(m);m.require=request=>request==='./neural-learning.js'?learning:localRequire(request);
  m._compile(text,simFile);return {Simulation:m.exports.Simulation,isSafeLearningOutcome:m.exports.isSafeLearningOutcome};
}
function summarize(cars,ppm){return cars.filter(c=>!c.diagnosticVehicle).map(c=>({id:c.id,progressM:c.bestProgress/ppm,laps:c.laps,reason:c.reason,fitness:c.fitness,safe:F.isSafeLearningOutcome(c)})).sort((a,b)=>a.id-b.id);}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing steering-frontier report');
  const bytes=fs.readFileSync(savePath),saveSha=sha(bytes),decoded=await Progress.decode(bytes.toString('utf8'),'5.6.0'),stateOriginal=decoded.payload.workers[0].state,
    controlReport=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-brake-lock-migration-ab-20261020-01/report.json'),'utf8')),
    sourceHashes={simulation:sha(Buffer.from(simSource)),learning:sha(Buffer.from(learningSource))};
  const baseHashes=controlReport.baseline.history.length?controlReport.baseline.sourceHashes:null;
  if(!baseHashes||baseHashes['simulation.js']!==sourceHashes.simulation||baseHashes['neural-learning.js']!==sourceHashes.learning)throw Error('The saved deterministic control was made with different app sources');
  const engine=makeEngine(),data=Legacy.tagV3(JSON.parse(JSON.stringify(compact))),descriptor=new engine.Simulation(data,{modelId:'v3',population:stateOriginal.population,circuitId:'monza',circuits});
  Progress.validatePayload(decoded.payload,{graph:descriptor.graph,circuits:descriptor.circuits});descriptor.running=false;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||stateOriginal.generation!==64||stateOriginal.seed!==7717||stateOriginal.population!==40||stateOriginal.rewardRevision!=='progress-3')
    throw Error('The exact supplied V3/Monza generation-64 checkpoint was not selected');
  const state=structuredClone(stateOriginal);state.history=[];
  const sim=new engine.Simulation(Legacy.tagV3(JSON.parse(JSON.stringify(compact))),{modelId:'v3',population:state.population,circuitId:'monza',circuits});
  Progress.restore(sim,state);sim.running=true;sim.experimentalUnsafeProgressFrontier=true;
  const results=[],started=performance.now();let terminal=null,lastLog=performance.now();
  sim.onTrialTick=s=>{
    if(s.cars.every(c=>!c.alive))terminal=summarize(s.cars,s.track.pixelsPerMeter||1);
    if(performance.now()-lastLog>25000){lastLog=performance.now();console.log('UNSAFE_STEERING_PROGRESS '+JSON.stringify({generation:s.generation,alive:s.cars.filter(c=>c.alive).length,bestM:Math.max(...s.cars.map(c=>c.bestProgress))/(s.track.pixelsPerMeter||1)}));}
  };
  for(let i=0;i<3;i++){
    const generation=sim.generation;let ticks=0;
    while(sim.generation===generation&&ticks<60000){sim.tick();ticks++;}
    if(sim.generation===generation||!terminal)throw Error(`Generation ${generation} did not finish naturally`);
    const ppm=sim.track.pixelsPerMeter||1,h=sim.history.at(-1),all=terminal.slice().sort((a,b)=>b.progressM-a.progressM),safe=terminal.filter(c=>c.safe).sort((a,b)=>b.progressM-a.progressM),
      parentId=sim.lastFrontierDiagnostics?.frontierParentId??null,parentOutcome=terminal.find(c=>c.id===parentId)||null;
    results.push({generation:h.generation,ticks,wallSeconds:(performance.now()-started)/1000,bestProgressM:h.bestProgress/ppm,meanProgressM:h.meanProgress/ppm,maxLaps:h.maxLaps,
      reasons:terminal.reduce((a,c)=>(a[c.reason||'n/a']=(a[c.reason||'n/a']||0)+1,a),{}),overallLeader:all[0],safeProgressLeader:safe[0]||null,
      frontier:{parentId,parentReason:parentOutcome?.reason??null,parentProgressM:parentOutcome?.progressM??null,offspring:sim.lastFrontierDiagnostics?.frontierOffspringCount??0,
        selectedFromUnsafeProgressFrontier:Boolean(parentOutcome&&!parentOutcome.safe)},gen64Outcomes:terminal.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}))});
    terminal=null;
    console.log('UNSAFE_STEERING_GENERATION '+JSON.stringify({generation:h.generation,bestProgressM:h.bestProgress/ppm,maxLaps:h.maxLaps,overallLeader:all[0],safeProgressLeader:safe[0]||null,frontier:results.at(-1).frontier}));
  }
  const priorGen64=controlReport.baseline.finishedCars[0].map(({id,progressM,laps,reason})=>({id,progressM,laps,reason})),
    firstGenerationMatches=JSON.stringify(priorGen64)===JSON.stringify(results[0].gen64Outcomes);
  if(!firstGenerationMatches)throw Error('The first physical generation differs from the saved deterministic control');
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;if(!saveUnchanged)throw Error('Original user save checksum changed');
  const reference=controlReport.baseline.history.slice(0,3).map(h=>({generation:h.generation,bestProgressM:h.bestProgressM,maxLaps:h.maxLaps}));
  const report={format:'male-cns-saved-v3-unsafe-frontier-steering-ab-v1',appVersion:'5.6.0',passed:true,learningSucceeded:results.some(r=>r.maxLaps>=2),
    save:{sha256:saveSha,unchanged:saveUnchanged},settings:{model:'V3',circuit:'Monza',seed:stateOriginal.seed,startGeneration:stateOriginal.generation,population:stateOriginal.population,
      rewardRevision:stateOriginal.rewardRevision,naturalGenerations:3,historyReset:true},sourceHashes,
    method:'Single treatment replay from the exact saved checkpoint. Compared with the source-hash-matched three-generation current control, the only in-memory changes route a valid collision progress leader into the existing exploration mutation lineage and constrain those offspring mutations to the steering readout. Physics, full reward including impact penalties, optimizer ranking, safe parent selection, champion, archive, sensors and neural actions are unchanged.',
    firstPhysicalGenerationMatches:firstGenerationMatches,baselineReference:reference,treatment:{label:'unsafe progress frontier with steering-only mutations',results},
    comparison:{progressDeltaMeters:results.map((r,i)=>r.bestProgressM-reference[i].bestProgressM),lapDelta:results.map((r,i)=>r.maxLaps-reference[i].maxLaps),
      steeringFrontierUsed:results.map(r=>r.frontier.selectedFromUnsafeProgressFrontier),promoteTreatment:false},
    boundary:'This deterministic one-save follow-up can identify a local signal only. A full lap, second seed, cold-start and additional circuits remain unverified. No app source, save, version, release or trained model is changed.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('UNSAFE_STEERING_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged,firstGenerationMatches,
    baselineReference:reference,treatment:results.map(r=>({generation:r.generation,bestProgressM:r.bestProgressM,maxLaps:r.maxLaps,frontier:r.frontier})),output:path.join(out,'report.json')}));
  sim.running=false;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
