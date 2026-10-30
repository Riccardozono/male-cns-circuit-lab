'use strict';
// Two learned motor coefficients coupled to an actually observed neuronal
// context and its retained activation. Not a timed/position-based action tape.
const Full=require('./neural-context-fullrange-residual-env.cjs');
function create({frontier=false}={}){
  const env=(frontier?require('./neural-context-frontier-env.cjs'):Full).create();
  function evaluate(weights,mode='practice'){
    if(!Array.isArray(weights)||weights.length!==2||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Two bounded learned motor weights required');
    const action=weights.map(v=>Math.tanh(v));let s=env.reset(mode),controls=0,overlap=0;
    while(true){
      s=env.step(action);controls++;const commands=env.inspect().lastCommands;
      overlap+=Number(commands[1]>0&&commands[2]>0);
      if(s.terminated||s.truncated)return {result:s.info,censored:s.truncated,mode,executedControls:controls,gasBrakeOverlapSteps:overlap};
    }
  }
  return {evaluate,metadata:()=>({...env.metadata(),decoderRevision:'learned-retained-neuronal-context-v1',learnableParameters:2,
    boundary:'Two evolved motor weights, applied only through actual observed neuronal activation and memory. The anatomical graph and prior learned model are fixed. No pose, chainage, elapsed-time or expert-action inputs. Actual reward selects candidates; full from-line validation separate from cached practice.'})};
}
if(require.main===module){
  const readline=require('node:readline');let env;
  readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
    let id=null;try{
      if(line.length>8192)throw Error('Message too large');const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Request ID required');
      let result;if(m.op==='init'){if(env)throw Error('Already initialized');env=create({frontier:m.frontier===true});result=env.metadata();}
      else if(!env)throw Error('Initialize first');else if(m.op==='evaluate')result=env.evaluate(m.weights,m.mode||'practice');else if(m.op==='metadata')result=env.metadata();else throw Error('Unsupported operation');
      process.stdout.write(JSON.stringify({id,result})+'\n');
    }catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}
  });
}
module.exports={create};
