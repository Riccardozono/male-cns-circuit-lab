'use strict';
// Research-only test: locally attenuate the learned state-head coefficients
// using only the current 9-D neuronal readout signature. It never reads route,
// progress, lap, or clock at inference time and never changes a saved model.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Parent=require('./neural-frontier-chain.cjs');
const State=require('./neural-statehead.cjs');
const Live=require('./neural-command-live-cuda.cjs');
const root=path.resolve(__dirname,'..');
const telemetryFile=path.join(root,'.impeccable/review/learning-ml/statehead-lap-revisit-telemetry-20261020-01/report.json');
const out=path.join(root,'.impeccable/review/learning-ml/statehead-terminal-neural-rbf-recovery-20261020-01');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const MAX_CONTROLS=10500;
const SUPPRESSIONS=[
  {name:'learned-full',amount:0},
  {name:'zero-head-parent',amount:null},
  {name:'neural-rbf-suppress-50pct',amount:.5},
  {name:'neural-rbf-suppress-75pct',amount:.75},
  {name:'neural-rbf-suppress-100pct',amount:1},
];
function rms(a,b){return Math.sqrt(a.reduce((sum,value,i)=>sum+(value-b[i])**2,0)/a.length);}
function support(features,centre,radius){
  const scaled=rms(features,centre)/radius;
  return scaled>=1?0:(1-scaled)**4*(4*scaled+1);
}
function summarize(agent,trackLength){
  const s=agent.env.state(),c=s.car,lap=Math.max(0,c.laps||0);
  return {progress:s.bestProgress,laps:c.laps,lapTimes:c.lapTimes.slice(),reason:c.alive?'censored at diagnostic control limit':c.reason,
    seconds:s.totalSimulationSeconds,complete:!c.alive,fitness:c.fitness,speedMps:c.vehicle?.speedMps??0,
    outputs:c.outputs.slice(),along:s.bestProgress-lap*trackLength,lastActionLocalGate:agent.lastActionLocalGate};
}
function makeAgent(loaded,topology,centre,radius,full,name,amount,id){
  const brain=Parent.controller(loaded.core.parent),head=State.create(loaded.data);let lastActionLocalGate=0;
  const env=Live.create(loaded.modelFile,{sharedTopology:topology,id,modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,
    modelSha256:loaded.sha256,onReset:()=>{brain.reset();head.reset();},
    actionOverride:(_model,raw)=>{const prior=brain.observe(raw);head.observe(raw);return prior;},
    motorOverride:(_model,_raw,prior)=>{
      const features=head.features();lastActionLocalGate=support(features,centre,radius);
      const weights=amount===null?Array(18).fill(0):full.map(value=>value*(1-amount*lastActionLocalGate));
      return head.compose(brain.compose(prior),weights);
    }});
  return {name,amount,env,trace:crypto.createHash('sha256'),controls:0,segments:[],
    get lastActionLocalGate(){return lastActionLocalGate;},get headGate(){return head.value();}};
}
function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing neural-RBF recovery replay');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),full=loaded.data.weights.slice();
  const telemetry=JSON.parse(fs.readFileSync(telemetryFile,'utf8'));
  if(telemetry.modelSha256!==loaded.sha256||telemetry.selectedActionTraceSha256!==selected.actionTraceSha256||
      telemetry.observedActionTraceSha256!==selected.actionTraceSha256||full.length!==18)throw Error('Exact protected model and replay-verified telemetry are required');
  const lap1=telemetry.segments?.lap1,lap2=telemetry.segments?.lap2,target=lap2?.at(-1);
  if(!Array.isArray(lap1)||!Array.isArray(lap2)||lap1.length<10||lap2.length<10||target?.speedMps!==0||target.features?.length!==9)
    throw Error('Observed first-lap and stopped second-lap neuronal contexts are required');
  const protectedRows=[...lap1,...lap2.filter(s=>s.speedMps>.25)].filter(s=>s.features?.length===9);
  if(protectedRows.length<30)throw Error('Too few sampled moving contexts to bound a local neural gate');
  const nearestProtected=Math.min(...protectedRows.map(s=>rms(s.features,target.features)));
  if(!(nearestProtected>0))throw Error('Stopped neural signature overlaps a sampled moving context');
  const radius=.75*nearestProtected;
  if(protectedRows.some(s=>support(s.features,target.features,radius)!==0)||support(target.features,target.features,radius)!==1)
    throw Error('Neural RBF support failed the sampled-context preservation checks');
  let topology=null;
  const agents=SUPPRESSIONS.map(variant=>{
    const agent=makeAgent(loaded,topology,target.features,radius,full,variant.name,variant.amount,0);
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
      if(control%2000===0)console.log('STATEHEAD_NEURAL_RBF_PROGRESS '+JSON.stringify({control,agents:agents.map(agent=>({name:agent.name,...summarize(agent,telemetry.trackLength)}))}));
    }
    const results=agents.map(agent=>{
      const actionTraceSha256=agent.trace.copy().digest('hex');
      return {name:agent.name,localSuppression:agent.amount,result:summarize(agent,telemetry.trackLength),controls:agent.controls,
        actionTraceSha256,traceMatchesReference:agent.name==='learned-full'&&actionTraceSha256===selected.actionTraceSha256,
        samples650to900m:agent.segments};
    });
    const gpu=Model.stats(),report={format:'male-cns-statehead-terminal-neural-rbf-recovery-v1',appVersion:'5.6.0',
      passed:results.length===SUPPRESSIONS.length&&results[0].traceMatchesReference&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0,
      model:{sha256:loaded.sha256,file:selected.file,referenceTrace:selected.actionTraceSha256},
      method:'Five same-seed CUDA physical replays: full learned head, zero-head parent, and local 50/75/100% attenuation. A compact-support radial gate uses only current 9-D neuronal readout features at inference. Its centre/radius are derived from the recorded stopped neural signature and bounded to zero on the sampled first-lap and moving second-lap contexts. No route position, progress, lap, time, teacher action, training, model promotion, or save migration is used.',
      gate:{centre:target.features,radius,metric:'RMS over the 9 actual projected neuronal features',nearestSampledProtectedDistance:nearestProtected,
        protectedFirstLapSamples:lap1.filter(s=>s.features?.length===9).length,
        protectedMovingSecondLapSamples:lap2.filter(s=>s.speedMps>.25&&s.features?.length===9).length,
        protectedSamplesOutsideSupport:protectedRows.filter(s=>support(s.features,target.features,radius)===0).length,
        selectedStop:{control:target.control,along:target.along,speedMps:target.speedMps,existingHeadGate:target.gate}},
      controlsPerEpisode:control,results,gpu,elapsedWallSeconds:(Date.now()-startedAt)/1000,
      boundary:'Research-only single-seed physical replay, sampled contexts cover only recorded telemetry windows. A candidate that escapes must still complete two laps and then pass repeated-seed and multi-generation validation before any promotion.'};
    fs.mkdirSync(out,{recursive:false});
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('STATEHEAD_NEURAL_RBF_RESULT '+JSON.stringify({passed:report.passed,controls:control,gate:report.gate,
      results:results.map(r=>({name:r.name,amount:r.localSuppression,result:r.result,trace:r.actionTraceSha256,
        traceMatchesReference:r.traceMatchesReference,samples:r.samples650to900m.length,terminalSamples:r.samples650to900m.slice(-3)})),
      gpu,report:path.join(out,'report.json')}));
  }finally{for(const agent of agents)agent.env.close?.();Model.closeCuda();}
}
try{main();}catch(error){console.error(error.stack||error);Model.closeCuda();process.exitCode=1;}
