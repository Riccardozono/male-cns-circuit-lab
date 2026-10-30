'use strict';
// A/B: keep only the neuronal longitudinal residual briefly after its neural
// gate drops; steering always returns to the current neural controller.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs'),Parent=require('./neural-frontier-chain.cjs'),State=require('./neural-statehead.cjs'),Live=require('./neural-command-live-cuda.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const radialFile=path.join(base,'statehead-radial-full-trace-replay-20261020-01/report.json');
const memoryFile=path.join(base,'statehead-radial-persistence-replay-20261020-01/report.json');
const telemetryFile=path.join(base,'statehead-lap-revisit-telemetry-20261020-01/report.json');
const priorFile=path.join(base,'statehead-terminal-joint-cma-20261020-02/report.json');
const out=path.join(base,'statehead-longitudinal-persistence-replay-20261020-01');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function rms(a,b){return Math.sqrt(a.reduce((sum,value,i)=>sum+(value-b[i])**2,0)/a.length);}
function support(features,centre,radius){const d=rms(features,centre)/radius;return d>=1?0:(1-d)**4*(4*d+1);}
function makeAgent(loaded,topology,centres,coefficients,holdControls,name){
  const brain=Parent.controller(loaded.core.parent),head=State.create(loaded.data);let gateNow=0,steeringResidual=0,longitudinalResidual=0,heldLongitudinal=0,remaining=0;
  const env=Live.create(loaded.modelFile,{sharedTopology:topology,id:0,modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,modelSha256:loaded.sha256,
    onReset:()=>{brain.reset();head.reset();gateNow=0;steeringResidual=0;longitudinalResidual=0;heldLongitudinal=0;remaining=0;},
    actionOverride:(_model,raw)=>{const parent=brain.observe(raw);head.observe(raw);return parent;},
    motorOverride:(_model,_raw,parentRaw)=>{
      const learned=head.compose(brain.compose(parentRaw),loaded.data.weights),features=head.features();
      const gates=centres.map(c=>support(features,c.features,c.radius)),total=gates.reduce((sum,value)=>sum+value,0);
      gateNow=total?Math.min(1,Math.max(...gates)):0;steeringResidual=0;
      if(total>0){
        const local=[0,1].map(axis=>1.5*gates.reduce((sum,value,index)=>sum+value*Math.tanh(coefficients[index*2+axis]),0)/total);
        steeringResidual=local[0];heldLongitudinal=local[1];longitudinalResidual=local[1];remaining=holdControls;
      }else if(remaining>0){longitudinalResidual=heldLongitudinal*remaining/(holdControls+1);remaining--;}
      else longitudinalResidual=0;
      if(steeringResidual===0&&longitudinalResidual===0)return learned;
      const steering=Math.max(-1+1e-9,Math.min(1-1e-9,learned[0]));
      const longitudinal=Math.max(-1+1e-9,Math.min(1-1e-9,learned[1]-learned[2]));
      const nextSteering=Math.tanh(Math.atanh(steering)+steeringResidual);
      const nextLongitudinal=Math.tanh(Math.atanh(longitudinal)+longitudinalResidual);
      return [nextSteering,Math.max(0,nextLongitudinal),Math.max(0,-nextLongitudinal)];
    }});
  return {name,holdControls,env,trace:crypto.createHash('sha256'),controls:0,samples:[],get gate(){return gateNow;},get residual(){return [steeringResidual,longitudinalResidual];}};
}
function summarize(agent,trackLength){const s=agent.env.state(),c=s.car;return {complete:s.complete===true,progress:s.bestProgress,laps:c.laps,lapTimes:c.lapTimes.slice(),fitness:c.fitness,reason:c.reason,
  totalSimulationSeconds:s.totalSimulationSeconds,controls:agent.controls,along:s.bestProgress-Math.max(0,c.laps||0)*trackLength,speedMps:c.vehicle?.speedMps??0,outputs:c.outputs.slice(),actionTraceSha256:agent.trace.copy().digest('hex'),terminalSamples:agent.samples};}
