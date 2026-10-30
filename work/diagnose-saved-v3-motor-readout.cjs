'use strict';
// Read-only neural motor-head trace for the protected V3/Monza generation-64
// save. Replays one natural generation and records how its learned neuronal
// readout produces longitudinal commands near the verified stall.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_V3_READOUT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-motor-readout-20261020-01'));
const F=require(path.join(root,'outputs/simulation.js')),Progress=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const SENSOR_LABELS=['raggio -1.25 rad','raggio -0.80 rad','raggio -0.40 rad','raggio frontale','raggio +0.40 rad','raggio +0.80 rad','raggio +1.25 rad','raggio esterno -1.45 rad','raggio esterno -1.05 rad','raggio esterno +1.05 rad','raggio esterno +1.45 rad','velocità','G longitudinale','G laterale','G totale','angolo di deriva','velocità d’imbardata','trasferimento di carico','asimmetria strada vicina','asimmetria strada lontana','spazio frontale paraurti','larghezza disponibile','RPM','marcia','slittamento posteriore','slittamento anteriore','temperatura gomma','temperatura freni'];
function motorReadout(graph,car){
  const g=car.genome,p=graph.learning,values=g.policyWeights;
  if(!values||!p) return {kind:'legacy',commands:F.neuralOutputsFromBrain(graph,car.brain,g)};
  let sum=0,signal=0;const scale=1/Math.sqrt(p.nodes.length),contributions=[];
  for(let j=0;j<p.nodes.length;j++){
    const node=p.nodes[j],activity=Number(car.brain.activity[node])||0;signal=Math.max(signal,Math.abs(activity));
    const feature=Math.tanh(8*activity),weight=values[p.readoutOffset+j*2+1],contribution=feature*weight*scale;
    sum+=contribution;
    if(Math.abs(contribution)>1e-6)contributions.push({node,bodyId:Number(graph.bodyIds[node]),feature,weight,contribution});
  }
  const bias=values.at(-1),longitudinal=signal<1e-7?0:Math.tanh(sum+bias);
  const sensorDrives=Array.from({length:F.SENSOR_COUNT},()=>0);
  for(let k=0;k<graph.inputs.length;k++)sensorDrives[k%F.SENSOR_COUNT]+=Math.abs(F.sensorDrive(graph,g,car.sensorVector,k,F.MAP_PHYSICS_ADAPTER_GAIN));
  return {kind:'policyWeights',adapterVersion:g.adapterVersion,readoutNodes:p.nodes.length,activeSignal:signal,readoutSum:sum,bias,longitudinalLogit:sum+bias,predictedLongitudinal:longitudinal,
    commands:F.neuralOutputsFromBrain(graph,car.brain,g),topMotorContributors:contributions.sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution)).slice(0,8),
    sensorDriveRanking:sensorDrives.map((drive,channel)=>({channel,label:SENSOR_LABELS[channel],drive})).sort((a,b)=>b.drive-a.drive).slice(0,8)};
}
function enrich(car,tick,graph){const v=car.vehicle||{},readout=motorReadout(graph,car);return {tick,progressM:car.bestProgress/(car.pixelsPerMeter||1),alongM:car.rewardState?.along/(car.pixelsPerMeter||1),speedMps:v.speedMps??car.speed??0,
  gas:car.outputs?.[1]??null,brake:car.outputs?.[2]??null,steer:car.outputs?.[0]??null,longitudinalMps:v.u??null,axMps2:v.ax??null,gear:v.gear??null,rpm:v.rpm??null,
  sensorValues:car.sensorVector.map((value,channel)=>({channel,label:SENSOR_LABELS[channel]||`sensore ${channel}`,value})),readout};}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');if(fs.existsSync(out))throw Error('Refusing to overwrite existing readout trace');
  const control=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-footprint-continued-20261020-01/report.json'),'utf8'));
  const simFile=path.join(root,'outputs/simulation.js'),learningFile=path.join(root,'outputs/neural-learning.js'),simSha=sha(fs.readFileSync(simFile)),learningSha=sha(fs.readFileSync(learningFile));
  if(!control.passed||control.settings?.model!=='V3'||control.settings?.circuit!=='Monza'||control.settings?.startGeneration!==64||control.sourceHashes?.simulation!==simSha||control.sourceHashes?.learning!==learningSha)throw Error('Exact current-source V3/Monza control required');
  const raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await Progress.decode(raw.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3'||control.save.sha256!==saveSha)throw Error('Exact protected V3/Monza checkpoint required');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json'));
  const sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});Progress.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});Progress.restore(sim,state);sim.running=true;
  if(!sim.cars.every(c=>c.footprintSensorsEnabled===true))throw Error('V3 footprint sensor migration is not active');
  const rows=[],terminal=new Map(),targetId=Number(control.treatment.results[0].safeProgressLeader.id),gen=sim.generation;let ticks=0,lastLog=performance.now();
  sim.onTrialTick=s=>{const car=s.cars.find(c=>c.id===targetId);if(car&&(s.ticks>=3800&&(s.ticks%5===0||!car.alive)))rows.push(enrich(car,s.ticks,s.graph));
    for(const c of s.cars)if(!c.alive&&!terminal.has(c.id))terminal.set(c.id,{id:c.id,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),laps:c.laps,reason:c.reason||''});
    if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('MOTOR_READOUT_PROGRESS '+JSON.stringify({generation:s.generation,ticks:s.ticks,alive:s.cars.filter(c=>c.alive).length,traceSamples:rows.length}));}};
  while(sim.generation===gen&&ticks++<60000)sim.tick();
  if(sim.generation===gen||terminal.size!==state.population)throw Error('Generation did not finish naturally or terminal outcomes are incomplete');
  const actual=[...terminal.values()].sort((a,b)=>a.id-b.id),expected=control.treatment.results[0].outcomes;
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Terminal outcomes no longer match the exact V3 current-source control');
  const interesting=rows.filter(r=>r.tick%50===0||r.speedMps<2||r.tick>=4200);
  const report={format:'male-cns-saved-v3-neural-motor-readout-trace-v1',appVersion:'5.6.0',passed:true,learningSucceeded:false,
    save:{sha256:saveSha,unchanged:sha(fs.readFileSync(savePath))===saveSha,model:'V3',circuit:'Monza',generation:state.generation,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
    method:'Exact in-memory replay of the user checkpoint using current simulation and neural-learning source hashes. Captures the selected safe leader near its terminal stall, its real learned longitudinal readout, largest signed readout-neuron contributions, neural sensor-drive ranking and all sensor values. Requires exact per-agent outcome reproduction; no changes to save, app, reward, physics, or training data.',
    sourceHashes:{simulation:simSha,learning:learningSha,vehicle:sha(fs.readFileSync(path.join(root,'outputs/vehicle-992.js'))),rewards:sha(fs.readFileSync(path.join(root,'outputs/rewards.js'))),save:saveSha},
    generation:{ticks,selectedId:targetId,selectedOutcome:actual[targetId],capturedRows:rows.length,analyzedRows:interesting.length,first:interesting[0]||null,last:interesting.at(-1)||null,trace:interesting},
    boundary:'Single saved-seed/circuit diagnostic only. It identifies what the saved V3 decoder commands at its reproduced stall; it cannot prove that one sensor or neuron is the sole cause, or that a proposed change improves general learning. CPU-only read-only replay.'};
  if(!report.save.unchanged)throw Error('Original V3 save SHA changed');fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('MOTOR_READOUT_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged:report.save.unchanged,selectedId:targetId,outcome:report.generation.selectedOutcome,first:interesting[0],last:interesting.at(-1),report:path.join(out,'report.json')}));sim.running=false;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
