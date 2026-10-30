'use strict';
const fs=require('node:fs'),path=require('node:path'),Stack=require('./neural-context-stack.cjs'),Head=require('./neural-json-head.cjs'),Context=require('./neural-context-readout.cjs'),Bridge=require('./neural-rl-context-state.cjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.impeccable/review/neural-sacl');
function create(stage=2){
  if(!Number.isInteger(stage)||stage<2||stage>64)throw Error('Actual stage required');
  const modelFile=path.join(dir,'context-stack-'+(stage-1),'model.malecns-neural-context.json'),basisFile=path.join(dir,'context-stack-'+stage,'prepared.json');
  const model=Stack.load(modelFile),prepared=JSON.parse(fs.readFileSync(basisFile,'utf8')),basis=prepared.basis,env=Bridge.create();Stack.validateBasis(basis);
  if(prepared.sourceModelSha256!==Head.sha(fs.readFileSync(modelFile,'utf8'))||prepared.stage!==stage||model.data.stages.length!==stage-1)throw Error('Changed actual parent model');
  Head.validateEnvironment(model.head,env.metadata());if(JSON.stringify(prepared.environment)!==JSON.stringify(env.metadata()))throw Error('Changed physical environment');
  const zeros=Array(basis.centres.length*2).fill(0);let state=env.reset('full'),protectedControls=0;
  while(true){
    if(basis.centres.some(c=>Context.feature(state.observation,c,basis.scales)>0))break;
    state=env.step(Stack.action(model,state.observation));protectedControls++;
    if(state.terminated||state.truncated)throw Error('No actual prefix for new contexts');
  }
  if(protectedControls<basis.protectedCount)throw Error('Prefix protection failed');
  const prefix=env.capture(),prefixInfo=state.info;
  function evaluate(weights,mode='practice',trace=false){
    if(!['practice','full'].includes(mode)||weights.length!==zeros.length||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Invalid context trial');
    let s=mode==='full'?env.reset('full'):env.restore(prefix),executedControls=0,overlap=0;const observations=[];
    while(true){
      if(trace)observations.push(s.observation.slice());
      s=env.step(Stack.adjust(Stack.action(model,s.observation),s.observation,basis,weights));executedControls++;
      const a=env.inspect().lastCommands;overlap+=Number(a[1]>0&&a[2]>0);
      if(s.terminated||s.truncated)return {result:s.info,censored:s.truncated,mode,executedControls,gasBrakeOverlapSteps:overlap,observations};
    }
  }
  const metadata=()=>({...env.metadata(),decoderRevision:'observed-neural-context-stack-v1',stage,
    sourceModelSha256:prepared.sourceModelSha256,basisSha256:Head.sha(fs.readFileSync(basisFile,'utf8')),contextCentres:basis.centres.length,learnableParameters:zeros.length,protectedControls,physicalPracticePrefix:prefixInfo,
    boundary:'Fixed prior learned stages plus new observation-only coefficients. Restored practice is real cached prefix, not independent full-generation evidence.'});
  function exportModel(weights,provenance){return Stack.encode(Stack.append(model,basis,weights,provenance).data);}
  return {evaluate,metadata,zeros,exportModel};
}
if(require.main===module){
  const readline=require('node:readline');let env;
  readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
    let id=null;try{
      if(line.length>8192)throw Error('Message too large');const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Request ID required');
      let result;if(m.op==='init'){if(env)throw Error('Already initialized');env=create(m.stage||2);result=env.metadata();}
      else if(!env)throw Error('Initialize first');else if(m.op==='evaluate')result=env.evaluate(m.weights,m.mode||'practice');
      else if(m.op==='metadata')result=env.metadata();else if(m.op==='export')result=env.exportModel(m.weights,m.provenance);else throw Error('Unsupported operation');
      process.stdout.write(JSON.stringify({id,result})+'\n');
    }catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}
  });
}
module.exports={create};
