'use strict';
// Isolated, full-start V3/Monza counterfactual around the first neural brake-only
// context at speed. Unlike the earlier terminal-state RBF, this tests whether a
// small local motor-readout residual at brake onset changes real lap progress.
// Nothing is written to the save or production application.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const experimentTag=process.env.MALECNS_V3_GATE_TAG||'saved-v3-brake-onset-rbf-20261022-01';
if(!/^[a-z0-9-]+$/.test(experimentTag))throw Error('Invalid experiment tag');
const out=path.join(root,'.impeccable/review/learning-ml',experimentTag);
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Learning=require(path.join(root,'outputs/neural-learning.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const atanh=value=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,value)));
const rms=(a,b)=>Math.sqrt(a.reduce((sum,value,i)=>sum+(value-b[i])**2,0)/a.length);
const support=(features,centre,radius)=>{const d=rms(features,centre)/radius;return d>=1?0:(1-d)**4*(4*d+1);};
const LONGITUDINAL_LOGIT_DELTAS=(process.env.MALECNS_V3_GATE_DELTAS||'.10,.20,.35,.50').split(',').map(Number);
const STEERING_LOGIT_DELTAS=(process.env.MALECNS_V3_GATE_STEERING_DELTAS||'0').split(',').map(Number);
const captureDelta=process.env.MALECNS_V3_GATE_CAPTURE_DELTA==null?null:Number(process.env.MALECNS_V3_GATE_CAPTURE_DELTA);
if(!LONGITUDINAL_LOGIT_DELTAS.length||LONGITUDINAL_LOGIT_DELTAS.some(value=>!Number.isFinite(value)||Math.abs(value)>.8)||
  !STEERING_LOGIT_DELTAS.length||STEERING_LOGIT_DELTAS.some(value=>!Number.isFinite(value)||Math.abs(value)>.8))
  throw Error('Invalid motor logit delta set');
const MAX_TICKS=12000;
function createCar(track,graph,id,genome,rewardRevision){
  const car=F.makeCar(track,id,F.cloneGenome(genome),rewardRevision);
  car.footprintSensorsEnabled=true;car.brain=F.makeBrain(graph);
  const p=F.locate(track,car.x,car.y);car.rewardState.along=p.along;car.rewardState.x=car.x;car.rewardState.y=car.y;
  return car;
}
function runEpisode(track,graph,id,genome,rewardRevision,centres=[],delta=0,capture=false,lateCentres=[],lateDelta=0,steeringDelta=0,lateSteeringDelta=0){
  const car=createCar(track,graph,id,genome,rewardRevision),observations=[],gateStats={max:0,firstTick:null,activeControls:0,lateMax:0,lateFirstTick:null,lateActiveControls:0},trace=crypto.createHash('sha256');
  let commands=[0,0,0],ticks=0,peakSpeedMps=0;
  const ppm=track.pixelsPerMeter||1,mapCircuit=track.halfWidth<20,
    physicsGain=mapCircuit?F.MAP_PHYSICS_ADAPTER_GAIN:F.PHYSICS_ADAPTER_GAIN,
    launchBias=mapCircuit?F.MAP_NEURAL_MOTOR_LAUNCH_BIAS:F.NEURAL_MOTOR_LAUNCH_BIAS;
  while(car.alive&&ticks<MAX_TICKS){
    if(ticks%Learning.CONTROL_INTERVAL===0){
      car.inputs=F.sense(track,car);car.physicsInputs=F.physicsSense(car,track);car.sensorVector=car.inputs.concat(car.physicsInputs);
      const base=F.neuralStep(graph,car.brain,car.genome,car.sensorVector,true,true,physicsGain,launchBias),
        features=Array.from(graph.learning.nodes,index=>Math.tanh(8*(Number(car.brain.activity[index])||0)));
      const gate=centres.length?Math.max(0,...centres.map(c=>support(features,c.features,c.radius))):0,
        lateGate=lateCentres.length?Math.max(0,...lateCentres.map(c=>support(features,c.features,c.radius))):0;
      if(gate>0){gateStats.activeControls++;if(gateStats.firstTick===null)gateStats.firstTick=ticks;}
      if(lateGate>0){gateStats.lateActiveControls++;if(gateStats.lateFirstTick===null)gateStats.lateFirstTick=ticks;}
      gateStats.max=Math.max(gateStats.max,gate);
      gateStats.lateMax=Math.max(gateStats.lateMax,lateGate);
      if((gate>0&&(delta!==0||steeringDelta!==0))||(lateGate>0&&(lateDelta!==0||lateSteeringDelta!==0))){
        const steering=Math.tanh(atanh(base[0])+gate*steeringDelta+lateGate*lateSteeringDelta);
        const longitudinal=Math.tanh(atanh(base[1]-base[2])+gate*delta+lateGate*lateDelta);
        commands=[steering,Math.max(0,longitudinal),Math.max(0,-longitudinal)];
      }else commands=base;
      trace.update(JSON.stringify([ticks,car.bestProgress,commands])+'\n');
      if(capture){
        const pos=F.locate(track,car.x,car.y);
        observations.push({tick:ticks,progressM:car.bestProgress/ppm,alongM:pos.along/ppm,
          speedMps:car.vehicle?.speedMps??0,outputs:commands.slice(),effectiveOutputs:F.normalizeDriveCommands(commands),
          x:car.x,y:car.y,heading:car.heading,onRoad:F.onRoad(track,car.x,car.y),
          vehicle:F.Vehicle.telemetry(car.vehicle,true),features,earlyGate:gate,lateGate});
      }
    }
    F.drive(track,car,commands,F.DT);peakSpeedMps=Math.max(peakSpeedMps,car.vehicle?.speedMps??0);ticks++;
  }
  const censored=car.alive;
  if(censored)F.Rewards.finish(track,car,'limite replay diagnostico');
  return {result:{complete:!censored,censored,progressM:car.bestProgress/ppm,laps:car.laps,lapTimes:car.lapTimes.slice(),
    fitness:car.fitness,reason:censored?'limite replay diagnostico':car.reason,speedMps:car.vehicle?.speedMps??0,
    peakSpeedMps,outputs:car.outputs.slice(),controls:Math.ceil(ticks/Learning.CONTROL_INTERVAL),ticks},gate:gateStats,observations,traceSha256:trace.digest('hex')};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing experiment');
  const saveBytes=fs.readFileSync(savePath),saveSha=sha(saveBytes),decoded=await P.decode(saveBytes.toString('utf8'),'5.6.0'),
    state=structuredClone(decoded.payload.workers[0].state),controlPath=path.join(root,'.impeccable/review/learning-ml/saved-v3-current-telemetry-40x3-20261022-01/report.json'),
    control=JSON.parse(fs.readFileSync(controlPath,'utf8')),
    data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),
    circuits=require(path.join(root,'outputs/data/circuits.json'));
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||
    state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3'||control.save?.sha256!==saveSha||!control.passed||
    control.settings?.traceOnly!==true)throw Error('Exact verified V3/Monza generation-64 checkpoint is required');
    const runnerSha256=sha(fs.readFileSync(__filename)),
      sourceHashes={simulation:sha(fs.readFileSync(path.join(root,'outputs/simulation.js'))),learning:sha(fs.readFileSync(path.join(root,'outputs/neural-learning.js')))};
  if(sourceHashes.simulation!==control.sourceHashes.simulation||sourceHashes.learning!==control.sourceHashes.learning)
    throw Error('Current app sources differ from exact-replay telemetry evidence');
  let descriptor=null;
  try{
    descriptor=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
    P.validatePayload(decoded.payload,{graph:descriptor.graph,circuits:descriptor.circuits});P.restore(descriptor,state);
    const record=control.treatment.records.find(row=>row.generation===64),leader=record?.safeProgressLeader,id=Number(leader?.id),
      source=descriptor.cars.find(car=>car.id===id);
    if(!source||!source.footprintSensorsEnabled||!leader.trace?.length)throw Error('Exact saved leader telemetry is missing');
    const baseline=runEpisode(descriptor.track,descriptor.graph,id,source.genome,state.rewardRevision,[],0,true),expected={progressM:leader.progressM,laps:leader.laps,reason:leader.reason};
    if(!baseline.result.complete||baseline.result.progressM!==expected.progressM||baseline.result.laps!==expected.laps||baseline.result.reason!==expected.reason)
      throw Error('Single-agent full-start replay failed exact result verification');
    const firstBrakeOnly=baseline.observations.findIndex((row,index,rows)=>
      index+2<rows.length&&[rows[index],rows[index+1],rows[index+2]].every(s=>s.speedMps>=10&&s.outputs[1]<=.02&&s.outputs[2]>=.03));
    if(firstBrakeOnly<3)throw Error('No sustained brake-only neural context at speed was observed');
    const contextRows=[baseline.observations[firstBrakeOnly],baseline.observations[firstBrakeOnly+3],baseline.observations[firstBrakeOnly+6]],
      earlier=baseline.observations.slice(0,firstBrakeOnly),centres=contextRows.map(row=>{
        const nearest=Math.min(...earlier.map(previous=>rms(row.features,previous.features)));
        if(!(nearest>1e-8))throw Error('Brake-onset neural context overlaps earlier policy states');
        return {tick:row.tick,alongM:row.alongM,features:row.features.slice(),radius:.9*nearest,
          nearestEarlierDistance:nearest,baseOutputs:row.outputs.slice(),speedMps:row.speedMps};
      });
    const earlierActivations=earlier.map(row=>Math.max(...centres.map(c=>support(row.features,c.features,c.radius))));
    if(earlierActivations.some(value=>value!==0))throw Error('The local RBF unexpectedly changes pre-onset policy contexts');
    let variants,stageOne=null,lateGateInfo=null;
    if(process.env.MALECNS_V3_GATE_SECOND_STAGE==='1'){
      const firstDelta=Number(process.env.MALECNS_V3_GATE_FIRST_DELTA||'.113');
      if(!Number.isFinite(firstDelta)||Math.abs(firstDelta)>.8)throw Error('Invalid first-stage logit delta');
      stageOne=runEpisode(descriptor.track,descriptor.graph,id,source.genome,state.rewardRevision,centres,firstDelta,true);
      if(stageOne.result.progressM<baseline.result.progressM||stageOne.result.laps!==baseline.result.laps)
        throw Error('The validated first-stage local improvement did not reproduce');
      const moving=stageOne.observations.map((row,index)=>({row,index})).filter(({row})=>row.speedMps>.25),lastMovingIndex=moving.at(-1)?.index??-1,
        stationary=stageOne.observations.slice(lastMovingIndex+1).filter(row=>row.speedMps<=.25);
      if(lastMovingIndex<0||stationary.length<6)throw Error('Second distinct stalled neural context was not observed');
      const earlier=stageOne.observations.slice(0,lastMovingIndex+1),selected=[stationary[0],stationary[Math.floor(stationary.length/3)],stationary[Math.floor(2*stationary.length/3)],stationary.at(-1)],
        lateCentres=selected.map(row=>{const nearest=Math.min(...earlier.map(previous=>rms(row.features,previous.features)));if(!(nearest>1e-8))throw Error('Second stalled state overlaps earlier neural contexts');return {tick:row.tick,alongM:row.alongM,features:row.features.slice(),radius:.9*nearest,nearestEarlierDistance:nearest,baseOutputs:row.outputs.slice(),speedMps:row.speedMps};}),
        earlierActivations=earlier.map(row=>Math.max(...lateCentres.map(c=>support(row.features,c.features,c.radius))));
      if(earlierActivations.some(value=>value!==0))throw Error('Second gate is not exactly zero before the candidate stall');
      lateGateInfo={firstStageDelta:firstDelta,firstStageResult:stageOne.result,lastMovingControl:stageOne.observations[lastMovingIndex].tick,
        stalledControls:stationary.length,lateCentres:lateCentres.map(({features:_,...c})=>c),earlierMaximumActivation:Math.max(0,...earlierActivations)};
      variants=LONGITUDINAL_LOGIT_DELTAS.flatMap(delta=>STEERING_LOGIT_DELTAS.map(steeringDelta=>{
        const captureSecond=process.env.MALECNS_V3_GATE_SECOND_CAPTURE==='1'&&Number.isFinite(captureDelta)&&
          Math.abs(delta-captureDelta)<1e-12&&Math.abs(steeringDelta-Number(process.env.MALECNS_V3_GATE_CAPTURE_STEERING||'0'))<1e-12,
          run=runEpisode(descriptor.track,descriptor.graph,id,source.genome,state.rewardRevision,centres,firstDelta,captureSecond,lateCentres,delta,0,steeringDelta);
        if(captureSecond){
          const moving=run.observations.map((row,index)=>({row,index})).filter(({row})=>row.speedMps>.25),lastMovingIndex=moving.at(-1)?.index??-1,
            brief=row=>{if(!row)return null;const {features:_,...rest}=row;return rest;};
          run.trajectoryDiagnostics={lastMoving:brief(run.observations[lastMovingIndex]),
            approach:run.observations.slice(Math.max(0,lastMovingIndex-8),lastMovingIndex+1).map(brief),
            tail:run.observations.slice(-18).map(brief)};
        }
        console.log('V3_SECOND_NEURAL_GATE '+JSON.stringify({delta,steeringDelta,...run.result,gate:run.gate}));
        return {firstStageDelta:firstDelta,secondStageDelta:delta,secondStageSteeringLogitDelta:steeringDelta,...run};
      }));
    }else variants=LONGITUDINAL_LOGIT_DELTAS.flatMap(delta=>STEERING_LOGIT_DELTAS.map(steeringDelta=>{
      const captured=Number.isFinite(captureDelta)&&Math.abs(delta-captureDelta)<1e-12,
        run=runEpisode(descriptor.track,descriptor.graph,id,source.genome,state.rewardRevision,centres,delta,captured,[],0,steeringDelta);
      if(captured){
        const lastMoving=run.observations.filter(row=>row.speedMps>.25).at(-1)||null,
          late=run.observations.filter(row=>row.progressM>=Math.max(0,run.result.progressM-60)).filter((_,index)=>index%12===0);
        run.trajectoryDiagnostics={lastMoving,lateSamples:late.slice(-24),tail:run.observations.slice(-18)};
      }
      console.log('V3_BRAKE_ONSET_RBF '+JSON.stringify({delta,steeringDelta,...run.result,gate:run.gate}));
      return {logitDelta:delta,steeringLogitDelta:steeringDelta,...run};
    }));
    const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,
      report={format:'male-cns-saved-v3-brake-onset-neural-rbf-v1',appVersion:'5.6.0',passed:saveUnchanged&&baseline.result.complete&&baseline.result.progressM===expected.progressM,
        learningSucceeded:variants.some(row=>row.result.complete&&row.result.laps>=2),save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
        baseline:{...baseline.result,traceSha256:baseline.traceSha256,expected,firstBrakeOnlyControl:baseline.observations[firstBrakeOnly].tick,
          firstBrakeOnlyAlongM:baseline.observations[firstBrakeOnly].alongM,firstBrakeOnlySpeedMps:baseline.observations[firstBrakeOnly].speedMps,
          firstBrakeOnlyOutputs:baseline.observations[firstBrakeOnly].outputs},
        gate:{features:'64 actual descending-neuron readout activities',centres:centres.map(({features:_,...c})=>c),
          earlierMaximumActivation:Math.max(0,...earlierActivations),targets:'first sustained neural brake-only state at speed and two later naturally observed neural contexts',
          noRouteSpeedLapOrClockInput:true},
        settings:{runnerSha256,longitudinalLogitDeltas:LONGITUDINAL_LOGIT_DELTAS,steeringLogitDeltas:STEERING_LOGIT_DELTAS,capturedDelta:captureDelta,maxTicks:MAX_TICKS},
        stagedSecondGate:lateGateInfo,stageOne:stageOne?.result||null,
        variants:variants.map(({observations,...row})=>row),sourceHashes,
        method:'Exact full-start V3/Monza replay of the saved leader; four small longitudinal-logit residual magnitudes are activated only by a compact-support RBF over actual descending-neuron states sampled at the first sustained brake-only-at-speed transition. Gate support is exactly zero over all earlier baseline states. Each candidate is evaluated as a full physical trajectory; these are diagnostic counterfactuals, not trained or promoted drivers.',
        boundary:'No teacher actions, prescribed route, position/time inputs, reward or physics changes. Original save, app source, model weights, version, release, portable and installer remain untouched.'};
    if(!report.passed||!saveUnchanged)throw Error('Baseline or save integrity verification failed');
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('V3_BRAKE_ONSET_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,baseline:report.baseline,
      gate:report.gate,variants:variants.map(row=>({delta:row.logitDelta??row.secondStageDelta,steeringDelta:row.steeringLogitDelta??row.secondStageSteeringLogitDelta,...row.result,gate:row.gate})),report:path.join(out,'report.json')}));
  }finally{if(descriptor)descriptor.running=false;}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
