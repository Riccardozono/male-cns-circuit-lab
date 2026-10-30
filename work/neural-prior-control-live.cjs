'use strict';
// Real-time native integration. No original save file, cached episode, action
// tape or experiment checkpoint loader is needed to execute the exported model.
const fs=require('node:fs'),path=require('node:path'),Stack=require('./neural-context-stack.cjs'),Head=require('./neural-json-head.cjs'),D=require('./exact-dense.cjs');
const F=require('../.impeccable/experimental-penalty5/outputs/simulation.js'),L=require('../.impeccable/experimental-penalty5/outputs/neural-learning.js'),P=require('../.impeccable/experimental-context8/outputs/progress-save.js');
const runtime=D.wrap(F,require('./cuda-exact-v3-packed-runtime.cjs').pass),Legacy=require('../outputs/legacy-models.js');
const atanh=v=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,v))),rms=(a,b)=>Math.sqrt(a.reduce((s,v,j)=>s+(v-b[j])**2,0)/a.length);
const ownedTopologies=new WeakSet();
function create(modelFile,{modelOverride=null,actionOverride=null,motorOverride=null,onReset=null,sharedTopology=null,modelSha256=null,id=0,previousLapTime=null}={}){
  if(actionOverride!==null&&typeof actionOverride!=='function'||onReset!==null&&typeof onReset!=='function')throw Error('Invalid private neuronal extension');
  if(motorOverride!==null&&typeof motorOverride!=='function')throw Error('Invalid neuronal motor extension');
  if(!Number.isInteger(id)||id<0||id>=100||previousLapTime!==null&&(!Number.isFinite(previousLapTime)||previousLapTime<=0))throw Error('Invalid real agent configuration');
  const model=modelOverride||Stack.load(modelFile),data={...Legacy.tagV3(require('../outputs/data/connectome.json')),policyConfig:{version:8,gainGroups:16,readoutLimit:64,contextCount:12},modelLabel:'V3 · readout neurale sperimentale'};
  if(sharedTopology&&!ownedTopologies.has(sharedTopology))throw Error('Only a locally compiled actual topology may be shared');
  let topology=sharedTopology;
  if(!topology){const simulation=new F.Simulation(data,{population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json')});topology={graph:simulation.graph,track:simulation.track};ownedTopologies.add(topology);}
  const {graph,track}=topology,causal=model.head.causalModel;
  if(JSON.stringify(P.compatibleGraph(graph))!==JSON.stringify(model.head.environment.graph)||!L.valid(graph,causal.baseGenome.policyWeights)||causal.baseGenome.adapterVersion!==8||!Number.isFinite(causal.decay)||causal.decay<0||causal.decay>=1)throw Error('Incompatible exported causal model');
  if(causal.centres?.length<1||causal.centres.length>512||causal.explorerWeights?.length!==causal.centres.length*2||causal.explorerWeights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Invalid causal coefficients');
  for(const c of causal.centres)if(c.values?.length!==64||c.values.some(v=>!Number.isFinite(v)||Math.abs(v)>1)||!Number.isFinite(c.radius)||c.radius<=0||c.memory&&(c.memory.length!==2||c.memory.some(v=>!Number.isFinite(v)||Math.abs(v)>2)||!Number.isFinite(c.memoryRadius)||c.memoryRadius<=0))throw Error('Invalid causal neural context');
  const indices=model.head.environment.readoutNodes;
  if(indices.length!==128||new Set(indices).size!==128||indices.some((i,k)=>graph.classNames[graph.classCodes[i]]!=='descending_neuron'||graph.bodyIds[i]!==model.head.environment.readoutBodyIds[k]))throw Error('Real recorded anatomical readout required');
  let car,ticks,history,baseline,authority,pending=null;
  function memoryCommands(){
    if(!graph.learning.nodes.some(i=>Math.abs(car.brain.activity[i])>=1e-7)){car.brain.decoderMemory=[0,0];return [0,0,0];}
    const old=L.commands(graph,car.brain,causal.baseGenome),raw=Array.from(car.brain.policyFeatures),memory=car.brain.decoderMemory||(car.brain.decoderMemory=[0,0]);
    const features=causal.centres.map(c=>{
      const d=c.memory?Math.hypot(rms(raw,c.values)/c.radius,rms(memory,c.memory)/c.memoryRadius):rms(raw,c.values)/c.radius;
      return d>=1?0:(1-d)**4*(4*d+1);
    }),norm=1/Math.sqrt(raw.length);
    for(let a=0;a<2;a++){const drive=features.reduce((sum,v,k)=>sum+v*causal.explorerWeights[k*2+a]*norm,0);memory[a]=Math.max(-2,Math.min(2,causal.decay*memory[a]+drive));}
    if(memory[0]===0&&memory[1]===0)return old;
    const s=Math.tanh(atanh(old[0])+memory[0]),a=Math.tanh(atanh(old[1]-old[2])+memory[1]);return [s,Math.max(0,a),Math.max(0,-a)];
  }
  function observe(){
    car.inputs=runtime.sense(track,car);car.physicsInputs=runtime.physicsSense(car,track);car.sensorVector=car.inputs.concat(car.physicsInputs);
    runtime.neuralStep(graph,car.brain,causal.baseGenome,car.sensorVector);baseline=memoryCommands();
    history.push(indices.map(i=>Math.tanh(8*car.brain.activity[i])));if(history.length>4)history.shift();
    authority=Math.max(authority,Math.min(1,Math.hypot(...car.brain.decoderMemory)*5));
  }
  function observation(){return Array.from({length:4-history.length},()=>history[0]).concat(history).flat().concat(car.brain.decoderMemory.map(v=>v/2),[baseline[0],baseline[1]-baseline[2]]);}
  function reset(){car=runtime.makeCar(track,id,runtime.cloneGenome(causal.baseGenome));car.previousGenerationLapTime=previousLapTime;car.brain=runtime.makeBrain(graph);ticks=0;history=[];baseline=[0,0,0];authority=0;pending=null;if(onReset)onReset();observe();return state();}
  function peek(){
    if(!car.alive)return [0,0,0];if(pending!==null)return pending.slice();
    const neuralSignal=graph.learning.nodes.some(i=>Math.abs(car.brain.activity[i])>=1e-7);
    const a=actionOverride?actionOverride(model,observation()):Stack.action(model,observation()),gain=2*Math.min(1,Math.hypot(...car.brain.decoderMemory)*5),extraGain=authority*2;
    if(!Array.isArray(a)||a.length!==4||a.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Bounded private neuronal action required');
    let commands=neuralSignal?baseline.slice():[0,0,0];
    if(neuralSignal&&(gain!==0||extraGain!==0)&&a.some(v=>v!==0)){
      if(!graph.learning.nodes.some(i=>Math.abs(car.brain.activity[i])>=1e-7))commands=[0,0,0];
      else{const s=Math.tanh(atanh(baseline[0])+gain*a[0]+extraGain*a[2]),long=Math.tanh(atanh(baseline[1]-baseline[2])+gain*a[1]+extraGain*a[3]);commands=[s,Math.max(0,long),Math.max(0,-long)];}
    }
    if(motorOverride){
      const learned=motorOverride(model,observation(),commands.slice());
      if(!Array.isArray(learned)||learned.length!==3||learned.some(v=>!Number.isFinite(v)||Math.abs(v)>1)||learned[1]<0||learned[2]<0||Math.min(learned[1],learned[2])!==0)throw Error('Bounded exclusive learned neuronal motors required');
      commands=neuralSignal?learned:[0,0,0];
    }
    pending=commands;return pending.slice();
  }
  function stepWithCommands(override=null){
    if(!car.alive)return state();const prior=peek();let commands=override===null?prior:override.slice();
    if(!Array.isArray(commands)||commands.length!==3||commands.some(v=>!Number.isFinite(v)||Math.abs(v)>1)||commands[1]<0||commands[2]<0||Math.min(commands[1],commands[2])!==0)throw Error('Finite exclusive neural motors required');
    if(!graph.learning.nodes.some(i=>Math.abs(car.brain.activity[i])>=1e-7))commands=[0,0,0];
    pending=null;
    car.outputs=commands;for(let i=0;i<L.CONTROL_INTERVAL&&car.alive;i++){runtime.drive(track,car,commands,runtime.DT);ticks++;}
    if(car.alive)observe();return state();
  }
  function step(){return stepWithCommands();}
  function state(){return {car,ticks,observation:observation(),bestProgress:car.bestProgress,fitness:car.fitness,laps:car.laps,reason:car.alive?'':car.reason,totalSimulationSeconds:ticks*runtime.DT,lapTimes:car.lapTimes.slice(),complete:!car.alive};}
  reset();return {reset,step,peek,stepWithCommands,state,currentCar:()=>car,graph,track,data,model,runtime,topology,modelSha256:modelSha256||Head.sha(fs.readFileSync(modelFile,'utf8'))};
}
module.exports={create};
