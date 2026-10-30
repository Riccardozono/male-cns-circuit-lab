'use strict';
// Research-only, in-memory Monza replay: compare the saved V3 controller after
// changing only wall-clearance observations from center rays to the car body.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_FOOTPRINT_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-clearance-ab-20261020-01')),
  simFile=path.join(root,'outputs/simulation.js'),simSource=fs.readFileSync(simFile,'utf8'),Progress=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),compact=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),
  circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function replaceExactly(text,before,after){const n=text.split(before).length-1;if(n!==1)throw Error(`Expected one source contract, found ${n}: ${before}`);return text.replace(before,after);}
function makeData(){return Legacy.tagV3(JSON.parse(JSON.stringify(compact)));}
function makeEngine(){
  let text=replaceExactly(simSource,
    'const nearLeft=(distances[1]+distances[2]+distances[0]*.35)/2.35,nearRight=(distances[4]+distances[5]+distances[6]*.35)/2.35;',
    `const hx=Vehicle.SPEC.lengthM*.5*(car.pixelsPerMeter||1),hy=Vehicle.SPEC.widthM*.5*(car.pixelsPerMeter||1),cos=Math.cos(car.heading),sin=Math.sin(car.heading);
    const sideClearance=side=>Math.max(0,Math.min(...[-1,1].map(longitudinal=>{
      const x=car.x+longitudinal*hx*cos-side*hy*sin,y=car.y+longitudinal*hx*sin+side*hy*cos;
      if(!onRoad(track,x,y)){let nearest=Infinity;for(const wall of track.walls)nearest=Math.min(nearest,pointSegment(x,y,wall.a,wall.b).distance);return -nearest;}
      return raycast(track,x,y,car.heading+side*Math.PI/2);
    })));
    const nearLeft=sideClearance(-1),nearRight=sideClearance(1),frontX=car.x+hx*cos,frontY=car.y+hx*sin,
      frontClearance=onRoad(track,frontX,frontY)?raycast(track,frontX,frontY,car.heading):0;`);
  text=replaceExactly(text,'clamp(distances[3]/SENSOR_MAX,0,1),','clamp(frontClearance/SENSOR_MAX,0,1),');
  const m=new Module(simFile,module);m.filename=simFile;m.paths=Module._nodeModulePaths(path.dirname(simFile));
  const localRequire=m.require.bind(m);m.require=request=>request==='./neural-learning.js'?require(path.join(root,'outputs/neural-learning.js')):localRequire(request);
  m._compile(text,simFile);return {...m.exports,source: text};
}
function safe(c){return !new Set(['urto','fuori pista','progresso non valido','collision','off track','invalid progress']).has(String(c.reason||'').toLowerCase());}
function summarize(cars,ppm,engine){return cars.filter(c=>!c.diagnosticVehicle).map(c=>({id:c.id,progressM:c.bestProgress/ppm,laps:c.laps,reason:c.reason,fitness:c.fitness,safe:engine.isSafeLearningOutcome(c)})).sort((a,b)=>a.id-b.id);}
function bestSafe(cars){return cars.filter(safe).sort((a,b)=>b.progressM-a.progressM)[0]||null;}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing report');
  const bytes=fs.readFileSync(savePath),saveSha=sha(bytes),decoded=await Progress.decode(bytes.toString('utf8'),'5.6.0'),stateOriginal=decoded.payload.workers[0].state,
    control=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-brake-lock-migration-ab-20261020-01/report.json'),'utf8')),
    trace=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-terminal-trace-20261020-02/report.json'),'utf8')),
    sourceHashes={simulation:sha(Buffer.from(simSource)),learning:sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js')))},base=control.baseline.sourceHashes;
  if(base['simulation.js']!==sourceHashes.simulation||base['neural-learning.js']!==sourceHashes.learning)throw Error('Matched control was produced from different app sources');
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||stateOriginal.generation!==64||stateOriginal.seed!==7717||stateOriginal.population!==40||stateOriginal.rewardRevision!=='progress-3')
    throw Error('The exact supplied V3/Monza generation-64 checkpoint was not selected');
  const engine=makeEngine(),state=structuredClone(stateOriginal);state.history=[];
  const sim=new engine.Simulation(makeData(),{modelId:'v3',population:state.population,circuitId:'monza',circuits});
  Progress.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});Progress.restore(sim,state);sim.running=true;
  const probe=trace.cars.find(c=>c.id===0).trail.find(s=>s.tick===4280),probeCar={...probe,pixelsPerMeter:sim.track.pixelsPerMeter||1},
    sensorProbe={tick:probe.tick,speedMps:probe.speedMps,steering:probe.outputs[0],brake:probe.outputs[2],centerOnRoad:probe.onRoad,
      originalRoadInputs:probe.physicsSensors.slice(7,11),footprintRoadInputs:engine.roadSense(sim.track,probeCar)};
  const results=[],started=performance.now();let terminal=null,lastLog=performance.now();
  sim.onTrialTick=s=>{
    if(s.cars.every(c=>!c.alive))terminal=summarize(s.cars,s.track.pixelsPerMeter||1,engine);
    if(performance.now()-lastLog>25000){lastLog=performance.now();console.log('FOOTPRINT_PROGRESS '+JSON.stringify({generation:s.generation,alive:s.cars.filter(c=>c.alive).length,bestM:Math.max(...s.cars.map(c=>c.bestProgress))/(s.track.pixelsPerMeter||1)}));}
  };
  for(let i=0;i<3;i++){
    const generation=sim.generation;let ticks=0;
    while(sim.generation===generation&&ticks<60000){sim.tick();ticks++;}
    if(sim.generation===generation||!terminal)throw Error(`Generation ${generation} did not finish naturally`);
    const ppm=sim.track.pixelsPerMeter||1,h=sim.history.at(-1),all=terminal.slice().sort((a,b)=>b.progressM-a.progressM),safeCars=terminal.filter(c=>c.safe).sort((a,b)=>b.progressM-a.progressM);
    results.push({generation:h.generation,ticks,wallSeconds:(performance.now()-started)/1000,bestProgressM:h.bestProgress/ppm,meanProgressM:h.meanProgress/ppm,maxLaps:h.maxLaps,
      reasons:terminal.reduce((a,c)=>(a[c.reason||'n/a']=(a[c.reason||'n/a']||0)+1,a),{}),overallLeader:all[0],safeProgressLeader:safeCars[0]||null,
      gen64Outcomes:terminal.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}))});
    terminal=null;console.log('FOOTPRINT_GENERATION '+JSON.stringify({generation:h.generation,bestProgressM:h.bestProgress/ppm,maxLaps:h.maxLaps,overallLeader:all[0],safeProgressLeader:safeCars[0]||null}));
  }
  const baseline=control.baseline.history.slice(0,3).map((h,i)=>{
    const cars=control.baseline.finishedCars[i],eligible=cars.filter(safe),leader=eligible.sort((a,b)=>b.progressM-a.progressM)[0]||null;
    return {generation:h.generation,bestProgressM:h.bestProgressM,maxLaps:h.maxLaps,safeProgressLeaderM:leader?.progressM??null};
  }),
    saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;
  if(!saveUnchanged)throw Error('Original user save checksum changed');
  const report={format:'male-cns-saved-v3-footprint-clearance-ab-v1',appVersion:'5.6.0',passed:true,learningSucceeded:results.some(r=>r.maxLaps>=2),
    save:{sha256:saveSha,unchanged:saveUnchanged},settings:{model:'V3',circuit:'Monza',seed:stateOriginal.seed,startGeneration:stateOriginal.generation,population:stateOriginal.population,
      rewardRevision:stateOriginal.rewardRevision,naturalGenerations:3,historyReset:true},sourceHashes,
    method:'Uses the exact saved V3 weights and population in a disposable in-memory copy. Only the four existing road observation values change: left/right clearance is raycast from the car body corners, forward clearance starts at the front bumper, far asymmetry remains ray-derived, and total side clearance is body-aware. Track walls, vehicle physics, reward, genetic operators and network architecture are unchanged. No route cue, teacher or autopilot is introduced.',
    sensorProbe,baseline,treatment:{label:'body-footprint road clearance sensors',results},
    comparison:{bestProgressDeltaM:results.map((r,i)=>r.bestProgressM-baseline[i].bestProgressM),safeProgressDeltaM:results.map((r,i)=>r.safeProgressLeader?.progressM-(baseline[i].safeProgressLeaderM||0)),
      lapDelta:results.map((r,i)=>r.maxLaps-baseline[i].maxLaps),promoteTreatment:false},
    boundary:'A three-generation test from one saved V3 seed is local evidence only. It does not prove a full lap or generalization. No app source, user save, version, release, tag, weights or champion were changed.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('FOOTPRINT_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged,sensorProbe,baseline,
    treatment:results.map(r=>({generation:r.generation,bestProgressM:r.bestProgressM,maxLaps:r.maxLaps,safeProgressM:r.safeProgressLeader?.progressM})),output:path.join(out,'report.json')}));
  sim.running=false;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
