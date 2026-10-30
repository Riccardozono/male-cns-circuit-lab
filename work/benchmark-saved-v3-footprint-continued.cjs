'use strict';
// Six-generation continuation from the supplied V3 save using the V3-only
// footprint-clearance sensors now present in the local app source.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_FOOTPRINT_CONTINUED_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-continued-20261020-01')),
  simFile=path.join(root,'outputs/simulation.js'),Progress=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),compact=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),
  circuits=require(path.join(root,'outputs/data/circuits.json')),
  Simulation=require(simFile).Simulation;
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function makeData(){return Legacy.tagV3(JSON.parse(JSON.stringify(compact)));}
function safe(c){return !new Set(['urto','fuori pista','progresso non valido','collision','off track','invalid progress']).has(String(c.reason||'').toLowerCase());}
function summarize(cars,ppm){return cars.filter(c=>!c.diagnosticVehicle).map(c=>({id:c.id,progressM:c.bestProgress/ppm,laps:c.laps,reason:c.reason,fitness:c.fitness,
  safe:!c.censored&&!c.overlap&&!['urto','fuori pista','progresso non valido','collision','off track','invalid progress'].includes(String(c.reason||'').toLowerCase())&&
    !(Number(c.rewardBreakdown?.penalties?.collision)>0)&&!(Number(c.rewardBreakdown?.penalties?.offTrack)>0)&&!(Number(c.rewardBreakdown?.penalties?.invalid)>0)})).sort((a,b)=>a.id-b.id);}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing report');
  const bytes=fs.readFileSync(savePath),saveSha=sha(bytes),decoded=await Progress.decode(bytes.toString('utf8'),'5.6.0'),stateOriginal=decoded.payload.workers[0].state,
    prior=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-clearance-ab-20261020-01/report.json'),'utf8')),
    sourceHashes={simulation:sha(fs.readFileSync(simFile)),learning:sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js')))};
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||stateOriginal.generation!==64||stateOriginal.seed!==7717||stateOriginal.population!==40||stateOriginal.rewardRevision!=='progress-3')
    throw Error('The exact supplied V3/Monza generation-64 checkpoint was not selected');
  const state=structuredClone(stateOriginal);state.history=[];
  const sim=new Simulation(makeData(),{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  Progress.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});Progress.restore(sim,state);sim.running=true;
  if(!sim.cars.every(c=>c.footprintSensorsEnabled===true))throw Error('V3 footprint sensor migration did not activate for every car');
  const results=[],started=performance.now();let terminal=null,lastLog=performance.now();
  sim.onTrialTick=s=>{
    if(s.cars.every(c=>!c.alive))terminal=summarize(s.cars,s.track.pixelsPerMeter||1);
    if(performance.now()-lastLog>25000){lastLog=performance.now();console.log('FOOTPRINT_CONTINUED_PROGRESS '+JSON.stringify({generation:s.generation,alive:s.cars.filter(c=>c.alive).length,bestM:Math.max(...s.cars.map(c=>c.bestProgress))/(s.track.pixelsPerMeter||1)}));}
  };
  for(let i=0;i<6;i++){
    const generation=sim.generation;let ticks=0;
    while(sim.generation===generation&&ticks<60000){sim.tick();ticks++;}
    if(sim.generation===generation||!terminal)throw Error(`Generation ${generation} did not finish naturally`);
    const ppm=sim.track.pixelsPerMeter||1,h=sim.history.at(-1),all=terminal.slice().sort((a,b)=>b.progressM-a.progressM),safeCars=terminal.filter(c=>c.safe).sort((a,b)=>b.progressM-a.progressM);
    results.push({generation:h.generation,ticks,wallSeconds:(performance.now()-started)/1000,bestProgressM:h.bestProgress/ppm,meanProgressM:h.meanProgress/ppm,maxLaps:h.maxLaps,
      reasons:terminal.reduce((a,c)=>(a[c.reason||'n/a']=(a[c.reason||'n/a']||0)+1,a),{}),overallLeader:all[0],safeProgressLeader:safeCars[0]||null,
      outcomes:terminal.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}))});
    terminal=null;console.log('FOOTPRINT_CONTINUED_GENERATION '+JSON.stringify({generation:h.generation,bestProgressM:h.bestProgress/ppm,maxLaps:h.maxLaps,
      overallLeader:all[0],safeProgressLeader:safeCars[0]||null}));
  }
  const firstThreeReproduced=results.slice(0,3).every((r,i)=>JSON.stringify(r.outcomes)===JSON.stringify(prior.treatment.results[i].gen64Outcomes));
  if(!firstThreeReproduced)throw Error('The live V3-only implementation did not reproduce the first three in-memory candidate generations');
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;if(!saveUnchanged)throw Error('Original user save checksum changed');
  const report={format:'male-cns-saved-v3-footprint-continued-v1',appVersion:'5.6.0',passed:true,learningSucceeded:results.some(r=>r.maxLaps>=2),
    save:{sha256:saveSha,unchanged:saveUnchanged},settings:{model:'V3',circuit:'Monza',seed:stateOriginal.seed,startGeneration:stateOriginal.generation,population:stateOriginal.population,
      rewardRevision:stateOriginal.rewardRevision,naturalGenerations:6,historyReset:true,v3FootprintSensorsEnabled:true},sourceHashes,
    firstThreeReproduced,priorThreeGenerationEvidence:prior.treatment.results.map(r=>({generation:r.generation,bestProgressM:r.bestProgressM,maxLaps:r.maxLaps,safeProgressM:r.safeProgressLeader?.progressM??null})),
    treatment:{label:'local V3 body-footprint clearance sensor implementation',results},
    boundary:'Six natural generations from one saved V3 seed are local evidence only. They do not prove full laps or generalization across seeds/tracks/models. No user save, version, release, tag, portable or installer was changed.',
    comparison:{progressBeyondPriorExperiment:results.slice(3).map(r=>({generation:r.generation,bestProgressM:r.bestProgressM,maxLaps:r.maxLaps,safeProgressM:r.safeProgressLeader?.progressM??null}))}};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('FOOTPRINT_CONTINUED_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged,firstThreeReproduced,
    treatment:results.map(r=>({generation:r.generation,bestProgressM:r.bestProgressM,maxLaps:r.maxLaps,safeProgressM:r.safeProgressLeader?.progressM??null})),output:path.join(out,'report.json')}));
  sim.running=false;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
