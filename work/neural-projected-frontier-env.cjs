'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks'),Bridge=require('./neural-rl-context-state.cjs'),Model=require('./neural-grown-model.cjs'),Parent=require('./neural-progressive-action.cjs'),Context=require('./neural-context-readout.cjs'),Retained=require('./neural-retained-features.cjs'),Stack=require('./neural-context-stack.cjs'),Head=require('./neural-json-head.cjs');
const Projected=require('./neural-projected-frontier.cjs');
function create(cfg){
  if(process.versions.node!=='24.19.0')throw Error('Pinned numerical runtime required');
  const loaded=Model.load(cfg.parentModelFile),prepared=JSON.parse(fs.readFileSync(cfg.basisFile,'utf8')),basis=prepared.basis,bridge=Bridge.create(),parent=Parent.create(loaded),projected=Projected.create(prepared);
  if(prepared.format!=='male-cns-private-projected-frontier-basis'||prepared.parentModelSha256!==loaded.sha256)throw Error('Matching actual observed projection required');
  Stack.validateBasis(basis);Head.validateEnvironment(loaded.parent.model.head,bridge.metadata());
  let raw,baseAction,prefix,controls=0,currentFeatures;
  const features=()=>basis.centres.map(c=>Context.feature(raw,c,basis.scales));
  function observe(s){raw=s.observation.slice();baseAction=parent.action(raw);currentFeatures=projected.observe(raw);return s;}
  let s=observe(bridge.reset('full'));const began=performance.now();
  while(!features().some(v=>v>0)){const next=bridge.step(baseAction);controls++;if(next.terminated||performance.now()-began>180000)throw Error('Actual parent did not reach the observed context');observe(next);}
  if(controls<prepared.basis.protectedCount)throw Error('Protected actual prefix changed');prefix={physical:bridge.capture(),parentMemory:parent.capture(),projectedGate:projected.capture(),controls};
  function reset(mode){if(!['full','practice'].includes(mode))throw Error('Actual reset mode required');if(mode==='full'){parent.reset();projected.reset();controls=0;return observe(bridge.reset('full'));}parent.restore(prefix.parentMemory);projected.restore(prefix.projectedGate);controls=prefix.controls;return observe(bridge.restore(prefix.physical));}
  function evaluate(weights,mode='practice'){
    if(!Array.isArray(weights)||weights.length!==18||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Eighteen bounded learned coefficients required');
    reset(mode);const started=performance.now(),digest=crypto.createHash('sha256');let s,steps=0,overlap=0,legacyFlagSeen=false;
    do{
      const a=projected.adjust(baseAction,currentFeatures,weights);s=bridge.step(a);controls++;steps++;const c=bridge.inspect().car;overlap+=Number(c.outputs[1]>0&&c.outputs[2]>0);legacyFlagSeen||=s.truncated;
      digest.update(JSON.stringify([s.info.bestProgress,s.info.totalSimulationSeconds,c.outputs])+'\n');observe(s);
    }while(!s.terminated&&performance.now()-started<180000);
    const censored=!s.terminated;return {result:{...s.info,diagnosticCensor:censored,legacyTransportFlagSeen:legacyFlagSeen},censored,mode,executedControls:steps,gasBrakeOverlapSteps:overlap,actionTraceSha256:digest.digest('hex'),wallSeconds:(performance.now()-started)/1000};
  }
  return {evaluate,metadata:()=>({...bridge.metadata(),numericRuntime:process.versions.node,decoderRevision:'projected-neuronal-frontier-v3',learnableParameters:18,projectionAxes:8,parentModelSha256:loaded.sha256,parentStages:loaded.data.stages.length,basisSha256:Head.sha(fs.readFileSync(cfg.basisFile,'utf8')),protectedControls:prefix.controls,maxProgress:prepared.maxProgress,simulatedTimeLimit:null,wallWatchdogSeconds:180,boundary:'Frozen full causal parent plus current eight-axis neuronal readout under a retained neuronal gate. Own actual cached practice, never a full generation. No clock, body, route, teacher or prerecorded actions in controller inputs. All promotions independently replayed; censored candidates excluded.'})};
}
if(require.main===module){let env;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{if(line.length>65536)throw Error('Message too large');const m=JSON.parse(line);id=m.id;let result;if(!Number.isInteger(id))throw Error('ID required');if(m.op==='init'){if(env)throw Error('Already initialized');env=create(m.configuration);result=env.metadata();}else if(!env)throw Error('Initialize first');else if(m.op==='evaluate')result=env.evaluate(m.weights,m.mode||'practice');else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');}catch(e){process.stdout.write(JSON.stringify({id,error:e.stack})+'\n');}});}
module.exports={create};
