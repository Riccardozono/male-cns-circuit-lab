'use strict';
// One-generation CPU replay on the exact supplied V3/Monza save. Preserve the
// maximum steering angle and test slower wheel-angle slew rates in-memory.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_STEERING_RATE_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-steering-rate-ab-20261020-01'));
const simFile=path.join(root,'outputs/simulation.js'),vehicleFile=path.join(root,'outputs/vehicle-992.js');
const simSource=fs.readFileSync(simFile,'utf8'),vehicleSource=fs.readFileSync(vehicleFile,'utf8');
const Progress=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js'));
const compact=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function makeEngine(rate){
  const old='steer*.58-s.steeringAngle,-1.8*h,1.8*h',count=vehicleSource.split(old).length-1;
  if(count!==1)throw Error(`Expected one steering slew limiter, found ${count}`);
  const vehicleText=vehicleSource.replace(old,`steer*.58-s.steeringAngle,-${rate.toFixed(1)}*h,${rate.toFixed(1)}*h`);
  const vm=new Module(vehicleFile,module);vm.filename=vehicleFile;vm.paths=Module._nodeModulePaths(path.dirname(vehicleFile));vm._compile(vehicleText,vehicleFile);
  const sm=new Module(simFile,module);sm.filename=simFile;sm.paths=Module._nodeModulePaths(path.dirname(simFile));const localRequire=sm.require.bind(sm);
  sm.require=request=>request==='./vehicle-992.js'?vm.exports:localRequire(request);sm._compile(simSource,simFile);return sm.exports;
}
function safe(c){return !c.censored&&!c.overlap&&!['urto','fuori pista','progresso non valido','collision','off track','invalid progress'].includes(String(c.reason||'').trim().toLowerCase())&&
  !(Number(c.rewardBreakdown?.penalties?.collision)>0)&&!(Number(c.rewardBreakdown?.penalties?.offTrack)>0)&&!(Number(c.rewardBreakdown?.penalties?.invalid)>0);}
