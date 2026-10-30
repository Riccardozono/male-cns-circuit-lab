'use strict';
// Read-only per-tick tail telemetry from the exact current-source V3/Monza
// generation-64 replay. The source report must match byte-for-byte.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_FOOTPRINT_TRACE_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-terminal-20261020-01'));
const F=require(path.join(root,'outputs/simulation.js')),Progress=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function snap(car,tick){const v=car.vehicle||{};return {tick,id:car.id,x:car.x,y:car.y,heading:car.heading,bestProgress:car.bestProgress,laps:car.laps,
  along:car.rewardState?.along??null,speedMps:v.speedMps??car.speed??0,longitudinalMps:v.u??null,lateralMps:v.v??null,yawRate:v.r??car.yawRate??0,
  steeringAngleRad:v.steeringAngle??null,gear:v.gear??null,rpm:v.rpm??null,axMps2:v.ax??null,ayMps2:v.ay??null,slipAngle:v.slipAngle??car.slipAngle??null,
  outputs:car.outputs?.slice()??null,visualSensors:car.inputs?.slice()??null,physicsSensors:car.physicsInputs?.slice()??null,alive:car.alive,reason:car.reason||''};}
function enrich(track,row){const p=F.locate(track,row.x,row.y),ppm=track.pixelsPerMeter||1,width=F.trackWidthAt(track,p.along),seg=track.segments.find(s=>p.along>=s.start-1e-8&&p.along<=s.start+s.length+1e-8)||track.segments.at(-1),angle=Math.atan2(seg.b.y-seg.a.y,seg.b.x-seg.a.x),dx=row.x-p.x,dy=row.y-p.y;
  return {...row,progressM:row.bestProgress/ppm,alongM:p.along/ppm,centerOffsetM:(-dx*Math.sin(angle)+dy*Math.cos(angle))/ppm,centerDistanceM:p.distance/ppm,localTrackWidthM:width.widthMeters,onRoad:F.onRoad(track,row.x,row.y)};}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');if(fs.existsSync(out))throw Error('Refusing to overwrite existing terminal trace');
  const current=path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-continued-20261020-01/report.json'),control=JSON.parse(fs.readFileSync(current,'utf8'));
  const simFile=path.join(root,'outputs/simulation.js'),simSha=sha(fs.readFileSync(simFile));
  if(!control.passed||control.settings?.model!=='V3'||control.settings?.circuit!=='Monza'||control.settings?.startGeneration!==64||control.sourceHashes?.simulation!==simSha||control.sourceHashes?.learning!==sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js'))))throw Error('Current-source V3 footprint control does not match');
  const raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await Progress.decode(raw.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state),data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json'));
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3'||control.save.sha256!==saveSha)throw Error('Exact protected V3/Monza checkpoint required');
  const sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});Progress.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});Progress.restore(sim,state);sim.running=true;
  if(!sim.cars.every(c=>c.footprintSensorsEnabled===true))throw Error('V3 body-footprint sensors are not enabled');
  const ppm=sim.track.pixelsPerMeter||1,trail=new Map(),terminal=new Map();let lastLog=performance.now();
  sim.onTrialTick=s=>{for(const car of s.cars){const rows=trail.get(car.id)||[];if(s.ticks%5===0||!car.alive){rows.push(snap(car,s.ticks));if(rows.length>80)rows.shift();trail.set(car.id,rows);}if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,reason:car.reason||'',safe:F.isSafeLearningOutcome(car),rows:rows.slice()});}
    if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('FOOTPRINT_TRACE_PROGRESS '+JSON.stringify({generation:s.generation,ticks:s.ticks,alive:s.cars.filter(c=>c.alive).length,bestM:Math.max(...s.cars.map(c=>c.bestProgress))/(s.track.pixelsPerMeter||1)}));}};
  const gen=sim.generation;let ticks=0;while(sim.generation===gen&&ticks++<60000)sim.tick();
  if(sim.generation===gen||terminal.size!==state.population)throw Error('Generation did not finish naturally or telemetry incomplete');
  const actual=[...terminal.values()].map(v=>{const c=v.rows.at(-1);return {id:v.id,progressM:c.bestProgress/ppm,laps:c.laps,reason:v.reason};}).sort((a,b)=>a.id-b.id),expected=control.treatment.results[0].outcomes;
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Current-source terminal outcomes do not exactly reproduce the protected control');
  const cars=[...terminal.values()].sort((a,b)=>a.id-b.id).map(v=>({id:v.id,reason:v.reason,safe:v.safe,trail:v.rows.map(row=>enrich(sim.track,row))}));
  const safeLeader=cars.filter(c=>c.safe).sort((a,b)=>(b.trail.at(-1)?.progressM||0)-(a.trail.at(-1)?.progressM||0))[0];
  const report={format:'male-cns-saved-v3-footprint-terminal-trace-v1',appVersion:'5.6.0',passed:true,learningSucceeded:false,
    save:{sha256:saveSha,unchanged:sha(fs.readFileSync(savePath))===saveSha,model:'V3',circuit:'Monza',generation:state.generation,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
    method:'One natural generation restored in memory from the exact user checkpoint, current simulation/neural source SHA matched to the six-generation control, V3 footprint sensors verified active on all cars, terminal outcomes matched by id/progress/laps/reason. Keeps 80 samples at five simulation ticks plus each terminal tick for every car. CPU only; no source, save, or training state writes.',
    sourceHashes:{simulation:simSha,vehicle:sha(fs.readFileSync(path.join(root,'outputs/vehicle-992.js'))),rewards:sha(fs.readFileSync(path.join(root,'outputs/rewards.js'))),save:saveSha},
    generation:{ticks,bestProgressM:Math.max(...cars.map(c=>c.trail.at(-1)?.progressM||0)),maxLaps:Math.max(...cars.map(c=>c.trail.at(-1)?.laps||0)),reasonCounts:cars.reduce((a,c)=>(a[c.reason||'n/a']=(a[c.reason||'n/a']||0)+1,a),{})},safeProgressLeader:{id:safeLeader?.id??null,progressM:safeLeader?.trail.at(-1)?.progressM??null,reason:safeLeader?.reason??null,trail:safeLeader?.trail??[]},cars,
    boundary:'Single saved-seed/circuit generation; this diagnoses terminal control only and does not prove learning improvement or generalization. No release, tag, portable, installer, or user save was changed.'};
  if(!report.save.unchanged)throw Error('Original V3 save SHA changed');fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('FOOTPRINT_TRACE_RESULT '+JSON.stringify({passed:report.passed,saveUnchanged:report.save.unchanged,generation:report.generation,safeProgressLeader:{id:safeLeader?.id,progressM:safeLeader?.trail.at(-1)?.progressM,reason:safeLeader?.reason,final:safeLeader?.trail.at(-1)},output:path.join(out,'report.json')}));
  sim.running=false;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
