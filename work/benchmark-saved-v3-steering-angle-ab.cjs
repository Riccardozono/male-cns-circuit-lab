'use strict';
// One-generation physical A/B on the exact supplied V3/Monza checkpoint.
// Only the in-memory target steering angle is reduced; app physics and saves
// remain untouched. CPU simulation only (no CUDA or user-profile access).
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_STEERING_ANGLE_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-steering-angle-ab-20261020-01'));
const simFile=path.join(root,'outputs/simulation.js'),vehicleFile=path.join(root,'outputs/vehicle-992.js');
const simSource=fs.readFileSync(simFile,'utf8'),vehicleSource=fs.readFileSync(vehicleFile,'utf8');
const Progress=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js'));
const compact=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function makeEngine(maxWheelAngle){
  const old='steer*.58-s.steeringAngle',count=vehicleSource.split(old).length-1;
  if(count!==1)throw Error(`Expected one steering-angle target, found ${count}`);
  const vehicleText=vehicleSource.replace(old,`steer*${maxWheelAngle.toFixed(2)}-s.steeringAngle`);
  const vm=new Module(vehicleFile,module);vm.filename=vehicleFile;vm.paths=Module._nodeModulePaths(path.dirname(vehicleFile));vm._compile(vehicleText,vehicleFile);
  const sm=new Module(simFile,module);sm.filename=simFile;sm.paths=Module._nodeModulePaths(path.dirname(simFile));
  const localRequire=sm.require.bind(sm);sm.require=request=>request==='./vehicle-992.js'?vm.exports:localRequire(request);
  sm._compile(simSource,simFile);return sm.exports;
}
function safe(c){return !c.censored&&!c.overlap&&!['urto','fuori pista','progresso non valido','collision','off track','invalid progress'].includes(String(c.reason||'').trim().toLowerCase())&&
  !(Number(c.rewardBreakdown?.penalties?.collision)>0)&&!(Number(c.rewardBreakdown?.penalties?.offTrack)>0)&&!(Number(c.rewardBreakdown?.penalties?.invalid)>0);}
