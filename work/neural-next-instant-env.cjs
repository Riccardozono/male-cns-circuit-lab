'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks'),Model=require('./neural-instant-context-model.cjs'),Origin=require('./neural-statehead-model.cjs'),Chain=require('./neural-frontier-chain.cjs'),State=require('./neural-statehead.cjs'),Bridge=require('./neural-command-state-cuda-packed.cjs'),Core=require('./neural-instant-context.cjs'),Cuda=require('./cuda-exact-v3-packed-runtime.cjs');
function create({modelFile,preparedFile}={}){
 const winner=Model.load(modelFile),loaded=Origin.load(winner.parentFile),old=JSON.parse(winner.data.preparedText),p=JSON.parse(fs.readFileSync(preparedFile,'utf8'));
 if(process.versions.node!=='24.19.0'||p.format!=='male-cns-next-instant-context-preparation-v1'||p.modelSha256!==winner.sha256)throw Error('Exact verified parent and next context required');
 const zero=Array(p.basis.centres.length*2).fill(0);Core.validate(p.basis,zero);
 const env=Bridge.create(),chain=Chain.controller(loaded.parent),head=State.create(loaded.data);let state,controls=0,prefixTrace=crypto.createHash('sha256');
 const observe=()=>{chain.observe(state.observation);head.observe(state.observation);};
 function full(){chain.reset();head.reset();state=env.reset('full');observe();return state;}
 function step(weights){const parent=head.compose(chain.compose(env.priorCommands(chain.snapshot().old)),loaded.data.weights),prior=Core.compose(parent,state.observation,old.basis,winner.data.weights);state=env.stepMotor(Core.compose(prior,state.observation,p.basis,weights));if(!state.terminated)observe();return state;}
 const line=()=>JSON.stringify([state.info.bestProgress,state.info.totalSimulationSeconds,env.inspect().lastCommands])+'\n';
 full();while(!Core.features(state.observation,p.basis).some(v=>v>0)){step(zero);controls++;prefixTrace.update(line());if(state.terminated)throw Error('New context not actually reachable');}
 if(controls!==p.firstActivatedControl)throw Error('Context onset differs');
 const prefix={physics:env.capture(),chain:chain.capture(),head:head.capture()};
 function reset(mode){if(mode==='full')return full();if(mode!=='practice')throw Error('Explicit reset required');state=env.restore(prefix.physics);chain.restore(prefix.chain);head.restore(prefix.head);return state;}
 function evaluate(weights,mode='practice'){
  Core.validate(p.basis,weights);reset(mode);const trace=mode==='practice'?prefixTrace.copy():crypto.createHash('sha256'),start=performance.now();let steps=0,overlap=0;
  while(!state.terminated&&performance.now()-start<180000){step(weights);steps++;trace.update(line());overlap+=Number(Math.min(...env.inspect().lastCommands.slice(1))>0);}
  return {complete:!!state.terminated,censored:!state.terminated,result:state.info,validationMode:mode,controls:steps,overlap,actionTraceSha256:trace.digest('hex')};
 }
 return {evaluate,metadata:()=>({...env.metadata(),format:'male-cns-next-instant-context-transport-v1',modelSha256:winner.sha256,protectedControls:controls,dimensions:zero.length,cuda:{identity:Cuda.identity(),stats:Cuda.stats()},boundary:'Frozen verified parent plus new instantaneous actual-neuronal contexts. No route/clock/pose/teacher. Practice reset is not an independent full lap.'})};
}
if(require.main===module){let env;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{if(line.length>262144)throw Error('Bounded request required');const m=JSON.parse(line);id=m.id;let result;if(m.op==='init'){if(env)throw Error('Already initialized');env=create(m.configuration);result=env.metadata();}else if(!env)throw Error('Initialize first');else if(m.op==='evaluate')result=env.evaluate(m.weights,m.mode);else if(m.op==='metadata')result=env.metadata();else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');}catch(e){process.stdout.write(JSON.stringify({id,error:e.stack})+'\n');}});}
module.exports={create};
