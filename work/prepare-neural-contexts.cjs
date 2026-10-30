'use strict';
const fs=require('node:fs'),path=require('node:path'),Head=require('./neural-json-head.cjs'),Context=require('./neural-context-readout.cjs'),Bridge=require('./neural-rl-context-state.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/neural-sacl/context-growth-first');
fs.mkdirSync(out,{recursive:true});if(fs.existsSync(path.join(out,'prepared.json')))throw Error('Preserve the existing experiment');
const source=path.join(root,'.impeccable/review/neural-sacl/native-neural-head/learned-head.malecns-neural-exp.json'),head=Head.load(source),env=Bridge.create();Head.validateEnvironment(head,env.metadata());
let s=env.reset('full');const observations=[],telemetry=[];
while(true){
  observations.push(s.observation.slice());s=env.step(Head.action(head,s.observation));
  const v=env.inspect(),c=v.car;telemetry.push({progress:c.bestProgress,speedKmh:c.vehicle.speedMps*3.6,commands:v.lastCommands.slice(),memory:c.brain.decoderMemory.slice()});
  if(s.terminated||s.truncated)break;
}
if(s.truncated)throw Error('Physical episode is unfinished');
const basis=Context.grow(observations),result=s.info;
const payload={format:'male-cns-observed-context-basis',schema:1,basis,sourceHeadSha256:Head.sha(fs.readFileSync(source,'utf8')),environment:env.metadata(),baseline:result,
  boundary:'Every context centre is an observation reached in an actual full physical episode. No coordinates/time/control targets in basis; no added biological neurons. Prefix preservation is tested independently.'};
fs.writeFileSync(path.join(out,'prepared.json'),JSON.stringify(payload,null,2));
fs.writeFileSync(path.join(out,'actual-observations.json'),JSON.stringify(observations));
fs.writeFileSync(path.join(out,'diagnostic-telemetry.json'),JSON.stringify(telemetry));
console.log('NEURAL_CONTEXTS_PREPARED '+JSON.stringify({centres:basis.centres.length,protectedCount:basis.protectedCount,observations:observations.length,baseline:result}));
