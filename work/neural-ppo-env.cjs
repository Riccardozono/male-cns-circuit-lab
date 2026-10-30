'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const Origin=require('./neural-statehead-model.cjs'),Chain=require('./neural-frontier-chain.cjs'),State=require('./neural-statehead.cjs'),R=require('./neural-projected-residual.cjs'),Bridge=require('./neural-command-state.cjs'),Policy=require('./neural-ppo-policy.cjs'),{rng}=require('../outputs/simulation.js');
function create({modelFile,preparedFile,seed=161026}={}){
  if(process.versions.node!=='24.19.0')throw Error('Pinned numerical runtime required');
  const loaded=Origin.load(modelFile),prepared=JSON.parse(fs.readFileSync(preparedFile,'utf8')),env=Bridge.create(),chain=Chain.controller(loaded.parent),head=State.create(loaded.data),gate=R.createGate(prepared.basis),random=rng(seed);
  let state,previous=[0,0],prefix,protectedControls=0,prefixTrace=crypto.createHash('sha256');
  function observe(){chain.observe(state.observation);head.observe(state.observation);gate.observe(state.observation);}
  function parent(){return head.compose(chain.compose(env.priorCommands(chain.snapshot().old)),loaded.data.weights);}
  function feature(){return Policy.features(head.features(),parent(),previous);}
  function line(){return JSON.stringify([state.info.bestProgress,state.info.totalSimulationSeconds,env.inspect().lastCommands])+'\n';}
  function full(){chain.reset();head.reset();gate.reset();previous=[0,0];state=env.reset('full');observe();return state;}
  function step(action){state=env.stepMotor(Policy.compose(parent(),gate.value(),action));previous=action.map(Math.tanh);if(!state.terminated)observe();return state;}
  full();while(gate.value()===0){step([0,0]);prefixTrace.update(line());protectedControls++;if(state.terminated)throw Error('Prefix must be actually reachable and live');}
  if(protectedControls!==prepared.firstActivatedControl)throw Error('Observed prefix differs from prepared context');
  prefix={physics:env.capture(),chain:chain.capture(),head:head.capture(),gate:gate.capture(),previous:previous.slice()};
  function reset(mode='practice'){if(mode==='full')return full();if(mode!=='practice')throw Error('Explicit actual reset required');state=env.restore(prefix.physics);chain.restore(prefix.chain);head.restore(prefix.head);gate.restore(prefix.gate);previous=prefix.previous.slice();return state;}
  function normal(){return Math.sqrt(-2*Math.log(Math.max(1e-12,random())))*Math.cos(2*Math.PI*random());}
  function rollout(w,std,steps){Policy.weights(w);if(!Array.isArray(std)||std.length!==2||std.some(v=>!Number.isFinite(v)||v<.001||v>1)||!Number.isInteger(steps)||steps<1||steps>512)throw Error('Bounded rollout configuration required');
    const rows=[],episodes=[];for(let k=0;k<steps;k++){if(state.terminated)reset();const x=feature(),mu=Policy.mean(x,w),action=mu.map((v,j)=>v+std[j]*normal());const s=step(action);rows.push({x,mean:mu,action,reward:s.reward,done:s.terminated,next:s.terminated?Array(Policy.DIM).fill(0):feature()});if(s.terminated)episodes.push({...s.info});}return {rows,episodes};
  }
  function evaluate(w,mode='practice'){Policy.weights(w);reset(mode);let hash=mode==='practice'?prefixTrace.copy():crypto.createHash('sha256'),controls=0,overlap=0;const started=performance.now();while(!state.terminated&&performance.now()-started<180000){step(Policy.mean(feature(),w));hash.update(line());controls++;overlap+=Number(Math.min(...env.inspect().lastCommands.slice(1))>0);}return {complete:!!state.terminated,censored:!state.terminated,result:state.info,validationMode:mode,controls,overlap,actionTraceSha256:hash.digest('hex'),wallSeconds:(performance.now()-started)/1000};}
  return {rollout,evaluate,reset:()=>{reset();return {reset:true};},metadata:()=>({...env.metadata(),format:'male-cns-neuronal-ppo-transport-v1',modelSha256:loaded.sha256,protectedControls,features:Policy.DIM,weights:Policy.DIM*2,actorInputs:'9 actual neural projection values, 2 actual parent commands, 2 previous residual values; no geometry, clock, laps, fitness or target actions',boundary:'Practice rollouts restore a genuinely reached state including every controller memory. Practice episodes are not generations or full independent laps. Promotion requires independent complete native proofs.'})};
}
if(require.main===module){let env;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{if(line.length>16384)throw Error('Bounded request required');const m=JSON.parse(line);id=m.id;let result;if(m.op==='init'){if(env)throw Error('Already initialized');env=create(m.configuration);result=env.metadata();}else if(!env)throw Error('Initialize first');else if(m.op==='rollout')result=env.rollout(m.weights,m.std,m.steps);else if(m.op==='evaluate')result=env.evaluate(m.weights,m.mode);else if(m.op==='reset')result=env.reset();else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');}catch(e){process.stdout.write(JSON.stringify({id,error:e.stack})+'\n');}});}
module.exports={create};
