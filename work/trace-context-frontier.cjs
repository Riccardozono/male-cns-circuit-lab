'use strict';
const fs=require('node:fs'),path=require('node:path'),Live=require('./neural-context-live.cjs'),Head=require('./neural-json-head.cjs'),Stack=require('./neural-context-stack.cjs'),Context=require('./neural-context-readout.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/neural-sacl/frontier-1990');
fs.mkdirSync(out,{recursive:true});if(fs.existsSync(path.join(out,'report.json')))throw Error('Preserve existing diagnostic');
const modelFile=path.join(root,'.impeccable/review/neural-sacl/context-stack-3/model.malecns-neural-context.json'),env=Live.create(modelFile),rows=[];
let s=env.reset(),authority=0;
while(!s.complete&&s.ticks<120000){
  const observation=s.observation.slice(),oldActor=Head.actor(env.model.head,observation),action=Stack.action(env.model,observation),features=env.model.data.stages.flatMap(stage=>stage.basis.centres.map(c=>Context.feature(observation,c,stage.basis.scales)));
  authority=Math.max(authority,Math.min(1,Math.hypot(...s.car.brain.decoderMemory)*5));
  const pre={observation,oldActor,action,features,authority,oldMotor:observation.slice(514),memory:s.car.brain.decoderMemory.slice()};
  s=env.step();const c=s.car;
  rows.push({...pre,progress:c.bestProgress,speedKmh:c.vehicle.speedMps*3.6,outputs:c.outputs.slice(),gear:c.vehicle.gear,rpm:c.vehicle.rpm,
    steeringAngle:c.vehicle.steeringAngle,fitness:c.fitness,alive:c.alive,reason:c.reason,seconds:s.totalSimulationSeconds});
}
const expected=env.model.data.stages.at(-1).provenance.verifiedFullResult;
if(s.bestProgress!==expected.bestProgress||s.fitness!==expected.fitness||!s.complete)throw Error('Frontier replay differs');
fs.writeFileSync(path.join(out,'actual-trace.json'),JSON.stringify(rows));
const active=rows.filter(r=>r.progress>1800),report={passed:true,result:{progress:s.bestProgress,fitness:s.fitness,laps:s.laps,reason:s.reason},
  samples:rows.length,lateSamples:active.length,lateContextCoverage:active.filter(r=>r.features.some(v=>v>0)).length,
  lateMeanGas:active.reduce((n,r)=>n+r.outputs[1],0)/active.length,lateMeanBrake:active.reduce((n,r)=>n+r.outputs[2],0)/active.length,
  last:rows.at(-1),modelSha256:env.modelSha256,boundary:'Actual full closed-loop telemetry; body fields are diagnostics and do not enter the neural actor. No prescribed actions or reward modifications.'};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log('FRONTIER_DIAGNOSIS '+JSON.stringify({...report,last:{...report.last,observation:undefined,features:report.last.features.map(v=>Number(v.toFixed(5)))}}));
