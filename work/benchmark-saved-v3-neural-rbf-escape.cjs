'use strict';
// Disposable V3/Monza experiment: a compact-support residual is gated only by
// the real 64-neuron descending readout. The gate is zero on every previously
// observed pre-stop neural context; only the stalled neural context can change.
// This is a diagnostic policy candidate, never a route controller or promotion.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_V3_RBF_ESCAPE_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-neural-rbf-escape-20261021-03'));
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),
  Learning=require(path.join(root,'outputs/neural-learning.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const atanh=value=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,value)));
const rms=(a,b)=>Math.sqrt(a.reduce((sum,value,i)=>sum+(value-b[i])**2,0)/a.length);
const support=(features,centre,radius)=>{const d=rms(features,centre)/radius;return d>=1?0:(1-d)**4*(4*d+1);};
const STEER_TARGETS=[0],LONGITUDINAL_TARGETS=[.95],MAX_TICKS=12000;
function positionSummary(track,car){const p=F.locate(track,car.x,car.y),ppm=track.pixelsPerMeter||1;return {progressM:car.bestProgress/ppm,alongM:p.along/ppm,speedMps:car.vehicle?.speedMps??0};}
function createCar(track,graph,id,genome,rewardRevision){
  const car=F.makeCar(track,id,F.cloneGenome(genome),rewardRevision);
  car.footprintSensorsEnabled=true;car.brain=F.makeBrain(graph);
  const p=F.locate(track,car.x,car.y);car.rewardState.along=p.along;car.rewardState.x=car.x;car.rewardState.y=car.y;
  return car;
}
function runEpisode(track,graph,id,genome,rewardRevision,centres=[],variant=null,capture=false){
  const car=createCar(track,graph,id,genome,rewardRevision),observations=[],gateStats={max:0,firstTick:null,activeControls:0,latchedControls:0,latchStartTick:null,latchEndTick:null},trace=crypto.createHash('sha256');
  let commands=[0,0,0],ticks=0,latched=false,escapeUsed=false,peakSpeedMps=0;
  const ppm=track.pixelsPerMeter||1,mapCircuit=track.halfWidth<20,
    physicsGain=mapCircuit?F.MAP_PHYSICS_ADAPTER_GAIN:F.PHYSICS_ADAPTER_GAIN,
    launchBias=mapCircuit?F.MAP_NEURAL_MOTOR_LAUNCH_BIAS:F.NEURAL_MOTOR_LAUNCH_BIAS;
  while(car.alive&&ticks<MAX_TICKS){
    if(ticks%Learning.CONTROL_INTERVAL===0){
      car.inputs=F.sense(track,car);car.physicsInputs=F.physicsSense(car,track);car.sensorVector=car.inputs.concat(car.physicsInputs);
      const base=F.neuralStep(graph,car.brain,car.genome,car.sensorVector,true,true,physicsGain,launchBias),
        features=Array.from(graph.learning.nodes,index=>Math.tanh(8*(Number(car.brain.activity[index])||0)));
      let gate=0;
      if(variant&&centres.length)gate=Math.max(0,...centres.map(c=>support(features,c.features,c.radius)));
      if(variant?.latchUntilSpeedMps&&!escapeUsed&&gate>0){latched=true;escapeUsed=true;gateStats.latchStartTick=ticks;}
      if(latched&&car.vehicle.speedMps>=variant.latchUntilSpeedMps){latched=false;gateStats.latchEndTick=ticks;}
      if(gate>0){gateStats.activeControls++;if(gateStats.firstTick===null)gateStats.firstTick=ticks;}
      gateStats.max=Math.max(gateStats.max,gate);
      if(latched){gateStats.latchedControls++;commands=[base[0],variant.launchThrottle,0];}
      else if(variant&&gate>0){
        const longitudinal=base[1]-base[2],steering=Math.tanh(atanh(base[0])+gate*variant.steerDelta),
          correctedLongitudinal=Math.tanh(atanh(longitudinal)+gate*variant.longitudinalDelta);
        commands=[steering,Math.max(0,correctedLongitudinal),Math.max(0,-correctedLongitudinal)];
      }else commands=base;
      trace.update(JSON.stringify([ticks,car.bestProgress,commands])+'\n');
      if(capture){const pos=positionSummary(track,car);observations.push({tick:ticks,...pos,outputs:commands.slice(),features,latched});}
    }
    F.drive(track,car,commands,F.DT);peakSpeedMps=Math.max(peakSpeedMps,car.vehicle?.speedMps??0);ticks++;
  }
  const censored=car.alive;
  if(censored)F.Rewards.finish(track,car,'limite replay diagnostico');
  return {result:{complete:!censored,censored,progressM:car.bestProgress/ppm,laps:car.laps,lapTimes:car.lapTimes.slice(),fitness:car.fitness,
    reason:censored?'limite replay diagnostico':car.reason,speedMps:car.vehicle?.speedMps??0,peakSpeedMps,outputs:car.outputs.slice(),controls:Math.ceil(ticks/Learning.CONTROL_INTERVAL),ticks},
    gate:gateStats,observations,traceSha256:trace.digest('hex')};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing neural-RBF experiment');
  const saveBytes=fs.readFileSync(savePath),saveSha=sha(saveBytes),decoded=await P.decode(saveBytes.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state),
    controlPath=path.join(root,'.impeccable/review/learning-ml/saved-v3-targeted-terminal-telemetry-3gen-20261021-01/report.json'),
    control=JSON.parse(fs.readFileSync(controlPath,'utf8')),
    data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json'));
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||
    state.rewardRevision!=='progress-3'||control.save?.sha256!==saveSha||!control.passed||control.settings?.traceOnly!==true||control.settings?.treatmentOnly!==true)
    throw Error('Exact verified V3/Monza generation-64 checkpoint is required');
  const sourceHashes={simulation:sha(fs.readFileSync(path.join(root,'outputs/simulation.js'))),learning:sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js')))};
  if(sourceHashes.simulation!==control.sourceHashes.simulation||sourceHashes.learning!==control.sourceHashes.learning)
    throw Error('Current application sources differ from the protected exact-replay evidence');
  let descriptor=null;
  try{
    descriptor=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
    P.validatePayload(decoded.payload,{graph:descriptor.graph,circuits:descriptor.circuits});P.restore(descriptor,state);
    const record=control.treatment.records.find(row=>row.generation===64),leader=record?.safeProgressLeader,id=Number(leader?.id),source=descriptor.cars.find(car=>car.id===id),
      telemetryAnchor=leader?.trace?.find(row=>row.tick===4002),expected={progressM:leader?.progressM,laps:leader?.laps,reason:leader?.reason};
    if(!source||!source.footprintSensorsEnabled||!telemetryAnchor||!Array.isArray(telemetryAnchor.neuralFeatures))throw Error('Exact saved leader or current-source neural telemetry is missing');
    const baseline=runEpisode(descriptor.track,descriptor.graph,id,source.genome,state.rewardRevision,[],null,true);
    if(!baseline.result.complete||baseline.result.progressM!==expected.progressM||baseline.result.laps!==expected.laps||baseline.result.reason!==expected.reason)
      throw Error('Single-agent baseline did not reproduce the exact saved leader terminal result');
    const baselineByTick=new Map(baseline.observations.map(row=>[row.tick,row])),alignedSamples=leader.trace.map(reference=>({reference,actual:baselineByTick.get(reference.tick)})).filter(row=>row.actual),
      replayAgreement={matchedSamples:alignedSamples.length,maxFeatureDelta:Math.max(...alignedSamples.map(({reference,actual})=>Math.max(...actual.features.map((value,index)=>Math.abs(value-reference.neuralFeatures[index]))))),
        maxOutputDelta:Math.max(...alignedSamples.map(({reference,actual})=>Math.max(...actual.outputs.map((value,index)=>Math.abs(value-reference.outputs[index]))))),
        maxProgressDeltaM:Math.max(...alignedSamples.map(({reference,actual})=>Math.abs(actual.progressM-reference.bestProgressM))),
        maxSpeedDeltaMps:Math.max(...alignedSamples.map(({reference,actual})=>Math.abs(actual.speedMps-reference.speedMps)))};
    if(!alignedSamples.length||replayAgreement.maxProgressDeltaM>.1||replayAgreement.maxSpeedDeltaMps>.2)
      throw Error(`Single-agent physical baseline diverges beyond validation tolerances from protected current-source telemetry: ${JSON.stringify(replayAgreement)}`);
    const moving=baseline.observations.map((row,index)=>({row,index})).filter(item=>item.row.speedMps>.25),lastMovingIndex=moving.at(-1)?.index??-1,
      stalled=baseline.observations.slice(lastMovingIndex+1).filter(row=>row.speedMps<=.25);
    if(lastMovingIndex<0||stalled.length<12)throw Error('A real moving-to-stationary neural transition was not observed');
    const protectedRows=baseline.observations.slice(0,lastMovingIndex+1),centres=stalled.slice(-12).map(row=>{
      const nearest=Math.min(...protectedRows.map(previous=>rms(row.features,previous.features)));
      if(!(nearest>1e-8))throw Error(`Stationary context ${row.tick} overlaps an earlier real neural state`);
      return {tick:row.tick,features:row.features.slice(),radius:.9*nearest,nearestProtectedDistance:nearest,baseSteer:row.outputs[0],baseLongitudinal:row.outputs[1]-row.outputs[2]};
    });
    const preTargetActivations=protectedRows.map(row=>Math.max(...centres.map(c=>support(row.features,c.features,c.radius)))),
      targetActivations=stalled.slice(-12).map(row=>Math.max(...centres.map(c=>support(row.features,c.features,c.radius))));
    if(preTargetActivations.some(value=>value>0)||!targetActivations.some(value=>value>0))throw Error('Compact support is not zero on the protected pre-stop trajectory');
    const terminal=baseline.observations.at(-1);if(!terminal)throw Error('Terminal neural state is missing');
    const variants=[];
    for(const steerTarget of STEER_TARGETS)for(const longitudinalTarget of LONGITUDINAL_TARGETS){
      const variant={name:`one-shot-launch-${.85}-mps-${2}`,steerTarget,longitudinalTarget,latchUntilSpeedMps:2,launchThrottle:.85,
        steerDelta:atanh(steerTarget)-atanh(terminal.outputs[0]),longitudinalDelta:atanh(longitudinalTarget)-atanh(terminal.outputs[1]-terminal.outputs[2])};
      const run=runEpisode(descriptor.track,descriptor.graph,id,source.genome,state.rewardRevision,centres,variant,false);
      variants.push({...variant,...run});
      console.log('V3_NEURAL_RBF_CANDIDATE '+JSON.stringify({name:variant.name,...run.result,gate:run.gate}));
    }
    const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,
      report={format:'male-cns-saved-v3-neural-rbf-escape-v1',appVersion:'5.6.0',passed:baseline.result.complete&&baseline.result.progressM===expected.progressM&&
        preTargetActivations.every(value=>value===0)&&saveUnchanged,
        learningSucceeded:variants.some(row=>row.result.complete&&row.result.laps>=2),save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
        settings:{leaderId:id,readoutNeurons:descriptor.graph.learning.nodes.length,naturalNeuralControlRateHz:60/Learning.CONTROL_INTERVAL,candidateCount:variants.length,
          maxTicks:MAX_TICKS,targets:{steering:STEER_TARGETS,longitudinal:LONGITUDINAL_TARGETS},runtime:'Node 24.19.0 current CPU V3 solver; same runtime as protected telemetry',
          diagnosticPulse:{throttle:.85,releaseSpeedMps:2,oneShot:true}},
        baseline:{...baseline.result,traceSha256:baseline.traceSha256,progressSpeedMatchSavedTelemetry:true,neuralDynamicsMatchSavedPopulation:false,protectedTelemetryAgreement:replayAgreement,
          referenceTick4002Outputs:{tick:telemetryAnchor.tick,outputs:telemetryAnchor.outputs},
          movingToStop:{lastMovingTick:baseline.observations[lastMovingIndex].tick,lastMovingProgressM:baseline.observations[lastMovingIndex].progressM,
            terminalProgressM:terminal.progressM,stationaryControls:stalled.length,terminalOutputs:terminal.outputs}},
        gate:{inputs:'64 current descending-neuron readout activities only',centres:centres.map(({tick,radius,nearestProtectedDistance,baseSteer,baseLongitudinal})=>({tick,radius,nearestProtectedDistance,baseSteer,baseLongitudinal})),
          preTargetMaximumActivation:Math.max(0,...preTargetActivations),targetActivationRange:[Math.min(...targetActivations),Math.max(...targetActivations)],
          rule:'compact-support RBF; every centre radius is 90% of its nearest observed pre-stop neuronal context; residual changes only the two existing neural motor logits',
          neuralGateOnly:true,routePositionNotUsed:true},variants:variants.map(({observations,...row})=>row),sourceHashes,
        method:'Exact saved V3/Monza policy and one verified baseline. A one-shot 0.85 throttle pulse is triggered only by a compact-support gate over actual descending-neuron readout features; its end condition is speed above 2 m/s. Gate support is proven zero across all earlier baseline control states, including initial stationary controls. This is a physics/escape diagnostic only, not learned behavior, a training result, or a promoted driver. No route position, lap, clock, teacher action, reward change, physics change, save migration, or production edit enters the correction.',
        boundary:'One saved policy, one start, one seed and Monza. Even a candidate that escapes the stall must still be learned across generations/seeds and complete two laps before any app integration. No save, application source, version, tag, release, portable, or installer was changed.'};
    if(!report.passed||!saveUnchanged)throw Error('Baseline, support or save-integrity verification failed');
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('V3_NEURAL_RBF_ESCAPE_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,baseline:report.baseline,
      candidates:variants.map(row=>({name:row.name,...row.result,gate:row.gate})),report:path.join(out,'report.json')}));
  }finally{if(descriptor)descriptor.running=false;}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
