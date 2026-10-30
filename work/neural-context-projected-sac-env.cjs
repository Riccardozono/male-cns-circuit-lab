'use strict';
// Nine exclusively neuronal/context inputs. Frozen genuinely learned parent
// plus a two-output actor trained from actual rewards, no body/route targets.
const fs=require('node:fs'),path=require('node:path'),Linear=require('./neural-context-linear-env.cjs'),Head=require('./neural-json-head.cjs');
const parentFile=path.resolve(__dirname,'../.impeccable/review/neural-sacl/frontier-retained-cma-first/report.json');
function create(){
  const env=Linear.create(),parent=JSON.parse(fs.readFileSync(parentFile,'utf8'));
  if(!parent.passed||parent.environment.gateBasisSha256!==env.metadata().gateBasisSha256)throw Error('Verified own parent required');
  const weights=parent.champion.weights,prior=weights.map(v=>Math.tanh(v));
  let state;const observation=()=>env.features(state.observation).slice(1).concat(state.observation.slice(516,521));
  const projected=s=>({...s,observation:observation()});
  function reset(mode='practice'){state=env.rawReset(mode);return projected(state);}
  function step(action){
    if(!Array.isArray(action)||action.length!==2||action.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Bounded learned actor required');
    const actual=action.map((v,k)=>v===0?prior[k]:Math.tanh(weights[k]+v));
    state=env.rawStep(actual);return projected(state);
  }
  const metadata=()=>({...env.metadata(),format:'male-cns-neural-projected-residual-v1',decoderRevision:'neuronal-projection-sac-v1',observationLength:9,actionDimensions:2,
    parentSha256:Head.sha(fs.readFileSync(parentFile,'utf8')),
    boundary:'Four mathematical projections of actual descending-neuron history, four current outputs of the previously learned neuronal head and retained neuronal context. No pose, clock, route, raw body fields or expert actions. Frozen parent plus learned residual. Zero actor preserves parent; only full from-line episodes validate laps.'});
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
