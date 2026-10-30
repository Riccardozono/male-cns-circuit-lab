'use strict';
const fs=require('node:fs'),{performance}=require('node:perf_hooks'),Bridge=require('./neural-rl-context-state.cjs'),Model=require('./neural-grown-model.cjs'),Stack=require('./neural-context-stack.cjs'),Context=require('./neural-context-readout.cjs'),Head=require('./neural-json-head.cjs');
const atanh=v=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,v)));
const Retained=require('./neural-retained-features.cjs');
function create(cfg){
  if(process.versions.node!=='24.19.0')throw Error('Exact numerical runtime Node24.19.0 required');
  const loaded=Model.load(cfg.parentModelFile),prepared=JSON.parse(fs.readFileSync(cfg.basisFile,'utf8')),basis=prepared.basis,parent=loaded.parent,p=parent.data.projection,bridge=Bridge.create();
  if(prepared.format!=='male-cns-observed-grown-basis'||prepared.parentModelSha256!==loaded.sha256)throw Error('Matching observed parent required');
  Stack.validateBasis(basis);Head.validateEnvironment(parent.model.head,bridge.metadata());
  const memory=Retained.create(basis);let raw,baseAction,peak=0,prefix,controls=0;
  const features=()=>basis.centres.map(c=>Context.feature(raw,c,basis.scales));
  function observe(s){
    raw=s.observation.slice();memory.observe(raw);for(const c of parent.data.basis.centres)peak=Math.max(peak,Context.feature(raw,c,parent.data.basis.scales));
    baseAction=Stack.action(parent.model,raw);const normalized=p.mean.map((m,j)=>(raw[j]-m)/p.scales[j]),f=[1,...p.components.map((r,k)=>Math.tanh(r.reduce((sum,v,j)=>sum+v*normalized[j],0)/p.componentStd[k]))];
    const residual=[0,1].map(a=>Math.tanh(f.reduce((sum,v,k)=>sum+v*parent.data.weights[2*k+a],0)));
    for(let k=0;k<2;k++)if(peak!==0&&residual[k]!==0)baseAction[k+2]=Math.tanh(atanh(baseAction[k+2])+peak*residual[k]*(k===0?1:2));
    for(const stage of loaded.data.stages)baseAction=Stack.adjust(baseAction,raw,stage.basis,stage.weights);
    return {observation:raw.slice(),info:s.info};
  }
  let s=observe(bridge.reset('full'));const prefixStarted=performance.now();
  while(!features().some(v=>v>0)){
    const next=bridge.step(baseAction);controls++;if(next.terminated||performance.now()-prefixStarted>180000)throw Error('Observed actual neighbourhood not reached before physical termination/wall watchdog');observe(next);
  }
  if(controls<prepared.basis.protectedCount)throw Error('Actual first activation broke prefix protection');prefix={state:bridge.capture(),peak,controls};
  function reset(mode='practice'){
    if(!['practice','full'].includes(mode))throw Error('Invalid mode');memory.reset();peak=mode==='full'?0:prefix.peak;controls=mode==='full'?0:prefix.controls;
    return observe(mode==='full'?bridge.reset('full'):bridge.restore(prefix.state));
  }
  function step(w){
    if(!Array.isArray(w)||w.length!==basis.centres.length*2||w.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Bounded learned local coefficients required');
    const action=Retained.adjust(baseAction,memory.snapshot(),w),s=bridge.step(action);controls++;observe(s);return s;
  }
  function evaluate(w,mode='practice'){
    reset(mode);const started=performance.now();let steps=0,overlap=0,legacyFlagSeen=false,s;
    do{s=step(w);steps++;legacyFlagSeen||=s.truncated;const c=bridge.inspect().lastCommands;overlap+=Number(c[1]>0&&c[2]>0);}while(!s.terminated&&performance.now()-started<180000);
    // The old transport's 500 simulated-second observation flag never stops
    // physics. This experiment ignores it explicitly, not a real termination.
    // Only the wall watchdog censors, and censored candidates cannot promote.
    const censored=!s.terminated;return {result:{...s.info,diagnosticCensor:censored,legacyTransportFlagSeen:legacyFlagSeen},censored,mode,executedControls:steps,gasBrakeOverlapSteps:overlap,wallSeconds:(performance.now()-started)/1000};
  }
  return {reset,step,evaluate,inspect:()=>bridge.inspect(),features,metadata:()=>({...bridge.metadata(),numericRuntime:process.versions.node,decoderRevision:'retained-neuronal-context-experiment-v1',learnableParameters:basis.centres.length*2,
    parentModelSha256:loaded.sha256,parentStages:loaded.data.stages.length,basisSha256:Head.sha(fs.readFileSync(cfg.basisFile,'utf8')),protectedControls:prefix.controls,maxProgress:prepared.maxProgress,scorePixelsPerMeter:prepared.scorePixelsPerMeter,
    simulatedTimeLimit:null,wallWatchdogSeconds:180,boundary:'Actual parent frozen, new neuronal features/coefficients only. No position/time/route/teacher inputs. Own cached practice is not a full generation; full resets validate. No simulation-time ceiling; wall-watchdog results are censored and never promoted.'})};
}
if(require.main===module){const readline=require('node:readline');let env;readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{if(line.length>65536)throw Error('Message too large');const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('ID required');let result;if(m.op==='init'){if(env)throw Error('Already initialized');env=create(m.configuration);result=env.metadata();}else if(!env)throw Error('Initialize first');else if(m.op==='evaluate')result=env.evaluate(m.weights,m.mode||'practice');else if(m.op==='metadata')result=env.metadata();else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');}catch(e){process.stdout.write(JSON.stringify({id,error:e.stack})+'\n');}});}
module.exports={create};
