'use strict';
// Additional compact features learned from actual neuronal observations.
// Never a body/route/speed/clock condition, expert action or brake-release rule.
const fs=require('node:fs'),path=require('node:path'),Bridge=require('./neural-rl-context-state.cjs'),Stack=require('./neural-context-stack.cjs'),Context=require('./neural-context-readout.cjs'),Head=require('./neural-json-head.cjs'),Model=require('./neural-frontier-model.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/neural-sacl'),modelFile=path.join(base,'diversity-native-model/model.malecns-neural-diversity.json'),championFile=path.join(base,'neural-diversity-resume-40/report.json'),basisFile=path.join(base,'stall-neuronal-basis/prepared.json');
const atanh=v=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,v)));
function create(){
  const loaded=Model.load(modelFile),champion=JSON.parse(fs.readFileSync(championFile,'utf8')),prepared=JSON.parse(fs.readFileSync(basisFile,'utf8')),basis=prepared.basis,bridge=Bridge.create(),weights=champion.state.champion.weights,p=loaded.data.projection;
  const baseText=fs.readFileSync(path.join(base,'context-stack-3/model.malecns-neural-context.json'),'utf8');
  if(!champion.passed||Head.sha(fs.readFileSync(championFile,'utf8'))!==prepared.sourceChampionReportSha256||champion.identity.environment.sourceModelSha256!==Head.sha(baseText)||JSON.stringify(JSON.parse(baseText))!==JSON.stringify(loaded.data.baseModelEnvelope))throw Error('Matching observed own champion required');
  Stack.validateBasis(basis);Head.validateEnvironment(loaded.model.head,bridge.metadata());
  let raw,baseAction,peak=0,prefix,episodeControls=0;
  const features=obs=>basis.centres.map(c=>Context.feature(obs,c,basis.scales));
  function observe(s){
    raw=s.observation.slice();for(const centre of loaded.data.basis.centres)peak=Math.max(peak,Context.feature(raw,centre,loaded.data.basis.scales));
    baseAction=Stack.action(loaded.model,raw);const normalized=p.mean.map((m,j)=>(raw[j]-m)/p.scales[j]),f=[1,...p.components.map((r,k)=>Math.tanh(r.reduce((t,v,j)=>t+v*normalized[j],0)/p.componentStd[k]))];
    const residual=[0,1].map(a=>Math.tanh(f.reduce((t,v,k)=>t+v*weights[2*k+a],0)));
    for(let k=0;k<2;k++)if(peak!==0&&residual[k]!==0)baseAction[k+2]=Math.tanh(atanh(baseAction[k+2])+peak*residual[k]*(k===0?1:2));
    return {observation:raw.slice(),info:s.info};
  }
  let s=observe(bridge.reset('full'));while(!features(raw).some(v=>v>0)){
    s=bridge.step(baseAction);episodeControls++;if(s.terminated||s.truncated)throw Error('New observed neuronal neighbourhood not reached');observe(s);
  }
  prefix={state:bridge.capture(),peak,controls:episodeControls};
  function reset(mode='practice'){
    if(!['practice','full'].includes(mode))throw Error('Invalid reset mode');peak=mode==='full'?0:prefix.peak;episodeControls=mode==='full'?0:prefix.controls;
    return observe(mode==='full'?bridge.reset('full'):bridge.restore(prefix.state));
  }
  function step(w){
    if(!Array.isArray(w)||w.length!==basis.centres.length*2||w.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Bounded learned local coefficients required');
    const action=baseAction.slice(),f=features(raw),norm=1/Math.sqrt(f.length);
    for(let a=0;a<2;a++){const delta=f.reduce((sum,v,k)=>sum+v*w[2*k+a]*norm,0);if(delta!==0)action[a+2]=Math.tanh(atanh(action[a+2])+delta);}
    const result=bridge.step(action);episodeControls++;observe(result);return result;
  }
  function evaluate(w,mode='practice'){
    reset(mode);let controls=0,overlap=0,s;
    do{s=step(w);controls++;const c=bridge.inspect().lastCommands;overlap+=Number(c[1]>0&&c[2]>0);}while(!s.terminated&&!s.truncated);
    return {result:s.info,censored:s.truncated,mode,executedControls:controls,gasBrakeOverlapSteps:overlap};
  }
  return {reset,step,evaluate,features:()=>features(raw),inspect:()=>bridge.inspect(),metadata:()=>({...bridge.metadata(),decoderRevision:'learned-local-stall-context-v1',learnableParameters:basis.centres.length*2,protectedControls:prefix.controls,modelSha256:loaded.sha256,championReportSha256:prepared.sourceChampionReportSha256,basisSha256:Head.sha(fs.readFileSync(basisFile,'utf8')),
    boundary:'Actual prior learned neuronal controller plus locally learned coefficients; all body fields remain diagnostic only. Cached genuine prefixes are practice, never full generations/laps. Full resets validate independently. Separate experiment, no active native app/save/source modified.'})};
}
if(require.main===module){const readline=require('node:readline');let env;readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{if(line.length>16384)throw Error('Message too large');const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('ID required');let result;if(m.op==='init'){if(env)throw Error('Already initialized');env=create();result=env.metadata();}else if(!env)throw Error('Initialize first');else if(m.op==='evaluate')result=env.evaluate(m.weights,m.mode||'practice');else if(m.op==='metadata')result=env.metadata();else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');}catch(e){process.stdout.write(JSON.stringify({id,error:e.stack})+'\n');}});}
module.exports={create};
