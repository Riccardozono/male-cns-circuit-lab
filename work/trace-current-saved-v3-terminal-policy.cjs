'use strict';
// Read-only V3/Monza trace against the current working source and user save.
// Captures actual sensors, descending-neuron readout contributions and outputs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-terminal-policy-current-source-20261023-01');
const F=require(path.join(root,'outputs/simulation.js'));
const Progress=require(path.join(root,'outputs/progress-save.js'));
const Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourceHashes=()=>Object.fromEntries(['simulation.js','neural-learning.js','vehicle-992.js','rewards.js','progress-save.js'].map(file=>
  [file,sha(fs.readFileSync(path.join(root,'outputs',file)))]));
const SENSOR_LABELS=['raggio -1.25 rad','raggio -0.80 rad','raggio -0.40 rad','raggio frontale','raggio +0.40 rad','raggio +0.80 rad','raggio +1.25 rad','raggio esterno -1.45 rad','raggio esterno -1.05 rad','raggio esterno +1.05 rad','raggio esterno +1.45 rad','velocità','G longitudinale','G laterale','G totale','angolo di deriva','velocità d’imbardata','trasferimento di carico','asimmetria strada vicina','asimmetria strada lontana','spazio frontale paraurti','larghezza disponibile','RPM','marcia','slittamento posteriore','slittamento anteriore','temperatura gomma','temperatura freni'];
function motorReadout(graph,car){
  const genome=car.genome,p=graph.learning,weights=genome.policyWeights;
  let sum=0,signal=0;const scale=1/Math.sqrt(p.nodes.length),contributions=[];
  for(let j=0;j<p.nodes.length;j++){
    const node=p.nodes[j],activity=Number(car.brain.activity[node])||0;signal=Math.max(signal,Math.abs(activity));
    const feature=Math.tanh(8*activity),weight=weights[p.readoutOffset+j*2+1],contribution=feature*weight*scale;
    sum+=contribution;
    if(Math.abs(contribution)>1e-7)contributions.push({node,bodyId:Number(graph.bodyIds[node]),feature,weight,contribution});
  }
  const bias=weights.at(-1),logit=sum+bias,longitudinal=signal<1e-7?0:Math.tanh(logit);
  const sensorDrives=Array.from({length:F.SENSOR_COUNT},()=>0);
  for(let k=0;k<graph.inputs.length;k++)sensorDrives[k%F.SENSOR_COUNT]+=Math.abs(F.sensorDrive(graph,genome,car.sensorVector,k,F.MAP_PHYSICS_ADAPTER_GAIN));
  return {activeSignal:signal,readoutSum:sum,bias,longitudinalLogit:logit,predictedLongitudinal:longitudinal,
    commands:F.neuralOutputsFromBrain(graph,car.brain,genome),
    topMotorContributors:contributions.sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution)).slice(0,8),
    sensorDriveRanking:sensorDrives.map((drive,channel)=>({channel,label:SENSOR_LABELS[channel],drive})).sort((a,b)=>b.drive-a.drive).slice(0,8)};
}
function capture(car,tick,graph){
  const v=car.vehicle||{};
  return {tick,progressM:car.bestProgress/(car.pixelsPerMeter||1),alongM:(car.rewardState?.along||0)/(car.pixelsPerMeter||1),
    speedMps:v.speedMps??car.speed??0,longitudinalMps:v.u??null,lateralMps:v.v??null,yawRate:v.r??car.yawRate??0,
    axMps2:v.ax??null,ayMps2:v.ay??null,gear:v.gear??null,rpm:v.rpm??null,
    steer:car.outputs?.[0]??null,gas:car.outputs?.[1]??null,brake:car.outputs?.[2]??null,
    sensorValues:car.sensorVector.map((value,channel)=>({channel,label:SENSOR_LABELS[channel]||`sensore ${channel}`,value})),
    readout:motorReadout(graph,car)};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error(`Refusing to overwrite ${out}`);
  const reference=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-control-rate-rescaled-20261023-01/report.json'),'utf8'));
  const referenceHashes=reference.sourceHashes?.before,hashesBefore=sourceHashes();
  if(!reference.passed||reference.save?.sha256!==sha(fs.readFileSync(savePath))||reference.settings?.baselineControlRateHz!==10||
     referenceHashes?.simulation!==hashesBefore['simulation.js']||referenceHashes?.learning!==hashesBefore['neural-learning.js'])
    throw Error('A passing current-source 10 Hz control on the exact save is required');
  const raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await Progress.decode(raw.toString('utf8'),'5.6.0');
  const state=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||
     state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3')
    throw Error('Exact protected V3/Monza generation-64 checkpoint required');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')));
  const circuits=require(path.join(root,'outputs/data/circuits.json'));
  const sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  Progress.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});
  Progress.restore(sim,state);sim.running=true;
  const targetId=Number(reference.comparison.baseline10Hz.leader.id),rows=[],terminal=new Map();
  const initialGeneration=sim.generation;let ticks=0,lastLog=performance.now();
  sim.onTrialTick=s=>{
    const car=s.cars.find(x=>x.id===targetId);
    if(car&&(s.ticks>=3600&&(s.ticks%5===0||!car.alive)))rows.push(capture(car,s.ticks,s.graph));
    for(const c of s.cars)if(!c.alive&&!terminal.has(c.id))terminal.set(c.id,{id:c.id,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),laps:c.laps,reason:c.reason||'',safe:F.isSafeLearningOutcome(c)});
    if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('TERMINAL_POLICY_TRACE_PROGRESS '+JSON.stringify({generation:s.generation,ticks:s.ticks,alive:s.cars.filter(c=>c.alive).length,samples:rows.length}));}
  };
  while(sim.generation===initialGeneration&&ticks<14000){sim.tick();ticks++;}
  if(sim.generation===initialGeneration||terminal.size!==state.population)throw Error('Natural generation-64 replay did not finish completely');
  const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(c=>c.safe),leader=safe.slice().sort((a,b)=>b.progressM-a.progressM||a.id-b.id)[0];
  const reasons=outcomes.reduce((counts,c)=>(counts[c.reason]=(counts[c.reason]||0)+1,counts),{}),expected=reference.comparison.baseline10Hz;
  const baselineMatches=leader?.id===expected.leader.id&&Math.abs(leader.progressM-expected.leader.progressM)<1e-9&&
    leader.laps===expected.laps&&leader.reason===expected.leader.reason&&safe.length===expected.safeAgentCount&&JSON.stringify(reasons)===JSON.stringify(expected.terminalReasonCounts);
  const hashesAfter=sourceHashes(),sourcesUnchanged=JSON.stringify(hashesBefore)===JSON.stringify(hashesAfter),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;
  const last=rows.at(-1)||null,nearStop=rows.filter(r=>r.speedMps<1).slice(-12);
  const report={format:'male-cns-current-saved-v3-terminal-policy-trace-v1',appVersion:'5.6.0',
    passed:Boolean(baselineMatches&&sourcesUnchanged&&saveUnchanged),learningSucceeded:false,
    save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:state.generation,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
    sourceHashes:{before:hashesBefore,after:hashesAfter,unchanged:sourcesUnchanged},
    result:{ticks,selectedId:targetId,leader,safeAgentCount:safe.length,terminalReasonCounts:reasons,matchedPaired10HzControl:baselineMatches,
      capturedRows:rows.length,first:rows[0]||null,last,nearStop,trace:rows},
    method:'CPU-only natural replay of the user save under current working application sources. Samples the real selected leader every five physics ticks during the final section; records all 28 sensor values, actual motor outputs, recurrent neural longitudinal readout, neuron contributions and vehicle motion. The reproduced generation is checked against the paired 10 Hz result from the immediately preceding benchmark. No changes to app code, reward, physics, training data or save.',
    boundary:'One saved checkpoint and one seed/circuit. Correlations between sensor drive and learned output do not prove a sensor is causal. This is a policy-state diagnosis, not a learning result or a correction.'};
  if(!report.passed)throw Error('Current-source terminal replay, source/save integrity or paired-control match failed');
  fs.mkdirSync(out,{recursive:false});const reportPath=path.join(out,'report.json');
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('TERMINAL_POLICY_TRACE_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,
    leader:report.result.leader,safeAgentCount:report.result.safeAgentCount,reasons:report.result.terminalReasonCounts,
    samples:rows.length,nearStop:nearStop.slice(-3),last:report.result.last,report:reportPath,reportSha256:sha(fs.readFileSync(reportPath))}));
  sim.running=false;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
