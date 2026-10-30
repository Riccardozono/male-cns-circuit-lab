'use strict';
// Isolated CPU experiment from the supplied V3 save. It changes only the
// in-memory ordering of safe learning outcomes: completed laps, then progress,
// then pace/fitness. Production files and the original save are read-only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_PROGRESS_FIRST_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-progress-first-ranking-ab-20261020-01'));
const simFile=path.join(root,'outputs/simulation.js'),simSource=fs.readFileSync(simFile,'utf8');
const Progress=require(path.join(root,'outputs/progress-save.js'));
const Legacy=require(path.join(root,'outputs/legacy-models.js'));
const compact=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'));
const circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const safe=car=>!car.censored&&!car.overlap&&!['urto','fuori pista','progresso non valido','collision','off track','invalid progress'].includes(String(car.reason||'').trim().toLowerCase())&&
  !(Number(car.rewardBreakdown?.penalties?.collision)>0)&&!(Number(car.rewardBreakdown?.penalties?.offTrack)>0)&&!(Number(car.rewardBreakdown?.penalties?.invalid)>0);
function currentCompare(a,b){
  const as=safe(a),bs=safe(b);if(as!==bs)return as?-1:1;
  const af=Number.isFinite(a.fitness)?a.fitness:-Infinity,bf=Number.isFinite(b.fitness)?b.fitness:-Infinity;if(af!==bf)return bf-af;
  const al=Number(a.laps)||0,bl=Number(b.laps)||0;if(al!==bl)return bl-al;
  if(al>0){const at=Number.isFinite(a.bestLapTime)?a.bestLapTime:Infinity,bt=Number.isFinite(b.bestLapTime)?b.bestLapTime:Infinity;if(at!==bt)return at-bt;}
  const ap=Number(a.bestProgress)||0,bp=Number(b.bestProgress)||0;return Math.abs(bp-ap)>1e-9?bp-ap:0;
}
function progressFirstCompare(a,b){
  const as=safe(a),bs=safe(b);if(as!==bs)return as?-1:1;
  const al=Number(a.laps)||0,bl=Number(b.laps)||0;if(al!==bl)return bl-al;
  const ap=Number(a.bestProgress)||0,bp=Number(b.bestProgress)||0;if(Math.abs(bp-ap)>1e-9)return bp-ap;
  if(al>0){const at=Number.isFinite(a.bestLapTime)?a.bestLapTime:Infinity,bt=Number.isFinite(b.bestLapTime)?b.bestLapTime:Infinity;if(at!==bt)return at-bt;}
  const af=Number.isFinite(a.fitness)?a.fitness:-Infinity,bf=Number.isFinite(b.fitness)?b.fitness:-Infinity;return bf-af;
}
function makeEngine(){
  const start=simSource.indexOf('  function compareLearningAgents(a,b){'),end=simSource.indexOf('  const api=',start);
  if(start<0||end<0)throw Error('Expected current learning comparator was not found');
  const replacement=`  function compareLearningAgents(a,b){\n    const aSafe=isSafeLearningOutcome(a),bSafe=isSafeLearningOutcome(b);if(aSafe!==bSafe)return aSafe?-1:1;\n    const aLaps=Number(a?.laps)||0,bLaps=Number(b?.laps)||0;if(aLaps!==bLaps)return bLaps-aLaps;\n    const aProgress=Number(a?.bestProgress??a?.progress)||0,bProgress=Number(b?.bestProgress??b?.progress)||0;if(Math.abs(aProgress-bProgress)>1e-9)return bProgress-aProgress;\n    if(aLaps>0){const aTime=Number.isFinite(a?.bestLapTime)?a.bestLapTime:Infinity,bTime=Number.isFinite(b?.bestLapTime)?b.bestLapTime:Infinity;if(aTime!==bTime)return aTime-bTime;}\n    const aFitness=Number.isFinite(a?.fitness)?a.fitness:-Infinity,bFitness=Number.isFinite(b?.fitness)?b.fitness:-Infinity;return bFitness-aFitness;\n  }\n`;
  const text=simSource.slice(0,start)+replacement+simSource.slice(end);
  const m=new Module(simFile,module);m.filename=simFile;m.paths=Module._nodeModulePaths(path.dirname(simFile));m._compile(text,simFile);
  return m.exports;
}
function summarize(cars,ppm){return cars.filter(c=>!c.diagnosticVehicle).map(c=>({id:c.id,progressM:c.bestProgress/ppm,laps:c.laps,reason:c.reason,fitness:c.fitness,safe:safe(c)})).sort((a,b)=>a.id-b.id);}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing experiment report');
  const prior=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-continued-20261020-01/report.json'),'utf8'));
  if(!prior.passed||prior.settings?.model!=='V3'||prior.settings?.circuit!=='Monza'||prior.settings?.startGeneration!==64)throw Error('Exact saved V3/Monza control report required');
  const bytes=fs.readFileSync(savePath),saveSha=sha(bytes),decoded=await Progress.decode(bytes.toString('utf8'),'5.6.0');
  const original=decoded.payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||original.generation!==64||original.seed!==7717||original.population!==40||original.rewardRevision!=='progress-3')throw Error('The exact supplied V3 generation-64 checkpoint was not selected');
  const currentSourceSha=sha(Buffer.from(simSource));
  if(prior.sourceHashes?.simulation!==currentSourceSha||prior.sourceHashes?.learning!==sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js'))))throw Error('Current source does not match the deterministic control run');
  const Engine=makeEngine(),state=structuredClone(original),data=Legacy.tagV3(JSON.parse(JSON.stringify(compact)));
  const sim=new Engine.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  Progress.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});Progress.restore(sim,state);sim.running=true;
  if(!sim.cars.every(c=>c.footprintSensorsEnabled===true))throw Error('V3-only footprint sensors were not enabled');
  const results=[],started=performance.now();let terminalCars=null,lastLog=performance.now();
  sim.onTrialTick=s=>{
    if(s.cars.every(c=>!c.alive))terminalCars=s.cars.slice();
    if(performance.now()-lastLog>25000){lastLog=performance.now();console.log('PROGRESS_FIRST_PROGRESS '+JSON.stringify({generation:s.generation,alive:s.cars.filter(c=>c.alive).length,bestM:Math.max(...s.cars.map(c=>c.bestProgress))/(s.track.pixelsPerMeter||1)}));}
  };
  for(let i=0;i<3;i++){
    const generation=sim.generation;let ticks=0;
    while(sim.generation===generation&&ticks<60000){sim.tick();ticks++;}
    if(sim.generation===generation||!terminalCars)throw Error(`Generation ${generation} did not finish naturally`);
    const ppm=sim.track.pixelsPerMeter||1,all=summarize(terminalCars,ppm),safeCars=terminalCars.filter(safe);
    const byCurrent=safeCars.slice().sort(currentCompare),byProgress=safeCars.slice().sort(progressFirstCompare);
    const h=sim.history.at(-1),row={generation:h.generation,ticks,wallSeconds:(performance.now()-started)/1000,bestProgressM:h.bestProgress/ppm,
      meanProgressM:h.meanProgress/ppm,maxLaps:h.maxLaps,reasons:terminalCars.reduce((a,c)=>(a[c.reason||'n/a']=(a[c.reason||'n/a']||0)+1,a),{}),
      safeProgressLeader:all.filter(c=>c.safe).sort((a,b)=>b.progressM-a.progressM)[0]||null,
      currentFitnessFirstLeader:byCurrent[0]?{id:byCurrent[0].id,progressM:byCurrent[0].bestProgress/ppm,laps:byCurrent[0].laps,fitness:byCurrent[0].fitness,reason:byCurrent[0].reason}:null,
      progressFirstLeader:byProgress[0]?{id:byProgress[0].id,progressM:byProgress[0].bestProgress/ppm,laps:byProgress[0].laps,fitness:byProgress[0].fitness,reason:byProgress[0].reason}:null,
      outcomes:all.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}))};
    results.push(row);terminalCars=null;console.log('PROGRESS_FIRST_GENERATION '+JSON.stringify({generation:row.generation,bestProgressM:row.bestProgressM,maxLaps:row.maxLaps,
      currentFitnessFirstLeader:row.currentFitnessFirstLeader,progressFirstLeader:row.progressFirstLeader}));
  }
  const gen64Matches=JSON.stringify(results[0].outcomes)===JSON.stringify(prior.treatment.results[0].outcomes);
  if(!gen64Matches)throw Error('Generation 64 failed exact control reproduction');
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;if(!saveUnchanged)throw Error('Original save SHA changed');
  const control=prior.treatment.results.slice(0,3).map(r=>({generation:r.generation,bestProgressM:r.bestProgressM,maxLaps:r.maxLaps,safeProgressM:r.safeProgressLeader?.progressM??null}));
  const report={format:'male-cns-saved-v3-progress-first-ranking-ab-v1',appVersion:'5.6.0',passed:true,learningSucceeded:results.some(r=>r.maxLaps>=2),
    save:{sha256:saveSha,unchanged:saveUnchanged},settings:{model:'V3',circuit:'Monza',seed:original.seed,startGeneration:original.generation,population:original.population,
      rewardRevision:original.rewardRevision,naturalGenerations:3,historyReset:true,v3FootprintSensorsEnabled:true},sourceHashes:{simulation:currentSourceSha,
      productionFileUnchanged:true,learning:sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js')))},gen64MatchesControl:gen64Matches,
    method:'CPU-only matched-seed experiment. The only in-memory treatment is the comparator for safe learning outcomes: current is safety, fitness, laps, lap time, progress; treatment is safety, laps, progress, lap time, fitness. Fitness and all penalties remain unchanged; unsafe outcomes are still excluded from learning, champion and archive.',
    baselineControl:control,treatment:{results},comparison:{bestProgressDeltaM:results.map((r,i)=>r.bestProgressM-control[i].bestProgressM),safeProgressDeltaM:results.map((r,i)=>(r.safeProgressLeader?.progressM??0)-(control[i].safeProgressM??0)),lapDelta:results.map((r,i)=>r.maxLaps-control[i].maxLaps)},
    boundary:'Three natural generations from one existing V3 save are local evidence only. No production source, save, app version, release, tag, portable or installer was changed.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('PROGRESS_FIRST_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged,gen64MatchesControl:gen64Matches,
    control:report.baselineControl,treatment:results.map(r=>({generation:r.generation,bestProgressM:r.bestProgressM,maxLaps:r.maxLaps,safeProgressM:r.safeProgressLeader?.progressM??null})),output:path.join(out,'report.json')}));
  sim.running=false;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
