'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks'),Origin=require('./neural-statehead-model.cjs'),Chain=require('./neural-frontier-chain.cjs'),State=require('./neural-statehead.cjs'),Bridge=require('./neural-command-state-cuda-packed.cjs'),Core=require('./neural-instant-context.cjs'),Cuda=require('./cuda-exact-v3-packed-runtime.cjs');
function create({modelFile,preparedFile}={}){
 const loaded=Origin.load(modelFile),p=JSON.parse(fs.readFileSync(preparedFile,'utf8'));
 if(process.versions.node!=='24.19.0'||p.format!=='male-cns-actual-instant-neural-context-preparation-v1'||p.modelSha256!==loaded.sha256)throw Error('Pinned distinct actual instantaneous context preparation required');
 const zero=Array(p.basis.centres.length*2).fill(0);Core.validate(p.basis,zero);
 const env=Bridge.create(),chain=Chain.controller(loaded.parent),head=State.create(loaded.data);let state,prefix,controls=0,prefixTrace=crypto.createHash('sha256');
 const observe=()=>{chain.observe(state.observation);head.observe(state.observation);};
 const parent=()=>head.compose(chain.compose(env.priorCommands(chain.snapshot().old)),loaded.data.weights);
 function full(){chain.reset();head.reset();state=env.reset('full');observe();return state;}
 function step(genes){state=env.stepMotor(Core.compose(parent(),state.observation,p.basis,genes));if(!state.terminated)observe();return state;}
 const line=()=>JSON.stringify([state.info.bestProgress,state.info.totalSimulationSeconds,env.inspect().lastCommands])+'\n';
 full();while(!Core.features(state.observation,p.basis).some(v=>v>0)){step(zero);controls++;prefixTrace.update(line());if(state.terminated)throw Error('Context must be actually reachable');}
 if(controls!==p.firstActivatedControl)throw Error('Prepared and actual context onset differ');
 prefix={physics:env.capture(),chain:chain.capture(),head:head.capture()};
 function reset(mode='practice'){if(mode==='full')return full();if(mode!=='practice')throw Error('Explicit reached-prefix reset required');state=env.restore(prefix.physics);chain.restore(prefix.chain);head.restore(prefix.head);return state;}
 function evaluate(weights,mode='practice'){
  Core.validate(p.basis,weights);reset(mode);const trace=mode==='practice'?prefixTrace.copy():crypto.createHash('sha256'),start=performance.now();let steps=0,overlap=0;
  while(!state.terminated&&performance.now()-start<180000){step(weights);steps++;trace.update(line());overlap+=Number(Math.min(...env.inspect().lastCommands.slice(1))>0);}
  return {complete:!!state.terminated,censored:!state.terminated,result:state.info,validationMode:mode,controls:steps,overlap,actionTraceSha256:trace.digest('hex'),wallSeconds:(performance.now()-start)/1000};
 }
 return {evaluate,metadata:()=>({...env.metadata(),format:'male-cns-private-instant-context-cuda-transport-v1',modelSha256:loaded.sha256,features:p.basis.centres.length,weights:zero.length,protectedControls:controls,motorRevision:'instant-neuronal-context-direct-motor-v1',cuda:{identity:Cuda.identity(),stats:Cuda.stats()},boundary:'Only current actual neuronal/controller observations drive learned bounded local corrections; no retained gate, route, physical targets or teacher actions. Prefix capture is actual practice state, not a new independent full lap.'}),reset:()=>{reset();return {reset:true};}};
}
if(require.main===module){let env;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{if(line.length>256*1024)throw Error('Bounded context message required');const m=JSON.parse(line);id=m.id;let result;if(m.op==='init'){if(env)throw Error('Already initialized');env=create(m.configuration);result=env.metadata();}else if(!env)throw Error('Initialize first');else if(m.op==='evaluate')result=env.evaluate(m.weights,m.mode);else if(m.op==='metadata')result=env.metadata();else if(m.op==='reset')result=env.reset();else throw Error('Unsupported context operation');process.stdout.write(JSON.stringify({id,result})+'\n');}catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}});}
module.exports={create};
