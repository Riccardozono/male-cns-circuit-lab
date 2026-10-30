'use strict';
// Research-only multi-centre gate over the terminal neuronal activity cluster.
// Only longitudinal readout coefficients are attenuated; steering is preserved.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Parent=require('./neural-frontier-chain.cjs');
const State=require('./neural-statehead.cjs');
const Live=require('./neural-command-live-cuda.cjs');
const root=path.resolve(__dirname,'..');
const telemetryFile=path.join(root,'.impeccable/review/learning-ml/statehead-lap-revisit-telemetry-20261020-01/report.json');
const out=path.join(root,'.impeccable/review/learning-ml/statehead-terminal-neural-basis-20261020-01');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const MAX_CONTROLS=10500,RADIUS_FACTORS=[.75,1,1.25,1.5];
function rms(a,b){return Math.sqrt(a.reduce((sum,value,i)=>sum+(value-b[i])**2,0)/a.length);}
function support(features,centre,radius){const d=rms(features,centre)/radius;return d>=1?0:(1-d)**4*(4*d+1);}
function localGate(features,centres,radiusFactor){
  let gate=0;for(const centre of centres)gate=Math.max(gate,support(features,centre.features,centre.radius*radiusFactor));return gate;
}
function summarize(agent,trackLength){
  const s=agent.env.state(),c=s.car,lap=Math.max(0,c.laps||0);
  return {progress:s.bestProgress,laps:c.laps,lapTimes:c.lapTimes.slice(),reason:c.alive?'censored at diagnostic control limit':c.reason,
    seconds:s.totalSimulationSeconds,complete:!c.alive,fitness:c.fitness,speedMps:c.vehicle?.speedMps??0,
    outputs:c.outputs.slice(),along:s.bestProgress-lap*trackLength,lastActionLocalGate:agent.lastActionLocalGate};
}
function makeAgent(loaded,topology,centres,radiusFactor,full,variant){
  const brain=Parent.controller(loaded.core.parent),head=State.create(loaded.data);let lastActionLocalGate=0;
  const env=Live.create(loaded.modelFile,{sharedTopology:topology,id:0,modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,
    modelSha256:loaded.sha256,onReset:()=>{brain.reset();head.reset();},
    actionOverride:(_model,raw)=>{const prior=brain.observe(raw);head.observe(raw);return prior;},
    motorOverride:(_model,_raw,prior)=>{
      lastActionLocalGate=variant.kind==='rbf'?localGate(head.features(),centres,radiusFactor):0;
      const weights=variant.kind==='parent'?Array(18).fill(0):variant.kind==='rbf'
        ?full.map((value,index)=>index%2?value*(1-lastActionLocalGate):value):full;
      return head.compose(brain.compose(prior),weights);
    }});
  return {name:variant.name,radiusFactor:variant.factor??null,env,trace:crypto.createHash('sha256'),controls:0,segments:[],
    get lastActionLocalGate(){return lastActionLocalGate;},get headGate(){return head.value();}};
}
function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing multi-centre neural gate replay');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),full=loaded.data.weights.slice();
  const telemetry=JSON.parse(fs.readFileSync(telemetryFile,'utf8'));
  if(telemetry.modelSha256!==loaded.sha256||telemetry.selectedActionTraceSha256!==selected.actionTraceSha256||
      telemetry.observedActionTraceSha256!==selected.actionTraceSha256||full.length!==18)throw Error('Exact protected model and replay-verified telemetry are required');
  const lap1=telemetry.segments?.lap1,lap2=telemetry.segments?.lap2;
  if(!Array.isArray(lap1)||!Array.isArray(lap2)||lap1.length<10||lap2.length<10)throw Error('Recorded lap contexts are required');
  // Route position is used only to select the already-recorded terminal cluster,
  // never by the live policy. Earlier stops are deliberately protected samples.
  const selectedRows=lap2.filter(s=>s.speedMps<=.25&&s.along>=790&&s.features?.length===9);
  const protectedRows=[...lap1,...lap2.filter(s=>!(s.speedMps<=.25&&s.along>=790))].filter(s=>s.features?.length===9);
  if(selectedRows.length<6||protectedRows.length<50)throw Error('Insufficient terminal cluster or protected observed contexts');
  const centres=selectedRows.map(s=>{
    const nearest=Math.min(...protectedRows.map(p=>rms(s.features,p.features)));
    if(!(nearest>0))throw Error('A terminal centre overlaps a protected context');
    return {control:s.control,along:s.along,speedMps:s.speedMps,features:s.features,radius:.75*nearest,nearestProtectedDistance:nearest};
  });
  const activationAudit=RADIUS_FACTORS.map(factor=>{
    const activations=protectedRows.map(s=>localGate(s.features,centres,factor));
    return {factor,protectedSamplesWithSupport:activations.filter(v=>v>0).length,maxProtectedActivation:Math.max(...activations),
      terminalClusterMinimum:Math.min(...selectedRows.map(s=>localGate(s.features,centres,factor))),
      terminalClusterMaximum:Math.max(...selectedRows.map(s=>localGate(s.features,centres,factor)))};
  });
  const variants=[{name:'learned-full',kind:'full'},{name:'zero-head-parent',kind:'parent'},
    ...RADIUS_FACTORS.map(factor=>({name:`multi-centre-longitudinal-rbf-${String(factor).replace('.','-')}x`,kind:'rbf',factor}))];
  let topology=null;
  const agents=variants.map(variant=>{
    const agent=makeAgent(loaded,topology,centres,variant.factor??1,full,variant);topology=agent.env.topology;return agent;
  });
  const startedAt=Date.now();let control=0;
  try{
    while(control<MAX_CONTROLS&&agents.some(agent=>agent.env.currentCar().alive)){
      control++;
      for(const agent of agents){
        if(!agent.env.currentCar().alive)continue;
        const s=agent.env.step(),c=s.car;agent.controls++;
        agent.trace.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,s.car.outputs])+'\n');
        const lap=c.laps||0,along=s.bestProgress-lap*telemetry.trackLength;
        if(control%10===0&&along>=650&&along<=900)agent.segments.push({control,lap,progress:s.bestProgress,along,
          speedMps:c.vehicle?.speedMps??0,outputs:c.outputs.slice(),headGate:agent.headGate,
          localGate:agent.lastActionLocalGate,lateralG:c.lateralG,longitudinalG:c.longitudinalG});
      }
      if(control%2000===0)console.log('STATEHEAD_TERMINAL_BASIS_PROGRESS '+JSON.stringify({control,agents:agents.map(agent=>({name:agent.name,...summarize(agent,telemetry.trackLength)}))}));
    }
    const results=agents.map(agent=>{
      const actionTraceSha256=agent.trace.copy().digest('hex');
      return {name:agent.name,radiusFactor:agent.radiusFactor,result:summarize(agent,telemetry.trackLength),controls:agent.controls,
        actionTraceSha256,traceMatchesReference:agent.name==='learned-full'&&actionTraceSha256===selected.actionTraceSha256,
        samples650to900m:agent.segments};
    });
    const gpu=Model.stats(),report={format:'male-cns-statehead-terminal-neural-basis-v1',appVersion:'5.6.0',
      passed:results.length===variants.length&&results[0].traceMatchesReference&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0,
      model:{sha256:loaded.sha256,file:selected.file,referenceTrace:selected.actionTraceSha256},
      method:'Six same-seed CUDA physical replays: exact learned reference, zero-head parent, and four multi-centre neuronal RBF radii. Centres are recorded near-terminal neuronal readout states; each radius is bounded against all other sampled first-lap and second-lap contexts. At inference the gate uses only the current 9-D neuronal feature vector and attenuates only longitudinal coefficients; steering, physics, rewards, and parent controller remain unchanged. No route/time input, training, model promotion, or save migration.',
      gate:{centres:centres.map(({features,...c})=>c),metric:'Maximum compact-support RBF activation; RMS in the 9 actual projected neuronal features',
        protectedFirstLapSamples:lap1.filter(s=>s.features?.length===9).length,
        protectedOtherSecondLapSamples:lap2.filter(s=>!(s.speedMps<=.25&&s.along>=790)&&s.features?.length===9).length,
        terminalClusterSamples:selectedRows.length,activationAudit,previousLowSpeedContexts:lap2.filter(s=>s.speedMps<=.25&&s.along<790).map(s=>({control:s.control,along:s.along}))},
      controlsPerEpisode:control,results,gpu,elapsedWallSeconds:(Date.now()-startedAt)/1000,
      boundary:'Research-only single-seed replay; recorded telemetry is sampled, not every control. A candidate must complete two laps and pass repeated-seed and multi-generation validation before promotion.'};
    fs.mkdirSync(out,{recursive:false});
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('STATEHEAD_TERMINAL_BASIS_RESULT '+JSON.stringify({passed:report.passed,controls:control,gate:report.gate,
      results:results.map(r=>({name:r.name,radiusFactor:r.radiusFactor,result:r.result,trace:r.actionTraceSha256,
        traceMatchesReference:r.traceMatchesReference,samples:r.samples650to900m.length,terminalSamples:r.samples650to900m.slice(-3)})),
      gpu,report:path.join(out,'report.json')}));
  }finally{for(const agent of agents)agent.env.close?.();Model.closeCuda();}
}
try{main();}catch(error){console.error(error.stack||error);Model.closeCuda();process.exitCode=1;}
