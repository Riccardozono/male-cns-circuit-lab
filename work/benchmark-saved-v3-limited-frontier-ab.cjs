'use strict';
// In-memory V3/Monza follow-up: 10% mutation-only offspring from a valid
// higher-progress collision frontier, with normal safe parents/champions kept.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_LIMITED_FRONTIER_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-limited-frontier-ab-20261020-01')),
  simFile=path.join(root,'outputs/simulation.js'),simSource=fs.readFileSync(simFile,'utf8'),Progress=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),compact=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),
  circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function replaceExactly(text,before,after){const n=text.split(before).length-1;if(n!==1)throw Error(`Expected one source contract, found ${n}: ${before}`);return text.replace(before,after);}
function makeData(){return Legacy.tagV3(JSON.parse(JSON.stringify(compact)));}
function makeEngine(){
  let text=replaceExactly(simSource,'const frontierParent=progressExplorer||(stagnantFrontier?safeProgressLeader:null);',
    `const unsafeProgressFrontier=Boolean(this.experimentalLimitedUnsafeFrontier&&progressLeader&&!isSafeLearningOutcome(progressLeader)&&
      !progressLeader.censored&&!progressLeader.overlap&&String(progressLeader.reason||'').trim().toLowerCase()==='urto'&&
      !(Number(progressLeader.rewardBreakdown?.penalties?.invalid)>0)&&
      progressLeader.bestProgress>(safeProgressLeader?.bestProgress??0)+(this.track.pixelsPerMeter||1));
      const frontierParent=unsafeProgressFrontier?progressLeader:progressExplorer||(stagnantFrontier?safeProgressLeader:null);`);
  text=replaceExactly(text,'const frontierOffspringRate=stagnantFrontier\n        ?this.stagnation>=EVOLUTION_RULES.prolongedStagnationWindow\n          ?EVOLUTION_RULES.prolongedStagnantFrontierOffspringRate\n          :EVOLUTION_RULES.stagnantFrontierOffspringRate\n        :EVOLUTION_RULES.frontierOffspringRate;',
    `const frontierOffspringRate=unsafeProgressFrontier?0.1:stagnantFrontier
        ?this.stagnation>=EVOLUTION_RULES.prolongedStagnationWindow
          ?EVOLUTION_RULES.prolongedStagnantFrontierOffspringRate
          :EVOLUTION_RULES.stagnantFrontierOffspringRate
        :EVOLUTION_RULES.frontierOffspringRate;`);
  const m=new Module(simFile,module);m.filename=simFile;m.paths=Module._nodeModulePaths(path.dirname(simFile));
  const localRequire=m.require.bind(m);m.require=request=>request==='./neural-learning.js'?require(path.join(root,'outputs/neural-learning.js')):localRequire(request);
  m._compile(text,simFile);return {Simulation:m.exports.Simulation,isSafeLearningOutcome:m.exports.isSafeLearningOutcome};
}
function summarize(cars,ppm,engine){return cars.filter(c=>!c.diagnosticVehicle).map(c=>({id:c.id,progressM:c.bestProgress/ppm,laps:c.laps,reason:c.reason,fitness:c.fitness,safe:engine.isSafeLearningOutcome(c)})).sort((a,b)=>a.id-b.id);}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing report');
  const bytes=fs.readFileSync(savePath),saveSha=sha(bytes),decoded=await Progress.decode(bytes.toString('utf8'),'5.6.0'),stateOriginal=decoded.payload.workers[0].state,
    control=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-brake-lock-migration-ab-20261020-01/report.json'),'utf8')),
    sourceHashes={simulation:sha(Buffer.from(simSource)),learning:sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js')))},base=control.baseline.sourceHashes;
  if(base['simulation.js']!==sourceHashes.simulation||base['neural-learning.js']!==sourceHashes.learning)throw Error('Matched baseline was produced from different app sources');
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||stateOriginal.generation!==64||stateOriginal.seed!==7717||stateOriginal.population!==40||stateOriginal.rewardRevision!=='progress-3')
    throw Error('The exact supplied V3/Monza generation-64 checkpoint was not selected');
  const engine=makeEngine(),state=structuredClone(stateOriginal);state.history=[];
  const sim=new engine.Simulation(makeData(),{modelId:'v3',population:state.population,circuitId:'monza',circuits});
  Progress.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});Progress.restore(sim,state);sim.running=true;sim.experimentalLimitedUnsafeFrontier=true;
  const results=[],started=performance.now();let terminal=null,lastLog=performance.now();
  sim.onTrialTick=s=>{
    if(s.cars.every(c=>!c.alive))terminal=summarize(s.cars,s.track.pixelsPerMeter||1,engine);
    if(performance.now()-lastLog>25000){lastLog=performance.now();console.log('LIMITED_FRONTIER_PROGRESS '+JSON.stringify({generation:s.generation,alive:s.cars.filter(c=>c.alive).length,bestM:Math.max(...s.cars.map(c=>c.bestProgress))/(s.track.pixelsPerMeter||1)}));}
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
        unsafeFrontierUsed:Boolean(parentOutcome&&!parentOutcome.safe)},gen64Outcomes:terminal.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}))});
    terminal=null;
    console.log('LIMITED_FRONTIER_GENERATION '+JSON.stringify({generation:h.generation,bestProgressM:h.bestProgress/ppm,maxLaps:h.maxLaps,overallLeader:all[0],safeProgressLeader:safe[0]||null,frontier:results.at(-1).frontier}));
  }
  const reference=control.baseline.history.slice(0,3).map(h=>({generation:h.generation,bestProgressM:h.bestProgressM,maxLaps:h.maxLaps})),
    firstGenerationMatches=JSON.stringify(control.baseline.finishedCars[0].map(({id,progressM,laps,reason})=>({id,progressM,laps,reason})))===JSON.stringify(results[0].gen64Outcomes);
  if(!firstGenerationMatches)throw Error('Initial physical generation did not match the verified baseline');
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;if(!saveUnchanged)throw Error('Original user save checksum changed');
  const report={format:'male-cns-saved-v3-limited-unsafe-frontier-ab-v1',appVersion:'5.6.0',passed:true,learningSucceeded:results.some(r=>r.maxLaps>=2),
    save:{sha256:saveSha,unchanged:saveUnchanged},settings:{model:'V3',circuit:'Monza',seed:stateOriginal.seed,startGeneration:stateOriginal.generation,population:stateOriginal.population,
      rewardRevision:stateOriginal.rewardRevision,naturalGenerations:3,historyReset:true,unsafeFrontierRate:.1},sourceHashes,
    method:'Matched to the deterministic current safe-frontier control with identical app source hashes. Treatment changes only the offspring rate for a valid higher-progress collision mutation lineage to 10% (four of 40 agents). Champion, selectionWinner, regular parents, optimizer feedback, hall of fame, safe frontier, reward penalties, sensors and physics remain unchanged.',
    baselineReference:reference,firstPhysicalGenerationMatches:firstGenerationMatches,treatment:{label:'limited collision frontier, 4 mutations/generation',results},
    comparison:{progressDeltaMeters:results.map((r,i)=>r.bestProgressM-reference[i].bestProgressM),lapDelta:results.map((r,i)=>r.maxLaps-reference[i].maxLaps),
      frontierUsed:results.map(r=>r.frontier.unsafeFrontierUsed),offspring:results.map(r=>r.frontier.offspring),promoteTreatment:false},
    boundary:'A three-generation test from one saved V3 seed is local evidence only. It does not prove a full lap or generalization. No app source, user save, version, release, champion or weights were changed.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('LIMITED_FRONTIER_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged,firstGenerationMatches,baselineReference:reference,
    treatment:results.map(r=>({generation:r.generation,bestProgressM:r.bestProgressM,maxLaps:r.maxLaps,safeProgressLeader:r.safeProgressLeader?.progressM,frontier:r.frontier})),output:path.join(out,'report.json')}));
  sim.running=false;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