function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');if(fs.existsSync(out))throw Error('Refusing to overwrite existing diagnostic output');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),radial=JSON.parse(fs.readFileSync(radialFile,'utf8')),
    memory=JSON.parse(fs.readFileSync(memoryFile,'utf8')),telemetry=JSON.parse(fs.readFileSync(telemetryFile,'utf8')),prior=JSON.parse(fs.readFileSync(priorFile,'utf8'));
  if(loaded.sha256!==radial.model.sha256||radial.baseline?.exactReferenceMatch!==true||memory.results?.[0]?.actionTraceSha256!==radial.candidate?.actionTraceSha256||
    telemetry.modelSha256!==loaded.sha256||telemetry.observedActionTraceSha256!==selected.actionTraceSha256||!prior.passed)throw Error('Exact protected V3/Monza trajectory lineage required');
  const coeff=prior.results.toSorted((a,b)=>b.fitnessUsedByCmaEs-a.fitnessUsedByCmaEs)[0]?.coefficients;
  if(!Array.isArray(coeff)||coeff.length!==24)throw Error('Previously measured neuronal residual is required');
  const centres=radial.gate.centres.map(meta=>{const row=telemetry.segments.lap2.find(s=>s.control===meta.control);if(!row||row.features.length!==9)throw Error('Exact target feature missing');return {control:meta.control,features:row.features.slice(),radius:meta.radius};});
  const holds=[0,16,32,64],agents=[];let topology=null;
  for(const hold of holds){const a=makeAgent(loaded,topology,centres,coeff,hold,hold===0?'radial-no-memory-control':`longitudinal-decay-${hold}`);if(!topology)topology=a.env.topology;agents.push(a);}
  let tick=0;const started=Date.now();
  try{
    while(tick<12000&&agents.some(a=>a.env.currentCar().alive)){
      tick++;
      for(const a of agents){if(!a.env.currentCar().alive)continue;const s=a.env.step(),c=s.car;a.controls++;a.trace.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,c.outputs])+'\n');
        if(a.gate>0||a.controls>=8436&&a.controls<=8498)a.samples.push({control:a.controls,progress:s.bestProgress,along:s.bestProgress-Math.max(0,c.laps||0)*telemetry.trackLength,
          speedMps:c.vehicle?.speedMps??0,gate:a.gate,residual:a.residual,outputs:c.outputs.slice()});}
      if(tick%2000===0)console.log('LONGITUDINAL_MEMORY_PROGRESS '+JSON.stringify({tick,agents:agents.map(a=>{const s=a.env.state();return {name:a.name,progress:s.bestProgress,laps:s.laps,alive:a.env.currentCar().alive};})}));
    }
    const results=agents.map(a=>({name:a.name,holdControls:a.holdControls,...summarize(a,telemetry.trackLength)}));
    const control=results[0],controlMatches=control.actionTraceSha256===radial.candidate.actionTraceSha256&&control.progress===radial.candidate.progress&&control.laps===radial.candidate.laps;
    const gpu=Model.stats(),terminated=results.every(r=>r.complete),report={format:'male-cns-statehead-longitudinal-persistence-full-replay-v1',appVersion:'5.6.0',passed:controlMatches&&terminated&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0,
      learningSucceeded:results.some(r=>r.laps>=2),model:{sha256:loaded.sha256,file:selected.file,protectedActionTraceSha256:selected.actionTraceSha256},
      method:'Four fresh-from-line full physical CUDA replays reuse the exact V3/Monza radial neural gate and the same previously measured residual. Steering correction is applied only while the current neural gate is active. The longitudinal correction alone is then linearly decayed for 0, 16, 32 or 64 controls. Zero-memory must reproduce the previous full radial replay exactly. No route, progress, lap, clock, teacher, reward or physics enters inference.',
      controlMatchesPreviousRadialReplay:controlMatches,gate:{centres:centres.map(({features,...m})=>m),protectedPreTargetActivation:0},results,gpu,elapsedWallSeconds:(Date.now()-started)/1000,
      boundary:'Isolated research-only physical A/B. passed records trace/integrity checks, not a learning success. No app, save, version, release, tag or portable was changed.'};
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('LONGITUDINAL_MEMORY_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,controlMatchesPreviousRadialReplay:controlMatches,
      results:results.map(r=>({name:r.name,holdControls:r.holdControls,progress:r.progress,laps:r.laps,fitness:r.fitness,reason:r.reason,controls:r.controls,trace:r.actionTraceSha256})),gpu,output:path.join(out,'report.json')}));
  }finally{for(const a of agents)a.env.close?.();Model.closeCuda();}
}
main();
