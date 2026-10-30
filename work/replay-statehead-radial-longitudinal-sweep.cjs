'use strict';
// Isolated CUDA physical replay: test a radial, neural-state-only positive
// longitudinal residual at the verified stationary V3/Monza failure context.
// No route, position, speed, lap/time, teacher, save or application state is
// used to decide when the correction is active.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Parent=require('./neural-frontier-chain.cjs');
const State=require('./neural-statehead.cjs');
const Live=require('./neural-command-live-cuda.cjs');
const root=path.resolve(__dirname,'..');
const telemetryFile=path.join(root,'.impeccable/review/learning-ml/statehead-lap-revisit-telemetry-20261020-01/report.json');
const out=path.resolve(process.env.MALECNS_RADIAL_LONGITUDINAL_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/statehead-radial-longitudinal-sweep-20261020-01'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const MAX_CONTROLS=15000,AMPLITUDES=[.5,1,2,3];
function rms(a,b){return Math.sqrt(a.reduce((sum,value,i)=>sum+(value-b[i])**2,0)/a.length);}
function support(features,centre,radius){const d=rms(features,centre)/radius;return d>=1?0:(1-d)**4*(4*d+1);}
function resultSummary(agent,trackLength){
  const state=agent.env.state(),car=state.car,lap=Math.max(0,car.laps||0);
  return {complete:state.complete===true,progressM:state.bestProgress, laps:car.laps,lapTimes:car.lapTimes.slice(),
    fitness:car.fitness,reason:car.alive?'censored at diagnostic control limit':car.reason,controls:agent.controls,
    totalSimulationSeconds:state.totalSimulationSeconds,alongM:state.bestProgress-lap*trackLength,
    speedMps:car.vehicle?.speedMps??0,outputs:car.outputs.slice(),lastGate:agent.lastGate};
}
function makeAgent(loaded,sharedTopology,variant,centres=[]){
  const brain=Parent.controller(loaded.core.parent),head=State.create(loaded.data);let lastGate=0,lastFeatures=null;
  const env=Live.create(loaded.modelFile,{sharedTopology,id:0,modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,
    modelSha256:loaded.sha256,onReset:()=>{brain.reset();head.reset();},
    actionOverride:(_model,raw)=>{const prior=brain.observe(raw);head.observe(raw);return prior;},
    motorOverride:(_model,_raw,prior)=>{
      const learned=head.compose(brain.compose(prior),loaded.data.weights),features=head.features();lastFeatures=features.slice();
      if(!variant.amplitude||!centres.length){lastGate=0;return learned;}
      lastGate=Math.max(0,...centres.map(c=>support(features,c.features,c.radius)));
      if(lastGate===0)return learned;
      const steering=learned[0],longitudinal=Math.max(-1+1e-9,Math.min(1-1e-9,learned[1]-learned[2]));
      const corrected=Math.tanh(Math.atanh(longitudinal)+variant.amplitude*lastGate);
      return [steering,Math.max(0,corrected),Math.max(0,-corrected)];
    }});
  return {name:variant.name,amplitude:variant.amplitude||0,env,controls:0,trace:crypto.createHash('sha256'),rows:[],events:[],
    get lastGate(){return lastGate;},get lastFeatures(){return lastFeatures;}};
}
function runAgent(agent,trackLength,reference=null){
  let lastLog=performance.now();
  while(agent.controls<MAX_CONTROLS&&agent.env.currentCar().alive){
    const state=agent.env.step(),car=state.car;agent.controls++;
    const outputs=car.outputs.slice();agent.trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,outputs])+'\n');
    const lap=Math.max(0,car.laps||0),along=state.bestProgress-lap*trackLength;
    const row={control:agent.controls,progress:state.bestProgress,lap:car.laps||0,along,speedMps:car.vehicle?.speedMps??0,
      features:agent.lastFeatures?.slice()||null,outputs,lastGate:agent.lastGate};
    if(reference)reference.push(row);else if(row.lastGate>0||along>=780&&along<=850)agent.events.push({control:row.control,lap:row.lap,alongM:row.along,
      speedMps:row.speedMps,outputs:row.outputs,gate:row.lastGate});
    if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('RADIAL_LONGITUDINAL_PROGRESS '+JSON.stringify({variant:agent.name,control:agent.controls,...resultSummary(agent,trackLength)}));}
  }
  const trace=agent.trace.digest('hex');return {result:resultSummary(agent,trackLength),trace};
}
function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing radial-gate report');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),telemetry=JSON.parse(fs.readFileSync(telemetryFile,'utf8'));
  if(loaded.sha256!==telemetry.modelSha256||selected.actionTraceSha256!==telemetry.selectedActionTraceSha256||telemetry.observedActionTraceSha256!==selected.actionTraceSha256)
    throw Error('Exact protected V3/Monza model and replay-verified telemetry required');
  const trackLength=telemetry.trackLength;let topology=null;
  try{
    const baseline=makeAgent(loaded,topology,{name:'riferimento-neurale',amplitude:0});topology=baseline.env.topology;
    const baselineRows=[],startedAt=Date.now(),baselineRun=runAgent(baseline,trackLength,baselineRows);
    if(!baselineRun.result.complete||baselineRun.trace!==selected.actionTraceSha256||baseline.controls!==telemetry.controls||
      baselineRun.result.progressM!==telemetry.result.progress||baselineRun.result.laps!==telemetry.result.laps)
      throw Error('Fresh CUDA reference did not exactly reproduce the protected full physical trace');
    const terminal=baselineRows.filter(row=>row.lap>=1&&row.along>=790&&row.speedMps<=.25&&row.features?.length===9&&row.control%5===0).slice(-12);
    if(terminal.length<6)throw Error('Not enough real stationary neural contexts for the radial gate');
    const targetStart=terminal[0].control,protectedRows=baselineRows.filter(row=>row.control<targetStart);
    const centres=terminal.map(row=>{
      const nearest=Math.min(...protectedRows.map(p=>rms(row.features,p.features)));
      if(!(nearest>0))throw Error(`Terminal neural context overlaps an earlier control at ${row.control}`);
      return {control:row.control,features:row.features.slice(),radius:.95*nearest,nearestProtectedDistance:nearest};
    });
    const priorActivations=protectedRows.map(row=>Math.max(...centres.map(c=>support(row.features,c.features,c.radius))));
    const targetActivations=terminal.map(row=>Math.max(...centres.map(c=>support(row.features,c.features,c.radius))));
    if(priorActivations.some(value=>value>0)||!targetActivations.some(value=>value>0))throw Error('Radial gate leaked into the verified reference trajectory');
    const variants=[{name:'radial-positive-0.5',amplitude:.5},{name:'radial-positive-1',amplitude:1},
      {name:'radial-positive-2',amplitude:2},{name:'radial-positive-3',amplitude:3}];
    const results=[];
    for(const variant of variants){
      const agent=makeAgent(loaded,topology,variant,centres),run=runAgent(agent,trackLength);
      results.push({name:agent.name,amplitude:agent.amplitude,...run,result:run.result,events:agent.events});agent.env.close?.();
    }
    const gpu=Model.stats(),report={format:'male-cns-statehead-radial-longitudinal-amplitude-sweep-v1',appVersion:'5.6.0',passed:
      results.length===AMPLITUDES.length&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0,
      learningSucceeded:results.some(row=>row.result.laps>=2),
      model:{sha256:loaded.sha256,file:selected.file,referenceTraceSha256:selected.actionTraceSha256},
      baseline:{...baselineRun,controlCount:baseline.controls,referenceMatch:true,terminal:baselineRows.filter(row=>row.lap>=1&&row.along>=790).slice(-8).map(row=>({control:row.control,alongM:row.along,speedMps:row.speedMps,outputs:row.outputs,features:row.features}))},
      gate:{features:'nine-dimensional neural readout only',targetStartControl:targetStart,targetCentres:centres.length,centres,
        priorTrajectoryMaximumActivation:Math.max(0,...priorActivations),targetActivationRange:[Math.min(...targetActivations),Math.max(...targetActivations)],
        rule:'tanh(atanh(neural gas-minus-brake output) + amplitude * compact-RBF(neural features)); steering unchanged'},
      variants:results.map(({events,...row})=>({...row,events:events.slice(-80)})),gpu,elapsedWallSeconds:(Date.now()-startedAt)/1000,
      method:'One fresh exact-CUDA reference plus four complete same-start Monza physical replays. Baseline action trace must match the protected V3 model byte-for-byte in the observed controls. The candidate adds only a bounded local longitudinal residual when the 9-D neural state matches previously observed stationary terminal neural contexts; steering, sensors, vehicle physics, rewards and route remain unchanged. Candidates are never promoted.',
      boundary:'Single protected V3/Monza parent and seed. This is a causal local response test, not a trained model, generation, multi-seed result or proof of general learning. The user save, app source, version and releases are not written.'};
    if(gpu.cpuFallbacks!==0)throw Error('CUDA replay fell back to CPU');
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('RADIAL_LONGITUDINAL_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,baseline:report.baseline.result,
      gate:{targetStartControl:targetStart,targetCentres:centres.length,priorMaximumActivation:report.gate.priorTrajectoryMaximumActivation},
      variants:results.map(row=>({name:row.name,...row.result,terminalEvents:row.events.slice(-3)})),gpu,elapsedWallSeconds:report.elapsedWallSeconds,report:path.join(out,'report.json')}));
    baseline.env.close?.();
  }finally{Model.closeCuda();}
}
try{main();}catch(error){console.error(error.stack||error);Model.closeCuda();process.exitCode=1;}
