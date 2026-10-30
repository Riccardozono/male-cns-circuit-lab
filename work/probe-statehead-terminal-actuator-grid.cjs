'use strict';
// Isolated physical actuator grid from the exact reached V3/Monza stall state.
// These counterfactual commands are diagnostics only, never training labels.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Parent=require('./neural-frontier-chain.cjs');
const State=require('./neural-statehead.cjs');
const Live=require('./neural-command-live-cuda.cjs');
const FlySim=require('../outputs/simulation.js');
const Vehicle=require('../outputs/vehicle-992.js');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const telemetryFile=path.join(base,'statehead-lap-revisit-telemetry-20261020-01/report.json');
const out=path.join(base,'statehead-terminal-actuator-grid-20261020-01');
const START_CONTROL=8440,STOP_CONTROL=8460,MAX_CONTROLS=10500;
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function sampleGeometry(track,car,state,control){
  const nearest=FlySim.locate(track,car.x,car.y);
  return {control,progress:state.bestProgress,along:nearest.along,offset:nearest.distance,x:car.x,y:car.y,
    heading:car.heading,speedMps:car.vehicle?.speedMps??0,onRoad:FlySim.onRoad(track,car.x,car.y),
    wallIntersection:FlySim.collided(track,car),outputs:car.outputs.slice(),reason:car.alive?'':car.reason};
}
function makeAgent(loaded,topology,selected,track,variant){
  const brain=Parent.controller(loaded.core.parent),head=State.create(loaded.data),trace=crypto.createHash('sha256'),prefix=crypto.createHash('sha256'),samples=[];
  let envControl=0;
  const env=Live.create(loaded.modelFile,{sharedTopology:topology,id:variant.id,modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,
    modelSha256:loaded.sha256,onReset:()=>{brain.reset();head.reset();},
    actionOverride:(_model,raw)=>{const parent=brain.observe(raw);head.observe(raw);return parent;},
    motorOverride:(_model,_raw,parentRaw)=>{
      const parent=brain.compose(parentRaw),learned=head.compose(parent,loaded.data.weights);
      return variant.type==='fixed'&&envControl>START_CONTROL?[variant.steering,variant.throttle,0]:learned;
    }});
  return {name:variant.name,type:variant.type,env,trace,prefix,samples,controls:0,
    step(){envControl++;const state=env.step();this.controls++;
      const row=JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n';trace.update(row);
      if(envControl<=START_CONTROL)prefix.update(row);
      if(envControl>=START_CONTROL&&envControl<=STOP_CONTROL)samples.push(sampleGeometry(track,state.car,state,envControl));
      return state;},
    snapshot(){const state=env.state(),car=state.car;return {progress:state.bestProgress,laps:car.laps,lapTimes:car.lapTimes.slice(),
      reason:car.alive?'diagnostic window ended with episode alive':car.reason,alive:car.alive,speedMps:car.vehicle?.speedMps??0,
      controls:this.controls,actionTraceSha256:trace.copy().digest('hex'),prefixTraceSha256:prefix.copy().digest('hex'),samples,
      progressDelta:samples.length?samples.at(-1).progress-samples[0].progress:0,
      displacementM:samples.length?Math.hypot(samples.at(-1).x-samples[0].x,samples.at(-1).y-samples[0].y):0,
      finalOffsetM:samples.at(-1)?.offset??null,anyWallIntersection:samples.some(row=>row.wallIntersection),allCentresOnRoad:samples.every(row=>row.onRoad)};}};
}
function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite existing actuator-grid report');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),telemetry=JSON.parse(fs.readFileSync(telemetryFile,'utf8'));
  if(telemetry.modelSha256!==loaded.sha256||telemetry.selectedActionTraceSha256!==selected.actionTraceSha256||telemetry.observedActionTraceSha256!==selected.actionTraceSha256)
    throw Error('Exact protected V3/Monza model and reference trace are required');
  const catalog=require(path.join(root,'outputs/data/circuits.json')),definition=catalog.circuits.find(item=>item.id==='monza');
  if(!definition)throw Error('Monza circuit definition is missing');
  const track=FlySim.makeTrack(definition.points,definition.halfWidth,true,definition.boundaries,definition);Vehicle.configureTrack(track,'monza');
  const variants=[{name:'learned-reference',type:'reference',id:0}];
  let id=1;for(const throttle of [.2,.6,1])for(const steering of [-.5,0,.5])
    variants.push({name:`fixed-steer-${steering}-throttle-${throttle}`,type:'fixed',steering,throttle,id:id++});
  let topology=null;const agents=variants.map(variant=>{const agent=makeAgent(loaded,topology,selected,track,variant);topology=agent.env.topology;return agent;});
  const started=Date.now();let control=0;
  try{
    while(control<MAX_CONTROLS&&agents[0].env.currentCar().alive){control++;
      for(const agent of agents){if(agent.type!=='reference'&&agent.controls>=STOP_CONTROL)continue;if(!agent.env.currentCar().alive)continue;agent.step();}
      if(control%2000===0)console.log('ACTUATOR_GRID_PROGRESS '+JSON.stringify({control,progress:agents[0].env.state().bestProgress}));
    }
    const results=agents.map(agent=>({name:agent.name,...agent.snapshot()})),prefixMatched=results.every(row=>row.prefixTraceSha256===results[0].prefixTraceSha256),
      baselineExact=results[0].actionTraceSha256===selected.actionTraceSha256,gpu=Model.stats();
    const referenceAtStart=telemetry.segments.lap2.find(row=>row.control===START_CONTROL);
    if(!referenceAtStart||Math.abs(results[0].samples.find(row=>row.control===START_CONTROL).progress-referenceAtStart.progress)>1e-9)
      throw Error('The live terminal checkpoint does not match protected telemetry');
    const report={format:'male-cns-statehead-terminal-actuator-grid-v1',appVersion:'5.6.0',passed:prefixMatched&&baselineExact&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0,
      learningSucceeded:false,model:{sha256:loaded.sha256,referenceTraceSha256:selected.actionTraceSha256},
      method:`Nine isolated fixed steering/throttle probes branch at actual V3/Monza control ${START_CONTROL} and run for at most ${STOP_CONTROL-START_CONTROL} controls. Same exact recurrent parent/head and physical state are used until the branch. Every row records physical position, progress, road membership and wall overlap. The commands are diagnostic counterfactuals only; no optimizer, reward rule, route, save or controller is trained or changed.`,
      checkpoint:{control:START_CONTROL,progress:referenceAtStart.progress,along:referenceAtStart.along,speedMps:referenceAtStart.speedMps,
        sourceTelemetrySha256:sha(fs.readFileSync(telemetryFile))},prefixMatched,baselineExact,results,gpu,elapsedWallSeconds:(Date.now()-started)/1000,
      boundary:'A physically reachable action in this short window is not evidence of learning or a safe policy. No hidden driver, route cue, teacher label, save migration, app/version change, promotion or release.'};
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('ACTUATOR_GRID_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,baselineExact,prefixMatched,
      results:results.map(row=>({name:row.name,progressDelta:row.progressDelta,displacementM:row.displacementM,finalSpeedMps:row.speedMps,
        finalOffsetM:row.finalOffsetM,anyWallIntersection:row.anyWallIntersection,allCentresOnRoad:row.allCentresOnRoad,reason:row.reason})),gpu,elapsedWallSeconds:report.elapsedWallSeconds,report:path.join(out,'report.json')}));
  }finally{for(const agent of agents)agent.env.close?.();Model.closeCuda();}
}
try{main();}catch(error){console.error(error.stack||error);Model.closeCuda();process.exitCode=1;}
