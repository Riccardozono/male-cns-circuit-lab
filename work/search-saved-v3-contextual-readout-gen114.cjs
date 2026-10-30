'use strict';
// Research-only search for a sensory-context motor readout near the saved
// V3/Monza gen.114 brake-onset state. Progress selects training examples only;
// inference uses exclusively the current MaleCNS descending-neuron activity.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');if(i<3||!s.startsWith('--'))throw Error('Use --name=value');return [s.slice(2,i),s.slice(i+1)];}));
const input=path.resolve(root,args.save||'.impeccable/review/learning-ml/saved-v3-gen109-current-es-batch-5gen-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen114.malecns-save');
const tracePath=path.resolve(root,args.trace||'.impeccable/review/learning-ml/saved-v3-brake-trace-gen114-20261022-01/report.json');
const out=path.resolve(root,args.out||'.impeccable/review/learning-ml/search-saved-v3-contextual-readout-gen114-20261022-01');
const F=require('../outputs/simulation.js'),P=require('../outputs/progress-save.js'),Legacy=require('../outputs/legacy-models.js'),Learning=require('../outputs/neural-learning.js');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),atanh=v=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,v)));
const rms=(a,b)=>Math.sqrt(a.reduce((sum,v,i)=>sum+(v-b[i])**2,0)/a.length);
const support=(features,centre,radius)=>{const d=rms(features,centre)/radius;return d>=1?0:(1-d)**4*(4*d+1);};
const steerDeltas=[-.06,-.03,0,.03,.06],longitudinalDeltas=[-.06,-.03,0,.03,.06],MAX_TICKS=12000;
function createCar(track,graph,id,genome,rewardRevision){
  const car=F.makeCar(track,id,F.cloneGenome(genome),rewardRevision);car.footprintSensorsEnabled=true;car.brain=F.makeBrain(graph);
  const p=F.locate(track,car.x,car.y);car.rewardState.along=p.along;car.rewardState.x=car.x;car.rewardState.y=car.y;return car;
}
function runEpisode(track,graph,id,genome,rewardRevision,centres=[],steerDelta=0,longitudinalDelta=0,capture=false){
  const car=createCar(track,graph,id,genome,rewardRevision),observations=[],gateStats={max:0,firstTick:null,activeControls:0},trace=crypto.createHash('sha256');
  let commands=[0,0,0],ticks=0,peakSpeedMps=0;
  const ppm=track.pixelsPerMeter||1,mapCircuit=track.halfWidth<20,
    physicsGain=mapCircuit?F.MAP_PHYSICS_ADAPTER_GAIN:F.PHYSICS_ADAPTER_GAIN,
    launchBias=mapCircuit?F.MAP_NEURAL_MOTOR_LAUNCH_BIAS:F.NEURAL_MOTOR_LAUNCH_BIAS;
  while(car.alive&&ticks<MAX_TICKS){
    if(ticks%Learning.CONTROL_INTERVAL===0){
      car.inputs=F.sense(track,car);car.physicsInputs=F.physicsSense(car,track);car.sensorVector=car.inputs.concat(car.physicsInputs);
      const base=F.neuralStep(graph,car.brain,car.genome,car.sensorVector,true,true,physicsGain,launchBias),
        features=Array.from(graph.learning.nodes,index=>Math.tanh(8*(Number(car.brain.activity[index])||0))),
        gate=centres.length?Math.max(0,...centres.map(c=>support(features,c.features,c.radius))):0;
      if(gate>0){gateStats.activeControls++;if(gateStats.firstTick===null)gateStats.firstTick=ticks;}
      gateStats.max=Math.max(gateStats.max,gate);
      if(gate>0&&(steerDelta!==0||longitudinalDelta!==0)){
        const steering=Math.tanh(atanh(base[0])+gate*steerDelta),longitudinal=Math.tanh(atanh(base[1]-base[2])+gate*longitudinalDelta);
        commands=[steering,Math.max(0,longitudinal),Math.max(0,-longitudinal)];
      }else commands=base;
      trace.update(JSON.stringify([ticks,car.bestProgress,commands])+'\n');
      if(capture){const pos=F.locate(track,car.x,car.y);observations.push({tick:ticks,progressM:car.bestProgress/ppm,alongM:pos.along/ppm,
        speedMps:car.vehicle?.speedMps??0,outputs:commands.slice(),x:car.x,y:car.y,heading:car.heading,onRoad:F.onRoad(track,car.x,car.y),
        features,gate});}
    }
    F.drive(track,car,commands,F.DT);peakSpeedMps=Math.max(peakSpeedMps,car.vehicle?.speedMps??0);ticks++;
  }
  const censored=car.alive;if(censored)F.Rewards.finish(track,car,'limite replay diagnostico');
  return {result:{complete:!censored,censored,safe:F.isSafeLearningOutcome(car),progressM:car.bestProgress/ppm,laps:car.laps,lapTimes:car.lapTimes.slice(),
    fitness:car.fitness,reason:censored?'limite replay diagnostico':car.reason,speedMps:car.vehicle?.speedMps??0,peakSpeedMps,
    outputs:car.outputs.slice(),controls:Math.ceil(ticks/Learning.CONTROL_INTERVAL),ticks},gate:gateStats,observations,traceSha256:trace.digest('hex')};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error(`Refusing to overwrite ${out}`);
  const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js'],
    sourceHashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))])),before=sourceHashes(),
    inputBytes=fs.readFileSync(input),inputSha=sha(inputBytes),decoded=await P.decode(inputBytes.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state,
    trace=JSON.parse(fs.readFileSync(tracePath,'utf8')),traceSha=sha(fs.readFileSync(tracePath)),saveUnchanged=()=>sha(fs.readFileSync(input))===inputSha,
    data=Legacy.tagV3(require('../outputs/data/connectome.json')),circuits=require('../outputs/data/circuits.json');
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==114||state.population!==100||
    state.rewardRevision!=='progress-3'||!trace.passed||trace.input?.sha256!==inputSha||trace.baseline?.laps!==0)
    throw Error('Verified V3/Monza gen.114 checkpoint and matched telemetry trace required');
  const descriptor=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  P.validatePayload(decoded.payload,{graph:descriptor.graph,circuits:descriptor.circuits});P.restore(descriptor,structuredClone(state));
  if(!P.capture||descriptor.cars.length!==100)throw Error('Checkpoint population did not restore');
  const id=0,source=descriptor.cars[id];if(!source||!source.genome.policyWeights)throw Error('Saved selected policy is missing');
  const baseline=runEpisode(descriptor.track,descriptor.graph,id,source.genome,state.rewardRevision,[],0,0,true),expected=trace.baseline;
  if(!baseline.result.complete||!baseline.result.safe||baseline.result.progressM!==expected.progressM||baseline.result.laps!==expected.laps||baseline.result.reason!==expected.reason)
    throw Error('The current source failed to reproduce the matched gen.114 safe leader');
  const firstBrakeOnly=baseline.observations.findIndex((row,index,rows)=>index+2<rows.length&&
    [rows[index],rows[index+1],rows[index+2]].every(s=>s.speedMps>=10&&s.outputs[1]<=.02&&s.outputs[2]>=.03));
  if(firstBrakeOnly<3)throw Error('No sustained neural brake-only-at-speed state was observed');
  const onsetProgress=baseline.observations[firstBrakeOnly].progressM,
    targetProgress=Array.from({length:8},(_,i)=>onsetProgress+i*15).filter(value=>value<baseline.result.progressM),
    contextRows=targetProgress.map(target=>baseline.observations.reduce((best,row)=>Math.abs(row.progressM-target)<Math.abs(best.progressM-target)?row:best,baseline.observations[0]))
      .filter((row,index,rows)=>rows.findIndex(other=>other.tick===row.tick)===index),
    earlier=baseline.observations.slice(0,firstBrakeOnly),centres=contextRows.map(row=>{
      const nearest=Math.min(...earlier.map(previous=>rms(row.features,previous.features)));
      if(!(nearest>1e-8))throw Error('Brake-onset neural context overlaps earlier policy states');
      return {tick:row.tick,progressM:row.progressM,features:row.features.slice(),radius:.9*nearest,nearestEarlierDistance:nearest,baseOutputs:row.outputs.slice(),speedMps:row.speedMps};
    }),earlierActivations=earlier.map(row=>Math.max(...centres.map(c=>support(row.features,c.features,c.radius))));
  if(earlierActivations.some(value=>value!==0))throw Error('Contextual residual changed a pre-brake policy state');
  const variants=[];
  for(const longitudinalDelta of longitudinalDeltas)for(const steerDelta of steerDeltas){
    const run=runEpisode(descriptor.track,descriptor.graph,id,source.genome,state.rewardRevision,centres,steerDelta,longitudinalDelta,false),
      row={steerDelta,longitudinalDelta,...run};variants.push(row);
    console.log('CONTEXT_READOUT_CANDIDATE '+JSON.stringify({steerDelta,longitudinalDelta,...run.result,gate:run.gate}));
  }
  const after=sourceHashes(),report={format:'male-cns-saved-v3-contextual-readout-search-v1',appVersion:'5.6.0',passed:saveUnchanged()&&
    JSON.stringify(before)===JSON.stringify(after)&&baseline.result.complete&&baseline.result.progressM===expected.progressM&&earlierActivations.every(value=>value===0),
    learningSucceeded:variants.some(row=>row.result.safe&&row.result.laps>=2),input:{file:input,sha256:inputSha,unchanged:saveUnchanged(),model:'V3',circuit:'Monza',generation:114,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
    baseline:{...baseline.result,traceSha256:baseline.traceSha256,traceReport:tracePath,traceReportSha256:traceSha,firstBrakeOnlyControl:baseline.observations[firstBrakeOnly].tick,
      firstBrakeOnlyProgressM:baseline.observations[firstBrakeOnly].progressM,firstBrakeOnlySpeedMps:baseline.observations[firstBrakeOnly].speedMps,
      firstBrakeOnlyOutputs:baseline.observations[firstBrakeOnly].outputs},
    gate:{inputs:'64 current descending-neuron readout activities only',centres:centres.map(({features:_,...c})=>c),
      sampledProgressRangeM:[Math.min(...centres.map(c=>c.progressM)),Math.max(...centres.map(c=>c.progressM))],
      earlierMaximumActivation:Math.max(0,...earlierActivations),
      longitudinalLogitDeltas:longitudinalDeltas,steeringLogitDeltas:steerDeltas,noRoutePositionSpeedLapOrClockInput:true},
    variants:variants.map(({observations,...row})=>row),sourceHashes:before,
    method:'Full-start physical replay from the current saved V3/Monza leader. A compact-support radial residual over actual MaleCNS descending-neuron activities locally changes only the existing steering/longitudinal motor logits near the first sustained brake-only state. All earlier baseline neural contexts are proven to have exactly zero gate activation. Progress selects diagnostic contexts only and is not an inference input.',
    boundary:'Single policy, one checkpoint, one seed and one circuit; counterfactual readout search only, not training or promotion. No actions, route, coordinates, speed, clock, reward or physics are supplied to the inference gate. The original save, application code, app version, release, portable and installer are unchanged.'};
  if(!report.passed)throw Error('Contextual readout baseline or preservation checks failed');
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('CONTEXT_READOUT_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,baseline:report.baseline,
    bestSafe:variants.filter(row=>row.result.safe).sort((a,b)=>b.result.laps-a.result.laps||b.result.progressM-a.result.progressM)[0]?.result??null,
    bestRaw:variants.slice().sort((a,b)=>b.result.progressM-a.result.progressM)[0]?.result??null,report:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
