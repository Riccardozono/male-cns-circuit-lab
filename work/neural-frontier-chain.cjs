'use strict';
// Data-only neuronal exploration/refinement chain. No tape, route, clock,
// progress or physical targets are inputs to the controller.
const fs=require('node:fs'),path=require('node:path'),Head=require('./neural-json-head.cjs'),Anchor=require('./neural-command-model.cjs'),R=require('./neural-projected-residual.cjs'),Motor=require('./neural-command-residual.cjs'),Live=require('./neural-command-live.cjs');
const root=path.resolve(__dirname,'..'),owned=new WeakSet(),coefficient=x=>{if(!Array.isArray(x)||x.length!==2||x.some(v=>!Number.isFinite(v)||Math.abs(v)>100))throw Error('Two bounded learned coefficients required');return [Math.tanh(.2*x[0]),Math.tanh(x[1])];};
const sources=['work/neural-frontier-chain.cjs','work/neural-command-model.cjs','work/neural-command-live.cjs','work/neural-command-residual.cjs','work/neural-projected-residual.cjs','work/neural-projected-frontier-model.cjs','work/neural-projected-frontier.cjs','work/neural-progressive-action.cjs','work/neural-context-stack.cjs','work/neural-context-readout.cjs','work/neural-json-head.cjs','work/exact-dense.cjs','work/exact-coo.cjs','.impeccable/experimental-penalty5/outputs/simulation.js','.impeccable/experimental-penalty5/outputs/rewards.js','.impeccable/experimental-penalty5/outputs/neural-learning.js','outputs/data/connectome.json','outputs/data/circuits.json'];
const compatibility=()=>Object.fromEntries(sources.map(file=>[file,Head.sha(fs.readFileSync(path.join(root,file),'utf8'))]));
function encode(data){const payloadJson=JSON.stringify(data);return JSON.stringify({format:'male-cns-neuronal-frontier-chain-envelope',schema:1,payloadJson,sha256:Head.sha(payloadJson)});}
function parse(text,{allowExploration=false}={}){
  if(typeof text!=='string'||Buffer.byteLength(text)>64*1024*1024)throw Error('Bounded private numeric chain required');const e=JSON.parse(text);
  if(e.format!=='male-cns-neuronal-frontier-chain-envelope'||e.schema!==1||typeof e.payloadJson!=='string'||Head.sha(e.payloadJson)!==e.sha256)throw Error('Distinct private chain format/checksum required');
  const data=JSON.parse(e.payloadJson);
  if(data.format!=='male-cns-neuronal-frontier-chain-model'||data.schema!==1||data.appVersion!=='5.6.0'||data.numericRuntime!=='24.19.0'||data.modelId!=='v3'||data.circuitId!=='monza'||!['exploration-only','clean-verified'].includes(data.status)||data.status==='exploration-only'&&!allowExploration)throw Error('Explicit exploration permission or a clean verified chain required');
  if(JSON.stringify(data.sourceCompatibility)!==JSON.stringify(compatibility()))throw Error('Exact private source/graph compatibility required');
  const anchor=Anchor.parse(JSON.stringify(data.anchorEnvelope));R.validateActor(data.branchActor);
  if(!Array.isArray(data.stages)||data.stages.length>64)throw Error('At most64learned neuronal stages required');
  for(const stage of data.stages){R.createGate(stage.basis);coefficient(stage.genes);}
  const result=data.expectedResult;
  if(!result||result.complete!==true||!['bestProgress','fitness','totalSimulationSeconds'].every(k=>Number.isFinite(result[k]))||!Number.isInteger(result.laps)||result.laps<0||result.laps>2||typeof result.reason!=='string')throw Error('Actual complete source observation required, not a fictitious target');
  if(data.status==='clean-verified'&&(!data.fullTraceSha256||['urto','fuori pista','progresso non valido'].some(s=>result.reason.includes(s))||result.bestProgress<anchor.data.verifiedFullResult.bestProgress||result.fitness<anchor.data.verifiedFullResult.fitness))throw Error('Crashing or weaker exploration cannot masquerade as a clean model');
  return {data,anchor};
}
function load(file,options){const text=fs.readFileSync(file,'utf8'),parsed={...parse(text,options),modelFile:file,sha256:Head.sha(text)};owned.add(parsed);return parsed;}
function controller(parsed){
  if(!owned.has(parsed))throw Error('Actually loaded distinct chain required');const parent=R.createParent(parsed.anchor.parent),first=R.createGate(parsed.anchor.data.basis),stages=parsed.data.stages.map(stage=>R.createGate(stage.basis)),captured=new WeakSet();let old=null,inner=null,input=null;
  function observe(raw){old=parent.action(raw);const g=first.observe(raw);input=raw.concat(old,[g]);inner=R.forward(parsed.data.branchActor,R.normalize(input,parsed.anchor.data.normalization));for(const gate of stages)gate.observe(raw);return old.slice();}
  function compose(prior,lastGenes=null){if(!old)throw Error('Actually observed neuronal state required');let result=Motor.compose(prior,first.value(),inner);for(let i=0;i<stages.length;i++)result=Motor.compose(result,stages[i].value(),coefficient(lastGenes!==null&&i===stages.length-1?lastGenes:parsed.data.stages[i].genes));return result;}
  return {observe,compose,reset(){parent.reset();first.reset();for(const gate of stages)gate.reset();old=inner=input=null;},lastGate:()=>stages.length?stages[stages.length-1].value():0,
    snapshot:()=>({input:input?.slice()||null,inner:inner?.slice()||null,old:old?.slice()||null}),
    capture(){const state={parent:parent.capture(),first:first.capture(),stages:stages.map(g=>g.capture()),old:old.slice(),inner:inner.slice(),input:input.slice()};captured.add(state);return state;},
    restore(state){if(!captured.has(state))throw Error('Only own actually captured neuronal memory may be restored');parent.restore(state.parent);first.restore(state.first);stages.forEach((g,i)=>g.restore(state.stages[i]));old=state.old.slice();inner=state.inner.slice();input=state.input.slice();}};
}
function createFromLoaded(parsed,{sharedTopology=null,id=0,previousLapTime=null}={}){
  if(!owned.has(parsed)||process.versions.node!=='24.19.0')throw Error('Loaded private model and pinned runtime required');const brain=controller(parsed);
  const env=Live.create(parsed.modelFile,{sharedTopology,id,previousLapTime,modelOverride:parsed.anchor.parent.parent.parent.model,modelSha256:parsed.sha256,onReset:()=>brain.reset(),actionOverride:(_m,raw)=>brain.observe(raw),motorOverride:(_m,_raw,prior)=>brain.compose(prior)});
  return {...env,neuronalSnapshot:()=>brain.snapshot()};
}
module.exports={encode,parse,load,controller,createFromLoaded,coefficient,compatibility};
