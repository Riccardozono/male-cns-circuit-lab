'use strict';
// Fast tail evaluations cache only a physically reached, causally identical
// neural prefix. They are practice episodes, never validated complete laps.
const fs=require('node:fs'),path=require('node:path'),Head=require('./neural-json-head.cjs'),Context=require('./neural-context-readout.cjs'),Bridge=require('./neural-rl-context-state.cjs');
const root=path.resolve(__dirname,'..'),headFile=path.join(root,'.impeccable/review/neural-sacl/native-neural-head/learned-head.malecns-neural-exp.json'),basisFile=path.join(root,'.impeccable/review/neural-sacl/context-growth-first/prepared.json');
function create(){
  const head=Head.load(headFile),prepared=JSON.parse(fs.readFileSync(basisFile,'utf8')),basis=prepared.basis,env=Bridge.create();
  if(prepared.sourceHeadSha256!==Head.sha(fs.readFileSync(headFile,'utf8')))throw Error('Changed source neural head');
  Head.validateEnvironment(head,env.metadata());if(JSON.stringify(prepared.environment)!==JSON.stringify(env.metadata()))throw Error('Context basis environment differs');
  const zeros=Array(basis.centres.length*2).fill(0);
  let state=env.reset('full'),protectedControls=0;
  while(true){
    if(basis.centres.some(c=>Context.feature(state.observation,c,basis.scales)>0))break;
    state=env.step(Head.action(head,state.observation));protectedControls++;
    if(state.terminated||state.truncated)throw Error('No actual live prefix for new neural contexts');
  }
  if(protectedControls<basis.protectedCount)throw Error('Observed prefix protection failed');
  const prefix=env.capture(),prefixInfo=state.info;
  function evaluate(weights,mode='practice',trace=false){
    if(!['practice','full'].includes(mode)||weights.length!==zeros.length||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Invalid bounded context trial');
    let s=mode==='full'?env.reset('full'):env.restore(prefix),executedControls=0,overlap=0;
    const observations=[];
    while(true){
      if(trace)observations.push(s.observation.slice());
      s=env.step(Context.action(head,s.observation,basis,weights));executedControls++;
      const a=env.inspect().lastCommands;overlap+=Number(a[1]>0&&a[2]>0);
      if(s.terminated||s.truncated)return {result:s.info,censored:s.truncated,mode,executedControls,gasBrakeOverlapSteps:overlap,observations};
    }
  }
  const metadata=()=>({...env.metadata(),decoderRevision:'observed-neural-context-readout-v1',sourceHeadSha256:prepared.sourceHeadSha256,
    basisSha256:Head.sha(fs.readFileSync(basisFile,'utf8')),contextCentres:basis.centres.length,learnableParameters:zeros.length,protectedControls,
    physicalPracticePrefix:prefixInfo,boundary:'Only actual neuronal observations enter the learned motor functions. Tail resets restore this environment\'s own real prefix. Practice results are not independent full-generation evidence.'});
  return {evaluate,metadata,zeros,head,basis};
}
if(require.main===module){
  const readline=require('node:readline');let env;
  readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
    let id=null;try{
      if(line.length>8192)throw Error('Message too large');const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Request ID required');
      let result;if(m.op==='init'){if(env)throw Error('Already initialized');env=create();result=env.metadata();}
      else if(!env)throw Error('Initialize first');else if(m.op==='evaluate')result=env.evaluate(m.weights,m.mode||'practice');
      else if(m.op==='metadata')result=env.metadata();else throw Error('Unsupported operation');
      process.stdout.write(JSON.stringify({id,result})+'\n');
    }catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}
  });
}
module.exports={create};
