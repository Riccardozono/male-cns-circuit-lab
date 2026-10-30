'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks'),Model=require('./neural-frontier-chain.cjs'),Bridge=require('./neural-command-state.cjs'),Head=require('./neural-json-head.cjs');
function create({preparedFile}={}){
  if(process.versions.node!=='24.19.0'||typeof preparedFile!=='string')throw Error('Pinned runtime and actual chain context required');const prepared=JSON.parse(fs.readFileSync(preparedFile,'utf8')),loaded=Model.load(prepared.modelFile,{allowExploration:true});
  if(prepared.format!=='male-cns-actual-neuronal-chain-context-v1'||loaded.sha256!==prepared.modelSha256||!loaded.data.stages.length)throw Error('Actual prepared chain checksum mismatch');
  const env=Bridge.create(),brain=Model.controller(loaded);let lastInfo;
  function full(){brain.reset();const s=env.reset('full');brain.observe(s.observation);lastInfo=s.info;return s;}
  function step(genes){Model.coefficient(genes);const state=brain.snapshot(),commands=brain.compose(env.priorCommands(state.old),genes),s=env.stepMotor(commands);if(!s.terminated)brain.observe(s.observation);lastInfo={...s.info,legacyDiagnosticThresholdReached:!!s.truncated,neuronalLateGate:brain.lastGate()};return {...s,truncated:false,info:lastInfo};}
  full();let protectedControls=0;const prefixStarted=performance.now();while(brain.lastGate()===0){if(performance.now()-prefixStarted>180000)throw Error('Actual prefix preparation exceeded wall diagnostic; not a physical termination');const s=step([0,0]);protectedControls++;if(s.terminated)throw Error('No live actually reached new context');}
  if(protectedControls!==prepared.firstActivatedControl)throw Error('Actual neuronal activation differs from preparation');const prefix={physics:env.capture(),brain:brain.capture()};
  function reset(mode='practice'){if(mode==='full')return full();if(mode!=='practice')throw Error('Actual full or cached practice mode required');const s=env.restore(prefix.physics);brain.restore(prefix.brain);lastInfo=s.info;return s;}
  function evaluate(genes,{mode='full',watchdogMs=180000}={}){
    Model.coefficient(genes);if(!Number.isFinite(watchdogMs)||watchdogMs<1000||watchdogMs>180000)throw Error('Bounded wall diagnostic required');const started=performance.now(),trace=crypto.createHash('sha256');let s=reset(mode),controls=0,overlap=0;
    while(!s.terminated&&performance.now()-started<watchdogMs){s=step(genes);controls++;const commands=env.inspect().lastCommands;overlap+=Number(Math.min(commands[1],commands[2])!==0);trace.update(JSON.stringify([s.info.bestProgress,s.info.totalSimulationSeconds,commands])+'\n');}
    return {result:s.info,validationMode:mode,complete:s.terminated===true,censored:s.terminated!==true,actualActorControls:controls,gasBrakeOverlapSteps:overlap,actionTraceSha256:trace.digest('hex'),wallSeconds:(performance.now()-started)/1000};
  }
  const metadata=()=>({...env.metadata(),format:'male-cns-neuronal-frontier-chain-env-v1',decoderRevision:'neuronal-frontier-chain-v1',stageCount:loaded.data.stages.length,baseModelSha256:loaded.sha256,preparationSha256:Head.sha(fs.readFileSync(preparedFile,'utf8')),protectedControls,plasticParameters:2,
    sourceHashes:Object.fromEntries(['neural-frontier-chain-env.cjs','neural-frontier-chain.cjs','neural-command-state.cjs'].map(f=>[f,Head.sha(fs.readFileSync(path.join(__dirname,f),'utf8'))])),
    boundary:'Full actual parent controller and every neuronal context memory restored with locally captured physics. Only two new learned coefficients vary; no geometric/clock/target controls. Old exploration branch not promoted. Cached practice is not an app generation; full independent native proofs remain mandatory.'});
  return {reset,step,evaluate,metadata,prepared};
}
if(require.main===module){let env;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{if(line.length>8192)throw Error('Bounded request required');const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Request ID required');let result;if(m.op==='init'){if(env)throw Error('Already initialized');env=create(m.configuration);result=env.metadata();}else if(!env)throw Error('Initialize first');else if(m.op==='evaluate')result=env.evaluate(m.genes,{mode:m.mode,watchdogMs:m.watchdogMs});else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');}catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}});}
module.exports={create};