function snapshot(cars,ppm,engine){
  const active=cars.filter(c=>!c.diagnosticVehicle),safeCars=active.filter(safe),fitness=active.slice().sort(engine.compareAgents),progress=active.slice().sort((a,b)=>b.bestProgress-a.bestProgress||engine.compareAgents(a,b)),safeProgress=safeCars.slice().sort((a,b)=>b.bestProgress-a.bestProgress||engine.compareAgents(a,b));
  return {bestProgressM:(progress[0]?.bestProgress||0)/ppm,maxLaps:Math.max(0,...active.map(c=>c.laps)),safeCount:safeCars.length,
    urti:active.filter(c=>String(c.reason||'').toLowerCase()==='urto').length,reasons:active.reduce((a,c)=>(a[c.reason||'n/a']=(a[c.reason||'n/a']||0)+1,a),{}),
    fitnessLeader:fitness[0]?{id:fitness[0].id,progressM:fitness[0].bestProgress/ppm,laps:fitness[0].laps,fitness:fitness[0].fitness,reason:fitness[0].reason}:null,
    progressLeader:progress[0]?{id:progress[0].id,progressM:progress[0].bestProgress/ppm,laps:progress[0].laps,fitness:progress[0].fitness,reason:progress[0].reason}:null,
    safeProgressLeader:safeProgress[0]?{id:safeProgress[0].id,progressM:safeProgress[0].bestProgress/ppm,laps:safeProgress[0].laps,fitness:safeProgress[0].fitness,reason:safeProgress[0].reason}:null,
    outcomes:active.map(c=>({id:c.id,progressM:c.bestProgress/ppm,laps:c.laps,reason:c.reason,safe:safe(c)})).sort((a,b)=>a.id-b.id)};
}
async function runVariant(rate,state,payload){
  const Engine=makeEngine(rate),data=Legacy.tagV3(JSON.parse(JSON.stringify(compact))),sim=new Engine.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  Progress.validatePayload(payload,{graph:sim.graph,circuits:sim.circuits});Progress.restore(sim,structuredClone(state));sim.running=true;
  if(!sim.cars.every(c=>c.footprintSensorsEnabled===true))throw Error('V3 footprint sensors are not enabled');
  const generation=sim.generation,started=performance.now();let ticks=0,terminal=null;
  sim.onTrialTick=s=>{if(s.cars.every(c=>!c.alive))terminal=s.cars.slice();};
  while(sim.generation===generation&&ticks<60000){sim.tick();ticks++;}
  if(sim.generation===generation||!terminal)throw Error(`Rate ${rate} generation did not finish naturally`);
  sim.running=false;return {label:`${rate.toFixed(1)} rad/s`,steeringSlewRateRadPerSecond:rate,ticks,wallSeconds:(performance.now()-started)/1000,...snapshot(terminal,sim.track.pixelsPerMeter||1,Engine)};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');if(fs.existsSync(out))throw Error('Refusing to overwrite existing report');
  const control=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-continued-20261020-01/report.json'),'utf8'));
  const bytes=fs.readFileSync(savePath),saveSha=sha(bytes),decoded=await Progress.decode(bytes.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state,base=control.treatment.results[0];
  if(!control.passed||control.settings?.model!=='V3'||control.settings?.circuit!=='Monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3'||control.save.sha256!==saveSha)throw Error('Exact protected V3/Monza generation-64 control required');
  if(control.sourceHashes?.simulation!==sha(Buffer.from(simSource))||control.sourceHashes?.learning!==sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js'))))throw Error('Simulation sources do not match the deterministic control');
  const variants=[];for(const rate of [1.2,.9])variants.push(await runVariant(rate,state,decoded.payload));
  if(sha(fs.readFileSync(savePath))!==saveSha)throw Error('Original save SHA changed');
  const report={format:'male-cns-saved-v3-steering-rate-ab-v1',appVersion:'5.6.0',passed:true,learningSucceeded:variants.some(v=>v.maxLaps>=2),
    save:{sha256:saveSha,unchanged:true},settings:{model:'V3',circuit:'Monza',seed:state.seed,startGeneration:state.generation,population:state.population,rewardRevision:state.rewardRevision,generationsPerVariant:1},
    sourceHashes:{simulation:sha(Buffer.from(simSource)),vehicle:sha(Buffer.from(vehicleSource)),learning:sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js')))},
    method:'Matched one-generation physical replay from the exact same 40 saved V3 policies. The treatment preserves the 0.58 rad maximum wheel-angle target and changes only its in-memory slew limit from 1.8 rad/s to 1.2 or 0.9 rad/s. No neural outputs, reward, tyre/brake model, sensors, app source, or save are changed. CPU only.',
    baseline:{label:'1.8 rad/s control',steeringSlewRateRadPerSecond:1.8,ticks:base.ticks,wallSeconds:base.wallSeconds,bestProgressM:base.bestProgressM,maxLaps:base.maxLaps,
      urti:base.reasons.urto||0,reasons:base.reasons,progressLeader:base.overallLeader,safeProgressLeader:base.safeProgressLeader,outcomes:base.outcomes},variants,
    comparison:variants.map(v=>({label:v.label,progressDeltaM:v.bestProgressM-base.bestProgressM,safeProgressDeltaM:(v.safeProgressLeader?.progressM??0)-(base.safeProgressLeader?.progressM??0),lapDelta:v.maxLaps-base.maxLaps,urtiDelta:v.urti-(base.reasons.urto||0)})),
    boundary:'Single-generation, single-save sensitivity check only; no model learning or cross-model/circuit generalization is claimed. No release artifacts were modified.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('STEERING_RATE_RESULT '+JSON.stringify({passed:report.passed,saveUnchanged:true,baseline:{bestProgressM:base.bestProgressM,safeProgressM:base.safeProgressLeader?.progressM,urti:base.reasons.urto||0},
    variants:variants.map(v=>({label:v.label,bestProgressM:v.bestProgressM,safeProgressM:v.safeProgressLeader?.progressM,urti:v.urti,maxLaps:v.maxLaps})),output:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
