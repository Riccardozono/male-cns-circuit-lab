'use strict';
// A trainable continuous residual with retained neuronal-context authority.
// Activation is observed neural activity, never a position/time threshold.
const fs=require('node:fs'),path=require('node:path'),Stack=require('./neural-context-stack.cjs'),Head=require('./neural-json-head.cjs'),Context=require('./neural-context-readout.cjs'),Bridge=require('./neural-rl-context-state.cjs');
const root=path.resolve(__dirname,'..'),modelFile=path.join(root,'.impeccable/review/neural-sacl/context-stack-3/model.malecns-neural-context.json');
const gateFile=path.join(root,'.impeccable/review/neural-sacl/context-stack-4/prepared.json');
const atanh=v=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,v)));
function create(){
  const model=Stack.load(modelFile),env=Bridge.create(),prepared=JSON.parse(fs.readFileSync(gateFile,'utf8')),gateBasis=prepared.basis;
  if(prepared.sourceModelSha256!==Head.sha(fs.readFileSync(modelFile,'utf8')))throw Error('Changed own observed gate source');
  Stack.validateBasis(gateBasis);Head.validateEnvironment(model.head,env.metadata());
  let raw,base,gate=0,initialFitness;
  function observe(s){
    raw=s.observation.slice();base=Stack.action(model,raw);
    for(const c of gateBasis.centres)gate=Math.max(gate,Context.feature(raw,c,gateBasis.scales));
    return raw.concat(base,[gate]);
  }
  let state=env.reset('full'),protectedControls=0;
  while(!gateBasis.centres.some(c=>Context.feature(state.observation,c,gateBasis.scales)>0)){
    state=env.step(Stack.action(model,state.observation));protectedControls++;
    if(state.terminated||state.truncated)throw Error('No actual context-activation prefix');
  }
  const prefix=env.capture();
  function reset(mode='practice'){
    if(!['full','practice'].includes(mode))throw Error('Invalid reset mode');gate=0;
    const s=mode==='full'?env.reset('full'):env.restore(prefix);initialFitness=s.info.fitness;
    return {observation:observe(s),info:s.info};
  }
  function step(action){
    if(!Array.isArray(action)||action.length!==2||action.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Bounded neural residual required');
    const a=base.slice();for(let k=0;k<2;k++)if(action[k]!==0&&gate!==0)a[k+2]=Math.tanh(atanh(a[k+2])+gate*2*action[k]*(k===0?.5:1));
    const s=env.step(a),commands=env.inspect().lastCommands;
    if(Math.min(commands[1],commands[2])!==0)throw Error('Overlapping motor pedals');
    return {...s,observation:observe(s),info:{...s.info,residualGate:gate,protectedControls,trainingRewardSinceReset:(s.info.fitness-initialFitness)/100}};
  }
  const metadata=()=>({...env.metadata(),format:'male-cns-neural-context-residual-v3',decoderRevision:'fullrange-observed-context-residual-v3',observationLength:521,actionDimensions:2,
    sourceModelSha256:Head.sha(fs.readFileSync(modelFile,'utf8')),gateBasisSha256:Head.sha(fs.readFileSync(gateFile,'utf8')),protectedControls,residualScale:[1,2],
    boundary:'521 inputs: actual neuronal history, old motor memory/outputs, current own learned action and retained observed-context activation. No pose/time/route/target action inputs. Practice prefix physically reached; only full resets validate laps.'});
  return {reset,step,metadata,inspect:()=>env.inspect()};
}
if(require.main===module){
  const readline=require('node:readline');let env;
  readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
    let id=null;try{
      if(line.length>8192)throw Error('Message too large');const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Request ID required');
      let result;if(m.op==='init'){if(env)throw Error('Already initialized');env=create();result=env.metadata();}
      else if(!env)throw Error('Initialize first');else if(m.op==='reset')result=env.reset(m.mode);else if(m.op==='step')result=env.step(m.action);else if(m.op==='metadata')result=env.metadata();else throw Error('Unsupported operation');
      process.stdout.write(JSON.stringify({id,result})+'\n');
    }catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}
  });
}
module.exports={create};
