'use strict';
// Counterfactual actuator-only diagnostic from one actually reached Monza state.
// Interventions are never fed to training or exported as a driving policy.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Parent=require('./neural-frontier-chain.cjs');
const State=require('./neural-statehead.cjs');
const Live=require('./neural-command-live-cuda.cjs');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'.impeccable/review/learning-ml/statehead-terminal-actuator-response-20261020-01');
const telemetryFile=path.join(root,'.impeccable/review/learning-ml/statehead-lap-revisit-telemetry-20261020-01/report.json');
const START_CONTROL=8440,STOP_CONTROL=8460,MAX_CONTROLS=10500,THROTTLE=.2;
function makeAgent(loaded,topology,selected,variant){
  const brain=Parent.controller(loaded.core.parent),head=State.create(loaded.data),trace=crypto.createHash('sha256'),prefix=crypto.createHash('sha256'),segments=[];
  const env=Live.create(loaded.modelFile,{sharedTopology:topology,id:0,modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,
    modelSha256:loaded.sha256,onReset:()=>{brain.reset();head.reset();},
    actionOverride:(_model,raw)=>{const parent=brain.observe(raw);head.observe(raw);return parent;},
    motorOverride:(_model,_raw,parentRaw)=>{
      const parent=brain.compose(parentRaw),learned=head.compose(parent,loaded.data.weights);
      if(variant.kind==='parent'&&envControl>START_CONTROL)return parent;
      if(variant.kind==='coast'&&envControl>START_CONTROL)return [learned[0],0,0];
      if(variant.kind==='throttle-steering'&&envControl>START_CONTROL)return [learned[0],THROTTLE,0];
      if(variant.kind==='throttle-neutral-steering'&&envControl>START_CONTROL)return [0,THROTTLE,0];
      return learned;
    }});
  let envControl=0;
  return {name:variant.name,kind:variant.kind,env,trace,prefix,segments,controls:0,
    step(){envControl++;const s=env.step();this.controls++;const tuple=JSON.stringify([s.bestProgress,s.totalSimulationSeconds,s.car.outputs])+'\n';trace.update(tuple);
      if(envControl<=START_CONTROL)prefix.update(tuple);
      if(envControl>=START_CONTROL&&envControl<=STOP_CONTROL){const c=s.car;segments.push({control:envControl,progress:s.bestProgress,lap:s.laps,
        along:s.bestProgress-Math.max(0,c.laps||0)*selected.trackLength,speedMps:c.vehicle?.speedMps??0,outputs:c.outputs.slice(),
        lateralG:c.lateralG,longitudinalG:c.longitudinalG,reason:c.alive?'':c.reason});}
      return s;},
    snapshot(){const s=env.state(),c=s.car;return {progress:s.bestProgress,laps:c.laps,lapTimes:c.lapTimes.slice(),fitness:c.fitness,
      reason:c.alive?'diagnostic window ended with episode alive':c.reason,alive:c.alive,speedMps:c.vehicle?.speedMps??0,
      controls:this.controls,actionTraceSha256:trace.copy().digest('hex'),prefixTraceSha256:prefix.copy().digest('hex'),
      diagnosticWindow:segments.length?{fromControl:START_CONTROL+1,toControl:segments.at(-1).control,
        progressDelta:segments.at(-1).progress-segments[0].progress,finalSpeedMps:segments.at(-1).speedMps,
        controls:Math.max(0,segments.length-1),baselineStateAtStart:segments[0],states:segments.slice(1)}:null};}};
}
function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing actuator response report');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),telemetry=JSON.parse(fs.readFileSync(telemetryFile,'utf8'));
  if(telemetry.modelSha256!==loaded.sha256||telemetry.selectedActionTraceSha256!==selected.actionTraceSha256||
      telemetry.observedActionTraceSha256!==selected.actionTraceSha256)throw Error('Exact verified V3/Monza model and telemetry are required');
  const variants=[{name:'learned-controller-reference',kind:'reference'},
    {name:'parent-controller-only',kind:'parent'},{name:'learned-steering-coast',kind:'coast'},
    {name:'diagnostic-throttle-0.2-learned-steering',kind:'throttle-steering'},
    {name:'diagnostic-throttle-0.2-neutral-steering',kind:'throttle-neutral-steering'}];
  let topology=null;const agents=variants.map(v=>{const a=makeAgent(loaded,topology,selected,v);topology=a.env.topology;return a;});
  const start=Date.now();let control=0;
  try{
    while(control<MAX_CONTROLS&&agents[0].env.currentCar().alive){
      control++;
      for(const agent of agents){
        if(agent.kind!=='reference'&&agent.controls>=STOP_CONTROL)continue;
        if(!agent.env.currentCar().alive)continue;
        agent.step();
      }
      if(control%2000===0)console.log('STATEHEAD_ACTUATOR_RESPONSE_PROGRESS '+JSON.stringify({control,
        reference:agents[0].env.state()&&{progress:agents[0].env.state().bestProgress,speedMps:agents[0].env.state().car.vehicle?.speedMps??0},
        intervened:agents.slice(1).map(a=>({name:a.name,progress:a.env.state().bestProgress,speedMps:a.env.state().car.vehicle?.speedMps??0}))}));
    }
    const results=agents.map(a=>a.snapshot()),commonPrefix=results.every(r=>r.prefixTraceSha256===results[0].prefixTraceSha256);
    const baselineExact=results[0].actionTraceSha256===selected.actionTraceSha256;
    const gpu=Model.stats(),report={format:'male-cns-statehead-terminal-actuator-response-v1',appVersion:'5.6.0',
      passed:commonPrefix&&baselineExact&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0,
      model:{sha256:loaded.sha256,file:selected.file,referenceTraceSha256:selected.actionTraceSha256},
      method:`Five same-seed copies run the actual selected model in lockstep until the previously observed stopped, on-road state at control ${START_CONTROL}. Four then receive one of: parent-controller-only output, coast with learned steering, 0.2 diagnostic throttle retaining learned steering, or 0.2 diagnostic throttle with neutral steering. The reference continues unchanged to natural termination. Interventions last at most ${STOP_CONTROL-START_CONTROL} controls (${(STOP_CONTROL-START_CONTROL)*.1} simulated seconds), use no route/time inputs, never update the optimizer, and are not teacher labels or candidate models.`,
      checkpoint:{control:START_CONTROL,expectedProgress:telemetry.segments.lap2.at(-1).progress,
        expectedAlong:telemetry.segments.lap2.at(-1).along,expectedSpeedMps:telemetry.segments.lap2.at(-1).speedMps,
        sourceTelemetrySha256:crypto.createHash('sha256').update(fs.readFileSync(telemetryFile)).digest('hex')},
      commonPrefix,baselineExact,results:results.map((r,i)=>({name:variants[i].name,...r})),gpu,
      elapsedWallSeconds:(Date.now()-start)/1000,
      boundary:'An intervention response determines only whether the actual physical plant moves under a short diagnostic input at this reached state. It does not show that the neural policy learned, establish a safe driving action, or justify installing a controller.'};
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('STATEHEAD_ACTUATOR_RESPONSE_RESULT '+JSON.stringify({passed:report.passed,commonPrefix,baselineExact,
      results:report.results.map(r=>({name:r.name,progress:r.progress,laps:r.laps,reason:r.reason,alive:r.alive,
        diagnostic:r.diagnosticWindow&&{progressDelta:r.diagnosticWindow.progressDelta,finalSpeedMps:r.diagnosticWindow.finalSpeedMps,controls:r.diagnosticWindow.controls,
          lastOutputs:r.diagnosticWindow.states.at(-1)?.outputs}})),gpu,report:path.join(out,'report.json')}));
  }finally{for(const agent of agents)agent.env.close?.();Model.closeCuda();}
}
try{main();}catch(error){console.error(error.stack||error);Model.closeCuda();process.exitCode=1;}
