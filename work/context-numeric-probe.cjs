'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Live=require('./neural-context-live.cjs');
const host=process.argv.find(a=>a.startsWith('--host='))?.slice(7)||'node';if(!/^[a-z0-9-]+$/.test(host))throw Error('Host label required');
const root=path.resolve(__dirname,'..'),env=Live.create(path.join(root,'.impeccable/review/neural-sacl/context-stack-3/model.malecns-neural-context.json')),rows=[];
env.reset();let s=env.state();
while(!s.complete&&s.ticks<120000){
  const activity=s.car.brain.activity;
  rows.push({ticks:s.ticks,x:s.car.x,y:s.car.y,heading:s.car.heading,progress:s.bestProgress,
    brainSha256:crypto.createHash('sha256').update(Buffer.from(activity.buffer,activity.byteOffset,activity.byteLength)).digest('hex'),
    memory:s.car.brain.decoderMemory.slice(),observationHead:s.observation.slice(0,8),controls:s.car.outputs.slice()});
  s=env.step();
}
const out=path.join(root,'.impeccable/review/neural-sacl/runtime-numeric-audit');fs.mkdirSync(out,{recursive:true});
const report={host,nodeVersion:process.versions.node,electronVersion:process.versions.electron||null,rows,result:{progress:s.bestProgress,fitness:s.fitness,laps:s.laps,reason:s.reason,seconds:s.totalSimulationSeconds}};
fs.writeFileSync(path.join(out,host+'.json'),JSON.stringify(report));console.log('NUMERIC_PROBE '+JSON.stringify({...report,rows:undefined}));
