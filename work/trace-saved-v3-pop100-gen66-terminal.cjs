'use strict';
// Read-only trace of the exact 100-agent V3/Monza gen66 frontier policy.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-pop100-gen66-terminal-trace-20261023-01');
const F=require(path.join(root,'outputs/simulation.js'));
const Progress=require(path.join(root,'outputs/progress-save.js'));
const Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourceHashes=()=>Object.fromEntries(['simulation.js','neural-learning.js','vehicle-992.js','rewards.js','progress-save.js'].map(file=>
  [file,sha(fs.readFileSync(path.join(root,'outputs',file)))]));
const SENSOR_LABELS=['raggio -1.25 rad','raggio -0.80 rad','raggio -0.40 rad','raggio frontale','raggio +0.40 rad','raggio +0.80 rad','raggio +1.25 rad','raggio esterno -1.45 rad','raggio esterno -1.05 rad','raggio esterno +1.05 rad','raggio esterno +1.45 rad','velocità','G longitudinale','G laterale','G totale','angolo di deriva','velocità d’imbardata','trasferimento di carico','asimmetria strada vicina','asimmetria strada lontana','spazio frontale paraurti','larghezza disponibile','RPM','marcia','slittamento posteriore','slittamento anteriore','temperatura gomma','temperatura freni'];
function motorReadout(graph,car){
  const p=graph.learning,weights=car.genome.policyWeights;let sum=0,signal=0;const scale=1/Math.sqrt(p.nodes.length),contributions=[];
  for(let j=0;j<p.nodes.length;j++){
    const node=p.nodes[j],activity=Number(car.brain.activity[node])||0;signal=Math.max(signal,Math.abs(activity));
    const feature=Math.tanh(8*activity),weight=weights[p.readoutOffset+j*2+1],contribution=feature*weight*scale;sum+=contribution;
    if(Math.abs(contribution)>1e-7)contributions.push({node,bodyId:Number(graph.bodyIds[node]),feature,weight,contribution});
  }
  const bias=weights.at(-1),logit=sum+bias,longitudinal=signal<1e-7?0:Math.tanh(logit);
  const sensorDrives=Array.from({length:F.SENSOR_COUNT},()=>0);
  for(let k=0;k<graph.inputs.length;k++)sensorDrives[k%F.SENSOR_COUNT]+=Math.abs(F.sensorDrive(graph,car.genome,car.sensorVector,k,F.MAP_PHYSICS_ADAPTER_GAIN));
  return {activeSignal:signal,readoutSum:sum,bias,longitudinalLogit:logit,predictedLongitudinal:longitudinal,
    commands:F.neuralOutputsFromBrain(graph,car.brain,car.genome),
    topMotorContributors:contributions.sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution)).slice(0,8),
    sensorDriveRanking:sensorDrives.map((drive,channel)=>({channel,label:SENSOR_LABELS[channel],drive})).sort((a,b)=>b.drive-a.drive).slice(0,8)};
}
function positionOnTrack(track,car){
  const q=F.locate(track,car.x,car.y),seg=track.segments.find(s=>q.along>=s.start&&q.along<=s.start+s.length)||track.segments.at(-1);
  const cross=((seg.b.x-seg.a.x)*(car.y-q.y)-(seg.b.y-seg.a.y)*(car.x-q.x))/Math.max(1e-9,seg.length);
  const ppm=track.pixelsPerMeter||1,width=F.trackWidthAt(track,q.along);
  return {x:car.x,y:car.y,headingRad:car.heading,chainageM:q.along/ppm,centreDistanceM:q.distance/ppm,
    signedLateralOffsetM:cross/ppm,trackWidthM:width.widthMeters,trackStation:width.label};
}
function capture(car,tick,track,graph){
  const v=car.vehicle||{};
  return {tick,alive:car.alive,reason:car.reason||'',progressM:car.bestProgress/(car.pixelsPerMeter||1),
    speedMps:v.speedMps??car.speed??0,longitudinalMps:v.u??null,lateralMps:v.v??null,yawRate:v.r??car.yawRate??0,
    axMps2:v.ax??null,ayMps2:v.ay??null,gear:v.gear??null,rpm:v.rpm??null,position:positionOnTrack(track,car),
    steer:car.outputs?.[0]??null,gas:car.outputs?.[1]??null,brake:car.outputs?.[2]??null,
    sensorValues:(car.sensorVector||[]).map((value,channel)=>({channel,label:SENSOR_LABELS[channel]||`sensore ${channel}`,value})),
    readout:motorReadout(graph,car)};
}
function sortedCounts(counts){return Object.fromEntries(Object.entries(counts||{}).sort(([a],[b])=>a.localeCompare(b)));}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error(`Refusing to overwrite ${out}`);
  const reference=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-pop100-savedrng-10gen-20261023-01/report.json'),'utf8'));
  const hashesBefore=sourceHashes(),referenceHashes=reference.sourceHashes?.before;
  if(!reference.passed||referenceHashes?.['simulation.js']!==hashesBefore['simulation.js']||referenceHashes?.['neural-learning.js']!==hashesBefore['neural-learning.js'])
    throw Error('Passing same-source 100-agent ten-generation replay required');
  const raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await Progress.decode(raw.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||
     state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3'||reference.save.sha256!==saveSha)
    throw Error('Exact protected V3/Monza gen64 checkpoint required');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json'));
  const sim=new F.Simulation(data,{modelId:'v3',population:40,circuitId:'monza',circuits,seed:state.seed});
  Progress.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});Progress.restore(sim,state);
  sim.population=100;sim.running=true;
  const targetId=16,rows=[],generations=[],terminal=new Map();let ticks=0,lastLog=performance.now(),lastGeneration=sim.generation;
  const runStart=performance.now();
  sim.onTrialTick=s=>{
    if(s.generation===66){
      const car=s.cars.find(x=>x.id===targetId);
      if(car&&(s.ticks%30===0||!car.alive))rows.push(capture(car,s.ticks,s.track,s.graph));
      for(const c of s.cars)if(!c.alive&&!terminal.has(c.id))terminal.set(c.id,{id:c.id,progressM:c.bestProgress/(c.pixelsPerMeter||1),laps:c.laps,
        reason:c.reason||'',safe:F.isSafeLearningOutcome(c),fitness:c.fitness,outputs:c.outputs?.slice()||null});
    }
    if(performance.now()-lastLog>30000){lastLog=performance.now();console.log('V3_POP100_TRACE_PROGRESS '+JSON.stringify({generation:s.generation,ticks:s.ticks,alive:s.cars.filter(c=>c.alive).length,samples:rows.length}));}
  };
  while(sim.generation<67&&ticks<90000&&performance.now()-runStart<900000){
    const before=sim.generation;sim.tick();ticks++;
    if(sim.generation!==before){
      const outcomes=[...terminal.values()],safe=outcomes.filter(c=>c.safe),leader=safe.slice().sort((a,b)=>b.progressM-a.progressM||a.id-b.id)[0]||null;
      generations.push({generation:before,leader,safeAgentCount:safe.length,maxLaps:Math.max(0,...outcomes.map(c=>c.laps)),
        reasonCounts:sortedCounts(outcomes.reduce((counts,c)=>(counts[c.reason]=(counts[c.reason]||0)+1,counts),{}))});
      terminal.clear();
    }
  }
  // The terminal map is deliberately cleared after each completed generation.
  if(sim.generation!==67||generations.length!==3||terminal.size!==0||!generations[2]?.leader||rows.length===0)
    throw Error(`Expected three complete generations and a captured gen66 trace, got ${generations.length} generations, ${terminal.size} pending terminals, ${rows.length} samples`);
  const expected=reference.treatment.perGeneration[2],actual=generations[2];
  const matches=actual.leader?.id===expected.leader?.id&&Math.abs(actual.leader.progressM-expected.leader.progressM)<1e-9&&
    actual.leader.reason===expected.leader.reason&&actual.safeAgentCount===expected.safeAgentCount&&actual.maxLaps===expected.maxLaps&&
    JSON.stringify(actual.reasonCounts)===JSON.stringify(sortedCounts(expected.reasonCounts));
  const hashesAfter=sourceHashes(),sourcesUnchanged=JSON.stringify(hashesBefore)===JSON.stringify(hashesAfter),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;
  const last=rows.at(-1)||null,nearStop=rows.filter(r=>r.speedMps<2).slice(-20);
  const report={format:'male-cns-population100-gen66-neural-physical-trace-v1',appVersion:'5.6.0',passed:Boolean(matches&&sourcesUnchanged&&saveUnchanged),learningSucceeded:false,
    save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:state.seed,population:40,rewardRevision:state.rewardRevision},
    sourceHashes:{before:hashesBefore,after:hashesAfter,unchanged:sourcesUnchanged},
    result:{traceAgentId:targetId,terminalSummary:actual,matchedTenGenerationReference:matches,generations,
      capturedRows:rows.length,first:rows[0]||null,last,nearStop,trace:rows},
    method:'CPU-only exact replay of the protected V3/Monza gen64 checkpoint with its original RNG and in-memory population 100. Captures every 30 simulation ticks for the observed gen66 safe leader, including all 28 sensor channels, actual steer/gas/brake requests, readout contributions, car speed/acceleration, position, chainage, lateral offset and track width. The complete gen64–66 replay is checked against the deterministic ten-generation aggregate report before interpreting the trace.',
    boundary:'One seed, checkpoint, circuit, agent and terminal episode. Sensor-drive associations are correlational, not proof of causality. The diagnostic is not a learning success or a fix.'};
  if(!report.passed)throw Error('Terminal trace did not match the reference or changed protected files');
  fs.mkdirSync(out,{recursive:false});const reportPath=path.join(out,'report.json');
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('V3_POP100_TRACE_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:false,leader:actual.leader,
    safeAgentCount:actual.safeAgentCount,reasonCounts:actual.reasonCounts,traceSamples:rows.length,nearStop:nearStop.slice(-5),last,
    saveUnchanged,sourcesUnchanged,report:reportPath,reportSha256:sha(fs.readFileSync(reportPath))}));
  sim.running=false;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
