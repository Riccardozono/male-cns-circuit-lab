'use strict';
// Fitness-only late neuronal refinement of a physically reached exploration
// branch. No body/pose/time/route/target driving actions enter inference.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks'),Head=require('./neural-json-head.cjs'),Model=require('./neural-projected-frontier-model.cjs'),R=require('./neural-projected-residual.cjs'),Bridge=require('./neural-command-state.cjs'),Motor=require('./neural-command-residual.cjs');
const hash=file=>Head.sha(fs.readFileSync(file,'utf8'));
function correction(genes){if(!Array.isArray(genes)||genes.length!==2||genes.some(v=>!Number.isFinite(v)||Math.abs(v)>100))throw Error('Two bounded learned neuronal coefficients required');return [Math.tanh(.2*genes[0]),Math.tanh(genes[1])];}
function create({preparedFile}={}){
  if(process.versions.node!=='24.19.0'||typeof preparedFile!=='string')throw Error('Pinned runtime and actual context preparation required');
  const prepared=JSON.parse(fs.readFileSync(preparedFile,'utf8'));
  if(prepared.format!=='male-cns-private-neuronal-branch-context-v1'||prepared.appVersion!=='5.6.0'||hash(prepared.branchReportFile)!==prepared.branchReportSha256||hash(prepared.branchActorFile)!==prepared.branchActorSha256)throw Error('Actual branch/context integrity mismatch');
  const source=JSON.parse(fs.readFileSync(prepared.parentPreparedFile,'utf8')),actor=JSON.parse(fs.readFileSync(prepared.branchActorFile,'utf8')),loaded=Model.load(source.parentModelFile);R.validateActor(actor);R.validateNormalization(source.normalization);
  if(loaded.sha256!==source.parentModelSha256)throw Error('Frozen actual anatomical parent differs');
  const env=Bridge.create(),parent=R.createParent(loaded),first=R.createGate(source.basis),late=R.createGate(prepared.basis);let raw,base,inner,gate1,lastInfo;
  function observe(s){raw=s.observation.slice();base=parent.action(raw);gate1=first.observe(raw);inner=R.forward(actor,R.normalize(raw.concat(base,[gate1]),source.normalization));late.observe(raw);}
  function resetFull(){parent.reset();first.reset();late.reset();const s=env.reset('full');observe(s);lastInfo=s.info;return s;}
  function step(genes){
    const prior=Motor.compose(env.priorCommands(base),gate1,inner),commands=Motor.compose(prior,late.value(),correction(genes)),s=env.stepMotor(commands);
    if(!s.terminated)observe(s);lastInfo={...s.info,legacyDiagnosticThresholdReached:!!s.truncated};
    return {...s,truncated:false,info:{...lastInfo,neuronalLateGate:late.value()}};
  }
  resetFull();let protectedControls=0;
  while(late.value()===0){const s=step([0,0]);protectedControls++;if(s.terminated)throw Error('No live actually reached late context');}
  if(protectedControls!==prepared.firstActivatedControl)throw Error('Actually reached context activation differs from the recorded preparation');
  const prefix={physics:env.capture(),parent:parent.capture(),first:first.capture(),late:late.capture(),raw:raw.slice(),base:base.slice(),inner:inner.slice(),gate1,info:{...lastInfo}};
  function reset(mode='practice'){
    if(mode==='full')return resetFull();if(mode!=='practice')throw Error('Actual full or cached practice reset required');
    const s=env.restore(prefix.physics);parent.restore(prefix.parent);first.restore(prefix.first);late.restore(prefix.late);raw=prefix.raw.slice();base=prefix.base.slice();inner=prefix.inner.slice();gate1=prefix.gate1;lastInfo={...s.info};return s;
  }
  function evaluate(genes,{mode='full',watchdogMs=180000}={}){
    correction(genes);if(!Number.isFinite(watchdogMs)||watchdogMs<1000||watchdogMs>180000)throw Error('Bounded diagnostic watchdog required');
    const started=performance.now(),digest=crypto.createHash('sha256');let s=reset(mode),controls=0,overlap=0;
    while(!s.terminated&&performance.now()-started<watchdogMs){s=step(genes);controls++;const c=env.inspect().lastCommands;overlap+=Number(Math.min(c[1],c[2])!==0);digest.update(JSON.stringify([s.info.bestProgress,s.info.totalSimulationSeconds,c])+'\n');}
    return {result:s.info,validationMode:mode,complete:s.terminated===true,censored:s.terminated!==true,actualActorControls:controls,gasBrakeOverlapSteps:overlap,actionTraceSha256:digest.digest('hex'),wallSeconds:(performance.now()-started)/1000};
  }
  const metadata=()=>({...env.metadata(),format:'male-cns-neuronal-branch-repair-env-v1',decoderRevision:'neuronal-frontier-repair-v1',plasticParameters:2,preparedSha256:hash(preparedFile),protectedControls,branchActorSha256:prepared.branchActorSha256,
    sourceHashes:Object.fromEntries(['neural-branch-repair-env.cjs','neural-command-state.cjs','neural-command-residual.cjs','neural-projected-residual.cjs'].map(f=>[f,hash(path.join(__dirname,f))])),
    boundary:'Actual restored physical state and complete parent neuronal memories. Only observed raw neuronal context activates two reward-optimized coefficients; no route, pose, progress, clock or desired controls. Cached practice is not a full generation. Frozen crashing branch is not promoted; clean champion eligibility still requires actual complete from-line proofs.'});
  return {reset,step,evaluate,metadata,prepared};
}
if(require.main===module){let env;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{const m=JSON.parse(line);id=m.id;if(line.length>8192||!Number.isInteger(id))throw Error('Bounded private request required');let result;
  if(m.op==='init'){if(env)throw Error('Already initialized');env=create(m.configuration);result=env.metadata();}else if(!env)throw Error('Initialize first');else if(m.op==='evaluate')result=env.evaluate(m.genes,{mode:m.mode,watchdogMs:m.watchdogMs});else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');
}catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}});}
module.exports={create,correction};
