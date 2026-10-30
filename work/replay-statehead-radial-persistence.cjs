'use strict';
// Full physical A/B of a short, linearly decaying neural residual memory.
// Exact V3/Monza model, current neuronal features and real physics only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Parent=require('./neural-frontier-chain.cjs');
const State=require('./neural-statehead.cjs');
const Live=require('./neural-command-live-cuda.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const radialFile=path.join(base,'statehead-radial-full-trace-replay-20261020-01/report.json');
const telemetryFile=path.join(base,'statehead-lap-revisit-telemetry-20261020-01/report.json');
const previousFile=path.join(base,'statehead-terminal-joint-cma-20261020-02/report.json');
const out=path.resolve(process.env.MALECNS_RADIAL_PERSISTENCE_REPORT_DIR||path.join(base,'statehead-radial-persistence-replay-20261020-01'));
const longitudinalOnly=process.env.MALECNS_RADIAL_PERSISTENCE_LONGITUDINAL_ONLY==='1';
const holdControls=(process.env.MALECNS_RADIAL_PERSISTENCE_HOLDS||'0,4,16,64').split(',').map(Number);
if(!holdControls.length||holdControls.some(value=>!Number.isInteger(value)||value<0||value>256))throw Error('Hold values must be comma-separated integers from 0 to 256');
const steeringScales=(process.env.MALECNS_RADIAL_PERSISTENCE_STEERING_SCALES||holdControls.map(()=>longitudinalOnly?0:1).join(',')).split(',').map(Number);
if(steeringScales.length!==holdControls.length||steeringScales.some(value=>!Number.isFinite(value)||value< -1||value>1))throw Error('Provide one steering scale in [-1, 1] per hold value');
const radiusScales=(process.env.MALECNS_RADIAL_PERSISTENCE_RADIUS_SCALES||holdControls.map(()=>1).join(',')).split(',').map(Number);
if(radiusScales.length!==holdControls.length||radiusScales.some(value=>!Number.isFinite(value)||value<.5||value>4))throw Error('Provide one radial-support scale in [0.5, 4] per hold value');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function rms(a,b){return Math.sqrt(a.reduce((sum,value,i)=>sum+(value-b[i])**2,0)/a.length);}
function support(features,centre,radius){const d=rms(features,centre)/radius;return d>=1?0:(1-d)**4*(4*d+1);}
function makeAgent(loaded,topology,centres,coefficients,holdControls,steeringScale,radiusScale,name,targetStartControl){
  const brain=Parent.controller(loaded.core.parent),head=State.create(loaded.data);let gateNow=0,residualNow=[0,0],held=[0,0],remaining=0,control=0,preTargetMaximumActivation=0;
  const env=Live.create(loaded.modelFile,{sharedTopology:topology,id:0,modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,modelSha256:loaded.sha256,
    onReset:()=>{brain.reset();head.reset();gateNow=0;residualNow=[0,0];held=[0,0];remaining=0;control=0;preTargetMaximumActivation=0;},
    actionOverride:(_model,raw)=>{control++;const parent=brain.observe(raw);head.observe(raw);return parent;},
    motorOverride:(_model,_raw,parentRaw)=>{
      const learned=head.compose(brain.compose(parentRaw),loaded.data.weights),features=head.features();
      const gates=centres.map(c=>support(features,c.features,c.radius*radiusScale)),total=gates.reduce((sum,value)=>sum+value,0);
      gateNow=total?Math.min(1,Math.max(...gates)):0;
      if(total>0){
        residualNow=[0,1].map(axis=>1.5*gates.reduce((sum,value,index)=>sum+value*Math.tanh(coefficients[index*2+axis]),0)/total);
        residualNow[0]*=steeringScale;
        if(longitudinalOnly)residualNow[0]=0;
        held=residualNow.slice();remaining=holdControls;
      }else if(remaining>0){
        const decay=remaining/(holdControls+1);residualNow=held.map(value=>value*decay);remaining--;
      }else residualNow=[0,0];
      if(residualNow[0]===0&&residualNow[1]===0)return learned;
      const steering=Math.max(-1+1e-9,Math.min(1-1e-9,learned[0]));
      const longitudinal=Math.max(-1+1e-9,Math.min(1-1e-9,learned[1]-learned[2]));
      const nextSteering=Math.tanh(Math.atanh(steering)+residualNow[0]);
      const nextLongitudinal=Math.tanh(Math.atanh(longitudinal)+residualNow[1]);
      return [nextSteering,Math.max(0,nextLongitudinal),Math.max(0,-nextLongitudinal)];
    }});
  return {name,holdControls,steeringScale,radiusScale,env,trace:crypto.createHash('sha256'),controls:0,samples:[],get gate(){return gateNow;},get residual(){return residualNow.slice();},get preTargetMaximumActivation(){return preTargetMaximumActivation;},observePreTarget(){if(control<targetStartControl)preTargetMaximumActivation=Math.max(preTargetMaximumActivation,gateNow);}};
}
function summarize(agent,trackLength){const s=agent.env.state(),c=s.car;return {complete:s.complete===true,progress:s.bestProgress,laps:c.laps,lapTimes:c.lapTimes.slice(),fitness:c.fitness,reason:c.reason,
  totalSimulationSeconds:s.totalSimulationSeconds,controls:agent.controls,along:s.bestProgress-Math.max(0,c.laps||0)*trackLength,speedMps:c.vehicle?.speedMps??0,outputs:c.outputs.slice(),actionTraceSha256:agent.trace.copy().digest('hex'),terminalSamples:agent.samples};}
function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');if(fs.existsSync(out))throw Error('Refusing to overwrite existing diagnostic output');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),radial=JSON.parse(fs.readFileSync(radialFile,'utf8')),
    telemetry=JSON.parse(fs.readFileSync(telemetryFile,'utf8')),prior=JSON.parse(fs.readFileSync(previousFile,'utf8'));
  if(loaded.sha256!==radial.model.sha256||radial.baseline?.exactReferenceMatch!==true||radial.candidate?.actionTraceSha256!=='8a9c158ff24b0721d5e23d15abd35d5cb219cf2c9f2b577bb7d5bf1d52584cf7'||
    telemetry.modelSha256!==loaded.sha256||telemetry.observedActionTraceSha256!==selected.actionTraceSha256||!prior.passed)throw Error('Exact selected V3/Monza source, full-trace gate and previously evaluated residual required');
  const coeff=prior.results.toSorted((a,b)=>b.fitnessUsedByCmaEs-a.fitnessUsedByCmaEs)[0]?.coefficients;
  if(!Array.isArray(coeff)||coeff.length!==24||radial.gate.centres.length!==12)throw Error('Previous exact 12-centre neuronal residual required');
  const centres=radial.gate.centres.map(meta=>{const row=telemetry.segments.lap2.find(s=>s.control===meta.control);if(!row||row.features.length!==9)throw Error('Exact replayed neural centre missing');return {control:meta.control,features:row.features.slice(),radius:meta.radius};});
  const agents=[];let topology=null;
  const targetStartControl=radial.gate.centres[0].control;
  for(let i=0;i<holdControls.length;i++){const hold=holdControls[i],steerScale=steeringScales[i],radiusScale=radiusScales[i],name=`radial-decay-${hold}-steer-${steerScale}-radius-${radiusScale}`,
    a=makeAgent(loaded,topology,centres,coeff,hold,steerScale,radiusScale,name,targetStartControl);if(!topology)topology=a.env.topology;agents.push(a);}
  let tick=0;const started=Date.now();
  try{
    while(tick<12000&&agents.some(a=>a.env.currentCar().alive)){
      tick++;
      for(const a of agents){if(!a.env.currentCar().alive)continue;const s=a.env.step(),c=s.car;a.controls++;a.observePreTarget();
        a.trace.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,c.outputs])+'\n');
        const lap=c.laps||0,along=s.bestProgress-Math.max(0,lap||0)*telemetry.trackLength;
        if(a.gate>0||a.controls>=8436&&a.controls<=8498)a.samples.push({control:a.controls,progress:s.bestProgress,along,speedMps:c.vehicle?.speedMps??0,
          gate:a.gate,residual:a.residual,outputs:c.outputs.slice()});
      }
      if(tick%2000===0)console.log('RADIAL_MEMORY_PROGRESS '+JSON.stringify({tick,agents:agents.map(a=>{const s=a.env.state();return {name:a.name,progress:s.bestProgress,laps:s.laps,alive:a.env.currentCar().alive};})}));
    }
    const results=agents.map(a=>({name:a.name,holdControls:a.holdControls,steeringScale:a.steeringScale,radiusScale:a.radiusScale,preTargetMaximumActivation:a.preTargetMaximumActivation,...summarize(a,telemetry.trackLength)}));
    const baselineVariant=results[0],priorTraceMatch=baselineVariant.steeringScale===1&&baselineVariant.holdControls===0&&baselineVariant.actionTraceSha256===radial.candidate.actionTraceSha256&&baselineVariant.progress===radial.candidate.progress&&baselineVariant.laps===radial.candidate.laps;
    if(!longitudinalOnly&&!priorTraceMatch)throw Error('Zero-memory control failed to reproduce the exact prior radial replay');
    if(longitudinalOnly&&(!baselineVariant.complete||baselineVariant.controls!==radial.candidate.controls))throw Error('Steering-off zero-memory control did not complete the same diagnostic episode');
    const validControl=longitudinalOnly?baselineVariant.complete&&baselineVariant.controls===radial.candidate.controls:priorTraceMatch;
    const gpu=Model.stats(),report={format:'male-cns-statehead-radial-radius-sweep-full-replay-v1',appVersion:'5.6.0',passed:results.length===holdControls.length&&results.every(r=>r.complete)&&validControl&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0,
      learningSucceeded:results.some(r=>r.laps>=2),model:{sha256:loaded.sha256,file:selected.file,protectedActionTraceSha256:selected.actionTraceSha256},
      method:`${agents.length} fresh-from-line full physical CUDA replays reuse the exact V3/Monza neural radial gate and the same previously evaluated residual. When the neural gate drops to zero, the last actual neural correction is linearly decayed for ${holdControls.join(', ')} controls. Steering residual scales are ${steeringScales.join(', ')}.${longitudinalOnly?' Steering residual is zeroed in every arm; only the longitudinal neural correction remains, with the 0-control arm serving as the matched ablation.':' The zero-memory, full-steering arm must exactly reproduce the previous radial control.'} No route, progress, lap, clock, teacher, reward or physics enters the controller.`,
      gate:{centres:centres.map(({features,...m})=>m),targetStartControl,zeroMemoryTraceMatched:priorTraceMatch,matchedSteeringOffArms:longitudinalOnly?holdControls.slice():undefined,holdControls:holdControls.slice(),steeringScales:steeringScales.slice(),radiusScales:radiusScales.slice(),preTargetMaximumActivation:agents.map(a=>({name:a.name,value:a.preTargetMaximumActivation}))},results,gpu,elapsedWallSeconds:(Date.now()-started)/1000,
      boundary:'Research-only physical A/B; an episode improvement is not promotion. Completion of two laps and independent cold native verification remain required. No app, save, version, release, tag or portable was modified.'};
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('RADIAL_MEMORY_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,results:results.map(r=>({name:r.name,holdControls:r.holdControls,steeringScale:r.steeringScale,radiusScale:r.radiusScale,progress:r.progress,laps:r.laps,fitness:r.fitness,reason:r.reason,controls:r.controls,trace:r.actionTraceSha256})),preTargetMaximumActivation:report.gate.preTargetMaximumActivation,gpu,output:path.join(out,'report.json')}));
  }finally{for(const a of agents)a.env.close?.();Model.closeCuda();}
}
main();
