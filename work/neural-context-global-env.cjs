'use strict';
// Jointly adapt all learned context weights, not only a frozen late extension.
const fs=require('node:fs'),path=require('node:path'),Stack=require('./neural-context-stack.cjs'),Head=require('./neural-json-head.cjs'),Context=require('./neural-context-readout.cjs'),Bridge=require('./neural-rl-context-state.cjs');
const root=path.resolve(__dirname,'..'),file=path.join(root,'.impeccable/review/neural-sacl/context-stack-3/model.malecns-neural-context.json');
function create(){
  const base=Stack.load(file),env=Bridge.create();Head.validateEnvironment(base.head,env.metadata());
  const lengths=base.data.stages.map(s=>s.weights.length),initial=base.data.stages.flatMap(s=>s.weights);
  function candidate(weights){
    if(!Array.isArray(weights)||weights.length!==initial.length||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Bounded joint context weights required');
    let offset=0;return {head:base.head,data:{...base.data,stages:base.data.stages.map((s,i)=>{const next={...s,weights:weights.slice(offset,offset+lengths[i])};offset+=lengths[i];return next;})}};
  }
  let state=env.reset('full'),protectedControls=0;
  while(true){
    if(base.data.stages.some(s=>s.basis.centres.some(c=>Context.feature(state.observation,c,s.basis.scales)>0)))break;
    state=env.step(Stack.action(base,state.observation));protectedControls++;
    if(state.terminated||state.truncated)throw Error('No actual prefix for joint neural weights');
  }
  const prefix=env.capture(),prefixInfo=state.info;
  function evaluate(weights,mode='practice'){
    if(!['practice','full'].includes(mode))throw Error('Invalid evaluation mode');
    const model=candidate(weights);let s=mode==='full'?env.reset('full'):env.restore(prefix),executedControls=0,overlap=0;
    while(true){
      s=env.step(Stack.action(model,s.observation));executedControls++;
      const a=env.inspect().lastCommands;overlap+=Number(a[1]>0&&a[2]>0);
      if(s.terminated||s.truncated)return {result:s.info,censored:s.truncated,mode,executedControls,gasBrakeOverlapSteps:overlap};
    }
  }
  const metadata=()=>({...env.metadata(),decoderRevision:'observed-neural-context-stack-v1',trainingRevision:'joint-context-weights-v1',
    sourceModelSha256:Head.sha(fs.readFileSync(file,'utf8')),learnableParameters:initial.length,initialWeights:initial,protectedControls,physicalPracticePrefix:prefixInfo});
  function exportModel(weights,provenance){
    const model=candidate(weights);model.data={...model.data,jointTraining:provenance};
    // The last stage's reference is the full final model, not the old local run.
    model.data.stages=model.data.stages.map((s,i)=>({...s,provenance:i===model.data.stages.length-1?provenance:{source:s.provenance,jointReportSha256:provenance.reportSha256}}));
    return Stack.encode(model.data);
  }
  return {evaluate,metadata,exportModel};
}
if(require.main===module){
  const readline=require('node:readline');let env;
  readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
    let id=null;try{
      if(line.length>8192)throw Error('Message too large');const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Request ID required');
      let result;if(m.op==='init'){if(env)throw Error('Already initialized');env=create();result=env.metadata();}
      else if(!env)throw Error('Initialize first');else if(m.op==='evaluate')result=env.evaluate(m.weights,m.mode||'practice');
      else if(m.op==='export')result=env.exportModel(m.weights,m.provenance);else if(m.op==='metadata')result=env.metadata();else throw Error('Unsupported operation');
      process.stdout.write(JSON.stringify({id,result})+'\n');
    }catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}
  });
}
module.exports={create};
