'use strict';
// Research-only local attenuation of the longitudinal state-head readout.
// Steering coefficients stay unchanged; the RBF gate sees only 9-D neural state.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Parent=require('./neural-frontier-chain.cjs');
const State=require('./neural-statehead.cjs');
const Live=require('./neural-command-live-cuda.cjs');
const root=path.resolve(__dirname,'..');
const telemetryFile=path.join(root,'.impeccable/review/learning-ml/statehead-lap-revisit-telemetry-20261020-01/report.json');
const out=path.join(root,'.impeccable/review/learning-ml/statehead-terminal-longitudinal-rbf-20261020-01');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const MAX_CONTROLS=10500,RADIUS_FACTORS=[.75,1,1.25,1.5];
function rms(a,b){return Math.sqrt(a.reduce((sum,value,i)=>sum+(value-b[i])**2,0)/a.length);}
function support(features,centre,radius){const d=rms(features,centre)/radius;return d>=1?0:(1-d)**4*(4*d+1);}
function summarize(agent,trackLength){
  const s=agent.env.state(),c=s.car,lap=Math.max(0,c.laps||0);
  return {progress:s.bestProgress,laps:c.laps,lapTimes:c.lapTimes.slice(),reason:c.alive?'censored at diagnostic control limit':c.reason,
    seconds:s.totalSimulationSeconds,complete:!c.alive,fitness:c.fitness,speedMps:c.vehicle?.speedMps??0,
    outputs:c.outputs.slice(),along:s.bestProgress-lap*trackLength,lastActionLocalGate:agent.lastActionLocalGate};
}
function makeAgent(loaded,topology,centre,radius,full,variant){
  const brain=Parent.controller(loaded.core.parent),head=State.create(loaded.data);let lastActionLocalGate=0;
  const env=Live.create(loaded.modelFile,{sharedTopology:topology,id:0,modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,
    modelSha256:loaded.sha256,onReset:()=>{brain.reset();head.reset();},
    actionOverride:(_model,raw)=>{const prior=brain.observe(raw);head.observe(raw);return prior;},
    motorOverride:(_model,_raw,prior)=>{
      lastActionLocalGate=support(head.features(),centre,radius);
      const weights=variant.kind==='parent'?Array(18).fill(0):variant.kind==='rbf'
        ?full.map((value,index)=>index%2?value*(1-lastActionLocalGate):value):full;
      return head.compose(brain.compose(prior),weights);
    }});
  return {name:variant.name,radiusFactor:variant.factor??null,env,trace:crypto.createHash('sha256'),controls:0,segments:[],
    get lastActionLocalGate(){return lastActionLocalGate;},get headGate(){return head.value();}};
}
function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing longitudinal-RBF replay');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),full=loaded.data.weights.slice();
  const telemetry=JSON.parse(fs.readFileSync(telemetryFile,'utf8'));
  if(telemetry.modelSha256!==loaded.sha256||telemetry.selectedActionTraceSha256!==selected.actionTraceSha256||
      telemetry.observedActionTraceSha256!==selected.actionTraceSha256||full.length!==18)throw Error('Exact protected model and replay-verified telemetry are required');
  const lap1=telemetry.segments?.lap1,lap2=telemetry.segments?.lap2,target=lap2?.at(-1);
  if(!Array.isArray(lap1)||!Array.isArray(lap2)||target?.speedMps!==0||target.features?.length!==9)throw Error('Stopped neural context and sampled moving contexts required');
  const protectedRows=[...lap1,...lap2.filter(s=>s.speedMps>.25)].filter(s=>s.features?.length===9);
  if(protectedRows.length<30)throw Error('Too few sampled moving contexts');
  const nearestProtected=Math.min(...protectedRows.map(s=>rms(s.features,target.features)));
  if(!(nearestProtected>0))throw Error('Stopped neural signature overlaps a sampled moving context');
  const variants=[{name:'learned-full',kind:'full'},{name:'zero-head-parent',kind:'parent'},
    ...RADIUS_FACTORS.map(factor=>({name:`longitudinal-rbf-radius-${String(factor).replace('.','-')}x`,kind:'rbf',factor}))];
  const activationAudit=RADIUS_FACTORS.map(factor=>{
    const radius=nearestProtected*factor,values=protectedRows.map(s=>support(s.features,target.features,radius));
    return {factor,radius,protectedSamplesWithSupport:values.filter(v=>v>0).length,maxProtectedActivation:Math.max(...values)};
  });
  let topology=null;
  const agents=variants.map(variant=>{
    const agent=makeAgent(loaded,topology,target.features,nearestProtected*(variant.factor??.75),full,variant);
    topology=agent.env.topology;return agent;
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
      if(control%2000===0)console.log('STATEHEAD_LONGITUDINAL_RBF_PROGRESS '+JSON.stringify({control,agents:agents.map(agent=>({name:agent.name,...summarize(agent,telemetry.trackLength)}))}));
    }
    const results=agents.map(agent=>{
      const actionTraceSha256=agent.trace.copy().digest('hex');
      return {name:agent.name,radiusFactor:agent.radiusFactor,result:summarize(agent,telemetry.trackLength),controls:agent.controls,
        actionTraceSha256,traceMatchesReference:agent.name==='learned-full'&&actionTraceSha256===selected.actionTraceSha256,
        samples650to900m:agent.segments};
    });
    const gpu=Model.stats(),report={format:'male-cns-statehead-terminal-longitudinal-rbf-v1',appVersion:'5.6.0',
      passed:results.length===variants.length&&results[0].traceMatchesReference&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0,
      model:{sha256:loaded.sha256,file:selected.file,referenceTrace:selected.actionTraceSha256},
      method:'Six same-seed CUDA physical replays: exact learned reference, zero-head parent, and four neural-RBF radii. Local activation attenuates only odd-indexed longitudinal gas/brake coefficients; the learned steering coefficients are held fixed. The gate uses only the current 9-D neuronal readout. Route/progress/lap/time are not used at inference; no training, promotion, or save migration occurs.',
      gate:{centre:target.features,metric:'RMS over the 9 actual projected neuronal features',nearestProtectedDistance:nearestProtected,
        protectedFirstLapSamples:lap1.filter(s=>s.features?.length===9).length,
        protectedMovingSecondLapSamples:lap2.filter(s=>s.speedMps>.25&&s.features?.length===9).length,
        activationAudit,selectedStop:{control:target.control,along:target.along,speedMps:target.speedMps,existingHeadGate:target.gate}},
      controlsPerEpisode:control,results,gpu,elapsedWallSeconds:(Date.now()-startedAt)/1000,
      boundary:'Research-only single-seed replay based on sampled telemetry windows. A candidate must complete two laps and pass repeated-seed and multi-generation validation before promotion.'};
    fs.mkdirSync(out,{recursive:false});
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('STATEHEAD_LONGITUDINAL_RBF_RESULT '+JSON.stringify({passed:report.passed,controls:control,gate:report.gate,
      results:results.map(r=>({name:r.name,radiusFactor:r.radiusFactor,result:r.result,trace:r.actionTraceSha256,
        traceMatchesReference:r.traceMatchesReference,samples:r.samples650to900m.length,terminalSamples:r.samples650to900m.slice(-3)})),
      gpu,report:path.join(out,'report.json')}));
  }finally{for(const agent of agents)agent.env.close?.();Model.closeCuda();}
}
try{main();}catch(error){console.error(error.stack||error);Model.closeCuda();process.exitCode=1;}
