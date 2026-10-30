'use strict';
// Private training transport. Cached practice is a real reached physical state,
// never an app generation. Full validations always reset the physical car.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks'),Head=require('./neural-json-head.cjs'),Model=require('./neural-projected-frontier-model.cjs'),Residual=require('./neural-projected-residual.cjs'),Bridge=require('./neural-command-state.cjs'),Command=require('./neural-command-residual.cjs');
function create({preparedFile}={}){
  if(process.versions.node!=='24.19.0'||typeof preparedFile!=='string')throw Error('Pinned runtime and actual preparation required');
  const text=fs.readFileSync(preparedFile,'utf8'),prepared=JSON.parse(text),loaded=Model.load(prepared.parentModelFile),parent=Residual.createParent(loaded),gate=Residual.createGate(prepared.basis),env=Bridge.create();
  if(prepared.format!=='male-cns-private-projected-residual-preparation'||prepared.numericRuntime!==process.versions.node||prepared.parentModelSha256!==loaded.sha256||JSON.stringify(loaded.parent.parent.model.head.environment.graph)!==JSON.stringify(env.metadata().graph))throw Error('Frozen compatible real parent required');
  Residual.validateNormalization(prepared.normalization);
  let raw,base,currentGate,initialFitness;
  function observe(state){raw=state.observation.slice();base=parent.action(raw);currentGate=gate.observe(raw);return raw.concat(base,[currentGate]);}
  parent.reset();gate.reset();let state=env.reset('full');observe(state);let protectedControls=0;
  while(currentGate===0){
    state=env.step(base);protectedControls++;
    if(state.terminated)throw Error('No actually reached live activation state');
    // Legacy 2000 s diagnostic metadata is NOT a physical termination limit.
    observe(state);
  }
  const prefix={physics:env.capture(),parent:parent.capture(),gate:gate.capture(),raw:raw.slice(),base:base.slice(),currentGate};
  function reset(mode='practice'){
    if(!['full','practice'].includes(mode))throw Error('Full or actual cached practice reset required');
    let s,observation;
    if(mode==='full'){parent.reset();gate.reset();s=env.reset('full');observation=observe(s);}
    else{s=env.restore(prefix.physics);parent.restore(prefix.parent);gate.restore(prefix.gate);raw=prefix.raw.slice();base=prefix.base.slice();currentGate=prefix.currentGate;observation=raw.concat(base,[currentGate]);}
    initialFitness=s.info.fitness;return {observation,info:{...s.info,residualGate:currentGate,protectedControls}};
  }
  function step(action){
    const s=env.stepMotor(Command.compose(env.priorCommands(base),currentGate,action)),commands=env.inspect().lastCommands;
    if(Math.min(commands[1],commands[2])!==0)throw Error('Overlapping actual gas/brake');
    const observation=s.terminated?s.observation.concat(base,[currentGate]):observe(s);
    return {...s,truncated:false,observation,info:{...s.info,residualGate:currentGate,protectedControls,legacyDiagnosticThresholdReached:!!s.truncated,diagnosticCensor:false,trainingRewardSinceReset:(s.info.fitness-initialFitness)/100}};
  }
  function evaluate(actor,{mode='full',watchdogMs=180000}={}){
    Residual.validateActor(actor);if(!Number.isFinite(watchdogMs)||watchdogMs<1000||watchdogMs>240000)throw Error('Bounded wall watchdog required');
    const started=performance.now(),digest=crypto.createHash('sha256');let s=reset(mode),controls=0,overlap=0;
    while(!s.terminated&&performance.now()-started<watchdogMs){
      s=step(Residual.forward(actor,Residual.normalize(s.observation,prepared.normalization)));controls++;
      const commands=env.inspect().lastCommands;overlap+=Number(Math.min(commands[1],commands[2])!==0);
      digest.update(JSON.stringify([s.info.bestProgress,s.info.totalSimulationSeconds,commands])+'\n');
    }
    return {result:s.info,validationMode:mode,complete:s.terminated===true,censored:s.terminated!==true,actualActorControls:controls,gasBrakeOverlapSteps:overlap,actionTraceSha256:digest.digest('hex'),wallSeconds:(performance.now()-started)/1000};
  }
  const metadata=()=>({...env.metadata(),format:'male-cns-private-neuronal-command-env-v1',decoderRevision:'neuronal-command-residual-v1',observationLength:521,actionDimensions:2,parentModelSha256:loaded.sha256,preparationSha256:Head.sha(text),protectedControls,residualScale:[2,2],
    sourceHashes:Object.fromEntries(['neural-command-env.cjs','neural-command-state.cjs','neural-command-live.cjs','neural-command-residual.cjs','neural-projected-residual.cjs'].map(f=>[f,Head.sha(fs.readFileSync(path.join(__dirname,f),'utf8'))])),
    boundary:'Actual graph/physics in pinned CPU Node24; 521 neuronal/controller-state inputs, no pose/route/clock/teacher controls. Practice state and every parent memory physically reached and captured locally. Legacy simulation-time diagnostic does not truncate. Wall-watchdog evaluations are censored and cannot be promoted.'});
  return {reset,step,evaluate,metadata,prepared,inspect:()=>env.inspect()};
}
if(require.main===module){
  const readline=require('node:readline');let env;
  readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{
    if(line.length>16384)throw Error('Bounded transport message required');const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Integer request ID required');let result;
    if(m.op==='init'){if(env)throw Error('Already initialized');env=create(m.configuration);result=env.metadata();}
    else if(!env)throw Error('Initialize first');else if(m.op==='reset')result=env.reset(m.mode);else if(m.op==='step')result=env.step(m.action);else if(m.op==='metadata')result=env.metadata();
    else if(m.op==='evaluate'){const text=fs.readFileSync(m.actorFile,'utf8');if(Buffer.byteLength(text)>4*1024*1024)throw Error('Bounded numeric actor required');result=env.evaluate(JSON.parse(text),{mode:m.mode,watchdogMs:m.watchdogMs});}
    else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');
  }catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}});
}
module.exports={create};