function snapshot(cars,ppm,engine){
  const active=cars.filter(c=>!c.diagnosticVehicle),safeCars=active.filter(safe),fitness=active.slice().sort(engine.compareAgents),progress=active.slice().sort((a,b)=>b.bestProgress-a.bestProgress||engine.compareAgents(a,b)),safeProgress=safeCars.slice().sort((a,b)=>b.bestProgress-a.bestProgress||engine.compareAgents(a,b));
  return {bestProgressM:(progress[0]?.bestProgress||0)/ppm,maxLaps:Math.max(0,...active.map(c=>c.laps)),collisions:active.filter(c=>!safe(c)).length,
    safeCount:safeCars.length,reasons:active.reduce((a,c)=>(a[c.reason||'n/a']=(a[c.reason||'n/a']||0)+1,a),{}),
    fitnessLeader:fitness[0]?{id:fitness[0].id,progressM:fitness[0].bestProgress/ppm,laps:fitness[0].laps,fitness:fitness[0].fitness,reason:fitness[0].reason}:null,
    progressLeader:progress[0]?{id:progress[0].id,progressM:progress[0].bestProgress/ppm,laps:progress[0].laps,fitness:progress[0].fitness,reason:progress[0].reason}:null,
    safeProgressLeader:safeProgress[0]?{id:safeProgress[0].id,progressM:safeProgress[0].bestProgress/ppm,laps:safeProgress[0].laps,fitness:safeProgress[0].fitness,reason:safeProgress[0].reason}:null,
    outcomes:active.map(c=>({id:c.id,progressM:c.bestProgress/ppm,laps:c.laps,reason:c.reason,safe:safe(c)})).sort((a,b)=>a.id-b.id)};
}
async function runVariant(label,maxWheelAngle,state,savePayload){
  const Engine=makeEngine(maxWheelAngle),data=Legacy.tagV3(JSON.parse(JSON.stringify(compact)));
  const sim=new Engine.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  Progress.validatePayload(savePayload,{graph:sim.graph,circuits:sim.circuits});Progress.restore(sim,structuredClone(state));sim.running=true;
  if(!sim.cars.every(c=>c.footprintSensorsEnabled===true))throw Error(`V3 footprint sensors absent in ${label}`);
  const generation=sim.generation,started=performance.now();let ticks=0,terminal=null,lastLog=started;
  sim.onTrialTick=s=>{
    if(s.cars.every(c=>!c.alive))terminal=s.cars.slice();
    if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('STEERING_ANGLE_PROGRESS '+JSON.stringify({label,generation,alive:s.cars.filter(c=>c.alive).length,bestM:Math.max(...s.cars.map(c=>c.bestProgress))/(s.track.pixelsPerMeter||1)}));}
  };
  while(sim.generation===generation&&ticks<60000){sim.tick();ticks++;}
  if(sim.generation===generation||!terminal)throw Error(`${label} generation did not finish naturally`);
  const result={label,maxWheelAngleRad:maxWheelAngle,maxWheelAngleDeg:maxWheelAngle*180/Math.PI,ticks,wallSeconds:(performance.now()-started)/1000,...snapshot(terminal,sim.track.pixelsPerMeter||1,Engine)};
  sim.running=false;return result;
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing experiment report');
  const controlPath=path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-continued-20261020-01/report.json');
  const control=JSON.parse(fs.readFileSync(controlPath,'utf8'));
  if(!control.passed||control.settings?.model!=='V3'||control.settings?.circuit!=='Monza'||control.settings?.startGeneration!==64)throw Error('Exact deterministic V3/Monza control report required');
  const bytes=fs.readFileSync(savePath),saveSha=sha(bytes),decoded=await Progress.decode(bytes.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3'||control.save.sha256!==saveSha)throw Error('The exact preserved generation-64 user checkpoint was not selected');
  if(control.sourceHashes?.simulation!==sha(Buffer.from(simSource))||control.sourceHashes?.learning!==sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js'))))throw Error('Simulation sources do not match the deterministic control');
  const controlRow=control.treatment.results[0];
  const baseline={label:'current 0.58 rad',maxWheelAngleRad:.58,maxWheelAngleDeg:.58*180/Math.PI,
    ticks:controlRow.ticks,wallSeconds:controlRow.wallSeconds,bestProgressM:controlRow.bestProgressM,maxLaps:controlRow.maxLaps,
    collisions:controlRow.reasons.urto||0,reasons:controlRow.reasons,progressLeader:controlRow.overallLeader,safeProgressLeader:controlRow.safeProgressLeader,
    outcomes:controlRow.outcomes};
  const variants=[];
  for(const angle of [.46,.38])variants.push(await runVariant(`${angle.toFixed(2)} rad`,angle,state,decoded.payload));
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;
  if(!saveUnchanged)throw Error('Original user save SHA changed');
  const report={format:'male-cns-saved-v3-steering-angle-ab-v1',appVersion:'5.6.0',passed:true,learningSucceeded:variants.some(v=>v.maxLaps>=2),
    save:{sha256:saveSha,unchanged:saveUnchanged},settings:{model:'V3',circuit:'Monza',seed:state.seed,startGeneration:state.generation,population:state.population,
      rewardRevision:state.rewardRevision,generationsPerVariant:1,v3FootprintSensorsEnabled:true},sourceHashes:{simulation:sha(Buffer.from(simSource)),vehicle:sha(Buffer.from(vehicleSource)),learning:sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js')))},
    method:'Matched one-generation physical replay from the exact same 40 saved V3 policies. The treatment changes only the maximum front-wheel steering-angle target in a temporary in-memory vehicle module: 0.46 rad and 0.38 rad vs 0.58 rad control. Steering slew rate, tyre model, brakes, rewards, sensors, neural outputs, selection and all saves remain unchanged. CPU only.',
    baseline,variants,comparison:variants.map(v=>({label:v.label,progressDeltaM:v.bestProgressM-baseline.bestProgressM,safeProgressDeltaM:(v.safeProgressLeader?.progressM??0)-(baseline.safeProgressLeader?.progressM??0),lapDelta:v.maxLaps-baseline.maxLaps,collisionDelta:v.collisions-baseline.collisions})),
    boundary:'One generation from one trained save is only a local steering-sensitivity diagnostic. It cannot establish multi-generation learning or generalization across V2/V3/V4/V5, seeds or tracks. No app source, user save, version, tag, release, portable or installer changed.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('STEERING_ANGLE_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged,
    baseline:{bestProgressM:baseline.bestProgressM,maxLaps:baseline.maxLaps,safeProgressM:baseline.safeProgressLeader?.progressM,collisions:baseline.collisions},
    variants:variants.map(v=>({label:v.label,bestProgressM:v.bestProgressM,maxLaps:v.maxLaps,safeProgressM:v.safeProgressLeader?.progressM,collisions:v.collisions})),output:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
