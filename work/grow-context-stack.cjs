'use strict';
const fs=require('node:fs'),path=require('node:path'),Stack=require('./neural-context-stack.cjs'),Head=require('./neural-json-head.cjs'),Context=require('./neural-context-readout.cjs'),Bridge=require('./neural-rl-context-state.cjs');
const arg=prefix=>process.argv.find(a=>a.startsWith(prefix))?.slice(prefix.length),stage=Number(arg('--stage=')||2);
if(!Number.isInteger(stage)||stage<2||stage>64)throw Error('Bounded actual stage required');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.impeccable/review/neural-sacl'),modelFile=path.join(dir,'context-stack-'+(stage-1),'model.malecns-neural-context.json'),out=path.join(dir,'context-stack-'+stage);
const model=Stack.load(modelFile),env=Bridge.create();Head.validateEnvironment(model.head,env.metadata());
if(model.data.stages.length!==stage-1)throw Error('Actual parent architecture differs');
fs.mkdirSync(out,{recursive:true});if(fs.existsSync(path.join(out,'prepared.json')))throw Error('Preserve prepared experiment');
let s=env.reset('full');const observations=[];
while(true){observations.push(s.observation.slice());s=env.step(Stack.action(model,s.observation));if(s.terminated||s.truncated)break;}
if(s.truncated)throw Error('Full source episode is unfinished');
const expected=model.data.stages.at(-1).provenance.verifiedFullResult;
for(const k of ['bestProgress','fitness','laps','reason','totalSimulationSeconds'])if(s.info[k]!==expected[k])throw Error('Parent does not reproduce its verified episode: '+k);
const basis=Context.grow(observations),payload={format:'male-cns-observed-stack-basis',schema:1,stage,basis,sourceModelSha256:Head.sha(fs.readFileSync(modelFile,'utf8')),environment:env.metadata(),baseline:s.info};
fs.writeFileSync(path.join(out,'prepared.json'),JSON.stringify(payload,null,2));fs.writeFileSync(path.join(out,'actual-observations.json'),JSON.stringify(observations));
console.log('CONTEXT_STACK_PREPARED '+JSON.stringify({stage,centres:basis.centres.length,protectedCount:basis.protectedCount,fullBaseline:s.info}));
