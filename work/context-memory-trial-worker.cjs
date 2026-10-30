'use strict';
const {parentPort}=require('node:worker_threads'),path=require('node:path'),Memory=require('./neural-context-memory-live.cjs');
const file=path.resolve(__dirname,'../.impeccable/review/neural-sacl/context-stack-3/model.malecns-neural-context.json');
parentPort.on('message',m=>{
  try{
    const env=Memory.create(file,m.parameters);let s=env.reset(),controls=0,overlap=0;
    do{s=env.step();controls++;overlap+=Number(s.car.outputs[1]>0&&s.car.outputs[2]>0);}while(!s.complete&&s.ticks<120000);
    const {car,ticks,observation,...result}=s;parentPort.postMessage({id:m.id,result:{result,controls,censored:!s.complete,gasBrakeOverlapSteps:overlap,memoryConfiguration:env.memoryConfiguration}});
  }catch(error){parentPort.postMessage({id:m.id,error:error.stack});}
});
