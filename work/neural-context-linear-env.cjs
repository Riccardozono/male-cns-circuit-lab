'use strict';
// Small observation-conditioned readout. PCA inputs are actual descending
// neuronal histories; neither vehicle geometry nor expert actions are inputs.
const fs=require('node:fs'),path=require('node:path'),Frontier=require('./neural-context-frontier-env.cjs'),Head=require('./neural-json-head.cjs');
const root=path.resolve(__dirname,'..'),basisFile=path.join(root,'.impeccable/review/neural-sacl/frontier-linear-basis/prepared.json');
function create(){
  const env=Frontier.create(),basis=JSON.parse(fs.readFileSync(basisFile,'utf8')),n=516;
  const vector=(v,length,bound=Infinity)=>Array.isArray(v)&&v.length===length&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=bound);
  if(basis.sourceModelSha256!==env.metadata().sourceModelSha256||basis.gateBasisSha256!==env.metadata().gateBasisSha256||
    !vector(basis.mean,n,1)||!vector(basis.scales,n)||basis.scales.some(v=>v<=0)||basis.components.length!==4||basis.components.some(v=>!vector(v,n,1.000001))||
    !vector(basis.componentStd,4)||basis.componentStd.some(v=>v<=0))throw Error('Invalid actual neuronal projection');
  function features(observation){
    const normalized=basis.mean.map((m,j)=>(observation[j]-m)/basis.scales[j]);
    return [1,...basis.components.map((row,i)=>Math.tanh(row.reduce((sum,v,j)=>sum+v*normalized[j],0)/basis.componentStd[i]))];
  }
  function action(observation,weights){const f=features(observation);return [0,1].map(a=>Math.tanh(f.reduce((s,v,k)=>s+v*weights[2*k+a],0)));}
  function evaluate(weights,mode='practice'){
    if(!vector(weights,10,8))throw Error('Ten bounded learned motor weights required');
    let state=env.reset(mode),controls=0,overlap=0;
    while(true){
      state=env.step(action(state.observation,weights));controls++;const commands=env.inspect().lastCommands;
      overlap+=Number(commands[1]>0&&commands[2]>0);
      if(state.terminated||state.truncated)return {result:state.info,censored:state.truncated,mode,executedControls:controls,gasBrakeOverlapSteps:overlap};
    }
  }
  return {evaluate,features,action,rawReset:mode=>env.reset(mode),rawStep:action=>env.step(action),inspect:()=>env.inspect(),metadata:()=>({...env.metadata(),decoderRevision:'learned-neuronal-projection-readout-v1',learnableParameters:10,projectionSha256:Head.sha(fs.readFileSync(basisFile,'utf8')),
    boundary:'Unsupervised projection of actual neuronal activity, ten evolved motor weights, retained actual-neural activation. No geometry/time/body/expert-action inputs. Prior controller, anatomical graph, physics and objective fixed. Full resets independently validate cached practice.'})};
}
if(require.main===module){
  const readline=require('node:readline');let env;
  readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
    let id=null;try{
      if(line.length>8192)throw Error('Message too large');const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Request ID required');
      let result;if(m.op==='init'){if(env)throw Error('Already initialized');env=create();result=env.metadata();}
      else if(!env)throw Error('Initialize first');else if(m.op==='evaluate')result=env.evaluate(m.weights,m.mode||'practice');else if(m.op==='metadata')result=env.metadata();else throw Error('Unsupported operation');
      process.stdout.write(JSON.stringify({id,result})+'\n');
    }catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}
  });
}
module.exports={create};
