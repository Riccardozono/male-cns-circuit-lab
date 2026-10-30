'use strict';
// Read-only terminal telemetry for the supplied V3/Monza save. Restores an
// isolated in-memory copy and captures the final physical approach of each
// car; it never writes the save, app, or learning state.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_TERMINAL_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-terminal-trace-20261020-01'));
const F=require(path.join(root,'outputs/simulation.js')),Progress=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function snap(car,tick){const v=car.vehicle||{};return {tick,id:car.id,x:car.x,y:car.y,heading:car.heading,bestProgress:car.bestProgress,laps:car.laps,
  along:car.rewardState?.along??null,speedMps:v.speedMps??car.speed??0,u:v.u??null,v:v.v??null,yawRate:v.r??car.yawRate??0,
  steeringAngle:v.steeringAngle??null,gear:v.gear??null,rpm:v.rpm??null,tcActive:v.tcActive??null,absActive:v.absActive??null,
  outputs:car.outputs?.slice()??null,visualSensors:car.inputs?.slice()??null,physicsSensors:car.physicsInputs?.slice()??null,
  alive:car.alive,reason:car.reason||'',fitness:car.fitness,penalties:car.rewardBreakdown?.penalties?{...car.rewardBreakdown.penalties}:null};}
function enrich(track,row){const p=F.locate(track,row.x,row.y),ppm=track.pixelsPerMeter||1,width=F.trackWidthAt(track,p.along),
  seg=track.segments.find(s=>p.along>=s.start-1e-8&&p.along<=s.start+s.length+1e-8)||track.segments.at(-1),
  angle=Math.atan2(seg.b.y-seg.a.y,seg.b.x-seg.a.x),dx=row.x-p.x,dy=row.y-p.y;
  return {...row,alongM:p.along/ppm,bestProgressM:row.bestProgress/ppm,centerOffsetM:(-dx*Math.sin(angle)+dy*Math.cos(angle))/ppm,
    centerDistanceM:p.distance/ppm,localTrackWidthM:width.widthMeters,onRoad:F.onRoad(track,row.x,row.y)};}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing terminal trace');
  const raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await Progress.decode(raw.toString('utf8'),'5.6.0'),
    compact=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),
    data=Legacy.tagV3(compact),circuits=require(path.join(root,'outputs/data/circuits.json')),
    sourceReport=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-brake-lock-migration-ab-20261020-01/report.json'),'utf8')),
    state=structuredClone(decoded.payload.workers[0].state),sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits});
  Progress.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3')
    throw Error('The supplied V3/Monza save identity differs from the verified baseline');
  state.history=[];Progress.restore(sim,state);sim.running=true;
  const ppm=sim.track.pixelsPerMeter||1,trail=new Map(),terminal=new Map();let progressAt=performance.now();
  sim.onTrialTick=s=>{
    const sampleEvery=10;
    for(const car of s.cars){
      const rows=trail.get(car.id)||[];
      if(s.ticks%sampleEvery===0||!car.alive){rows.push(snap(car,s.ticks));if(rows.length>50)rows.shift();trail.set(car.id,rows);}
      if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,reason:car.reason||'',trail:rows.slice()});
    }
    if(performance.now()-progressAt>20000){progressAt=performance.now();console.log('TERMINAL_TRACE_PROGRESS '+JSON.stringify({generation:s.generation,ticks:s.ticks,alive:s.cars.filter(c=>c.alive).length,bestProgressM:Math.max(...s.cars.map(c=>c.bestProgress))/ppm}));}
  };
  const generation=sim.generation;let ticks=0;
  while(sim.generation===generation&&ticks++<60000)sim.tick();
  if(sim.generation===generation||terminal.size!==state.population)throw Error('Generation ended unexpectedly or terminal cars were not captured');
  const expected=sourceReport.baseline.finishedCars[0].map(c=>({id:c.id,progressM:c.progressM,laps:c.laps,reason:c.reason})),
    observed=[...terminal.values()].map(v=>{const c=v.trail.at(-1);return {id:v.id,progressM:c.bestProgress/ppm,laps:c.laps,reason:v.reason};}).sort((a,b)=>a.id-b.id);
  if(JSON.stringify(expected)!==JSON.stringify(observed))throw Error('Read-only terminal replay did not exactly match the protected first-generation outcomes');
  const cars=[...terminal.values()].sort((a,b)=>a.id-b.id).map(v=>({id:v.id,reason:v.reason,
    final:enrich(sim.track,v.trail.at(-1)),trail:v.trail.map(row=>enrich(sim.track,row))}));
  const reasonCounts=cars.reduce((a,c)=>(a[c.reason||'n/a']=(a[c.reason||'n/a']||0)+1,a),{});
  const report={format:'male-cns-saved-v3-terminal-physical-trace-v1',appVersion:'5.6.0',passed:true,
    save:{sha256:saveSha,unchanged:sha(fs.readFileSync(savePath))===saveSha,appVersion:decoded.appVersion,model:'V3',circuit:'Monza',generation:state.generation,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
    method:'Single natural generation from an isolated in-memory restore of the supplied save with history-only reset. Terminal outcomes must exactly match the prior matched physical replay before telemetry is accepted. Captures actual vehicle state and track geometry; no training or save writes.',
    supersedes:'.impeccable/review/learning-ml/saved-v3-terminal-trace-20261020-01/report.json (its terminal captures matched, but its post-generation summary read the newly spawned cars)',
    generation:{generation:state.generation,ticks,bestProgressM:Math.max(...cars.map(c=>c.final.bestProgressM)),
      maxLaps:Math.max(...cars.map(c=>c.final.laps)),reasonCounts},cars,
    sourceHashes:Object.fromEntries(['simulation.js','rewards.js','progress-save.js','vehicle-992.js'].map(file=>[file,sha(fs.readFileSync(path.join(root,'outputs',file)))])),
    boundary:'This is one deterministic physical generation from one saved seed and one circuit, not evidence of general convergence. No application source, save, version, release, or model weights were changed.'};
  if(!report.save.unchanged)throw Error('Original user save checksum changed');
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('TERMINAL_TRACE_RESULT '+JSON.stringify({passed:report.passed,saveUnchanged:report.save.unchanged,generation:report.generation,
    events:cars.map(c=>({id:c.id,reason:c.reason,alongM:Number(c.final.alongM.toFixed(2)),offsetM:Number(c.final.centerOffsetM.toFixed(2)),onRoad:c.final.onRoad,
      speedMps:Number(c.final.speedMps.toFixed(2)),gas:c.final.outputs?.[1],brake:c.final.outputs?.[2]})),output:path.join(out,'report.json')}));
  sim.running=false;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
