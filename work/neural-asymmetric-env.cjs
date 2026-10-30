'use strict';
// The actor still has exactly521neuronal/controller inputs. Extra physical
// signals are for a training-only critic and are removed from numeric export.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks'),Core=require('./neural-command-env.cjs'),State=require('./neural-training-state.cjs'),R=require('./neural-projected-residual.cjs'),Head=require('./neural-json-head.cjs');
function create(configuration){
  const core=Core.create(configuration),augmentation=s=>({...s,observation:s.observation.concat(State.features(core.inspect().car))});
  const reset=mode=>augmentation(core.reset(mode)),step=action=>augmentation(core.step(action));
  function encode(raw){return R.normalize(raw.slice(0,521),core.prepared.normalization).concat(raw.slice(521).map(v=>Math.fround(Math.fround(v)*5)));}
  function rollout(actor,{mode='practice',file,watchdogMs=180000}={}){
    R.validateActor(actor);if(typeof file!=='string'||!file.endsWith('.f32')||!Number.isFinite(watchdogMs)||watchdogMs<1000||watchdogMs>180000)throw Error('Bounded private binary rollout file required');
    const pending=file+'.pending',fd=fs.openSync(pending,'wx'),started=performance.now(),trace=crypto.createHash('sha256');let s=reset(mode),rows=[],count=0,overlap=0,totalReward=0;
    const flush=()=>{if(!rows.length)return;const a=Float32Array.from(rows.flat());fs.writeSync(fd,Buffer.from(a.buffer,a.byteOffset,a.byteLength));rows=[];};
    try{
      while(!s.terminated&&performance.now()-started<watchdogMs){
        const before=encode(s.observation),a=R.forward(actor,before.slice(0,521)),next=step(a),commands=core.inspect().lastCommands;
        overlap+=Number(Math.min(commands[1],commands[2])!==0);totalReward+=next.reward;
        rows.push(before.concat(a,[next.reward,Number(next.terminated)],encode(next.observation)));count++;if(rows.length>=128)flush();
        trace.update(JSON.stringify([next.info.bestProgress,next.info.totalSimulationSeconds,commands])+'\n');s=next;
      }
      flush();
    }finally{fs.closeSync(fd);}
    const complete=s.terminated===true;
    if(complete&&!overlap){if(fs.existsSync(file))throw Error('Preserve existing complete rollout');fs.renameSync(pending,file);}
    return {complete,censored:!complete,rows:count,columns:1118,actorObservationColumns:521,criticObservationColumns:557,actionColumns:2,gasBrakeOverlapSteps:overlap,result:s.info,validationMode:mode,
      totalActualReward:totalReward,actionTraceSha256:trace.digest('hex'),dataFile:complete&&!overlap?file:pending,dataComplete:complete&&!overlap,
      boundary:'Every binary row is an actual normalized pre-state, neural action, real reward, true termination and actual next-state. Critic-only physical signals never enter numeric actor inference. Incomplete wall-watchdog rollouts remain pending and cannot be used as complete returns.'};
  }
  const metadata=()=>({...core.metadata(),format:'male-cns-asymmetric-neuronal-training-env-v1',baseEnvironment:core.metadata(),observationLength:557,actorObservationLength:521,criticObservationLength:557,criticOnlySignals:State.labels,
    extraSourceHashes:Object.fromEntries(['neural-asymmetric-env.cjs','neural-training-state.cjs'].map(f=>[f,Head.sha(fs.readFileSync(path.join(__dirname,f),'utf8'))])),
    boundary:'Extra simulator sensors/reward state are training-only critic observations, not actor inputs, actions to imitate or a route driver. The native actor remains the same strict521input numerical decoder.'});
  return {...core,reset,step,metadata,rollout};
}
if(require.main===module){let env;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{
  if(line.length>16384)throw Error('Bounded message required');const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Request ID required');let result;
  if(m.op==='init'){if(env)throw Error('Already initialized');env=create(m.configuration);result=env.metadata();}
  else if(!env)throw Error('Initialize first');else if(m.op==='reset')result=env.reset(m.mode);else if(m.op==='step')result=env.step(m.action);else if(m.op==='metadata')result=env.metadata();
  else if(m.op==='evaluate'||m.op==='rollout'){const actor=JSON.parse(fs.readFileSync(m.actorFile,'utf8'));result=m.op==='evaluate'?env.evaluate(actor,{mode:m.mode,watchdogMs:m.watchdogMs}):env.rollout(actor,{mode:m.mode,file:m.file,watchdogMs:m.watchdogMs});}
  else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');
}catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}});}
module.exports={create};
