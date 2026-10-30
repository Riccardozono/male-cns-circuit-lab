'use strict';
// Private RL transport. Observations contain only real descending-neuron
// activity, decoder memory and the previous learned neural motor output.
// Geometry, elapsed time and reward metadata are never observation inputs.
const path=require('node:path'),fs=require('node:fs'),G=require('./guard-memory-runtime.cjs'),H=require('./causal-checkpoint.cjs'),N=require('./neural-causal-memory.cjs'),D=require('./exact-dense.cjs');
const F5=require('../.impeccable/experimental-penalty5/outputs/simulation.js'),runtime=D.wrap(F5,require('./exact-coo.cjs').pass),source=path.join(G.root,'.impeccable/review/neural-local-rbf/causal-single-axis-guard4/checkpoint.json'),readoutFile=path.join(G.root,'.impeccable/review/neural-local-rbf/descending-readout-audit/report.json');
const atanh=v=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,v)));
function create({retention='peak',floor=.5}={}){
  if(!['peak','floor'].includes(retention)||!Number.isFinite(floor)||floor<0||floor>1)throw Error('Invalid experimental authority configuration');
  // Warm-start neural coefficients only. No old scores, histories or cached
  // episode states are imported across the explicitly incompatible objective.
  const {saved,original}=H.load(source),sim=new F5.Simulation(G.X.model(require('../outputs/data/connectome.json')),{population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json')}),graph=sim.graph,track=sim.track,genome=saved.baseGenome,indices=JSON.parse(fs.readFileSync(readoutFile,'utf8')).indices;
  if(indices.length!==128||new Set(indices).size!==128||indices.some(i=>graph.classNames[graph.classCodes[i]]!=='descending_neuron'))throw Error('Real 128-cell readout required');
  let car,ticks,history,baseline,prefixState,initialFitness,episodeSteps,lastCommands,longitudinalAuthority=0;
  const raw=()=>indices.map(i=>Math.tanh(8*car.brain.activity[i]));
  const amplitude=()=>Math.min(1,Math.hypot(...car.brain.decoderMemory)*5);
  function observe(){
    car.inputs=runtime.sense(track,car);car.physicsInputs=runtime.physicsSense(car,track);car.sensorVector=car.inputs.concat(car.physicsInputs);runtime.neuralStep(graph,car.brain,genome,car.sensorVector);
    baseline=N.commands(graph,car.brain,genome,saved.centres,saved.explorerWeights,saved.decay);history.push(raw());if(history.length>4)history.shift();
    longitudinalAuthority=Math.max(longitudinalAuthority,amplitude());
  }
  function observation(){const pad=Array.from({length:4-history.length},()=>history[0]);return pad.concat(history).flat().concat(car.brain.decoderMemory.map(v=>v/2),[baseline[0],baseline[1]-baseline[2]]);}
  function info(){return {bestProgress:car.bestProgress,fitness:car.fitness,laps:car.laps,reason:car.alive?'':car.reason,complete:!car.alive,totalSimulationSeconds:ticks*runtime.DT,episodeControlSteps:episodeSteps,prefixTicks:prefixState?.ticks||0,lapTimes:car.lapTimes.slice()};}
  function fullReset(){car=runtime.makeCar(track,0,runtime.cloneGenome(genome));car.brain=runtime.makeBrain(graph);ticks=0;history=[];baseline=[0,0,0];episodeSteps=0;lastCommands=[0,0,0];longitudinalAuthority=0;}
  function controls(action){
    if(!Array.isArray(action)||action.length!==4||action.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Bounded old actor and two new motor residuals required');
    if(!graph.learning.nodes.some(i=>Math.abs(car.brain.activity[i])>=1e-7))return [0,0,0];
    const current=amplitude(),gain=current*2,longGain=2*(retention==='peak'?longitudinalAuthority:current>0?Math.max(floor,current):0);if((gain===0&&longGain===0)||action.every(v=>v===0))return baseline.slice();
    if(!graph.learning.nodes.some(i=>Math.abs(car.brain.activity[i])>=1e-7))return [0,0,0];
    // The two genuinely learned old outputs keep their ORIGINAL scaling.
    // Two new, independently learned outputs retain motor authority.
    // Zero new outputs preserve the previous learned motor decoder.
    const s=Math.tanh(atanh(baseline[0])+gain*action[0]+longGain*action[2]),a=Math.tanh(atanh(baseline[1]-baseline[2])+gain*action[1]+longGain*action[3]);return [s,Math.max(0,a),Math.max(0,-a)];
  }
  function advance(commands){car.outputs=commands;lastCommands=commands.slice();for(let j=0;j<G.X.L.CONTROL_INTERVAL&&car.alive;j++){runtime.drive(track,car,commands,runtime.DT);ticks++;}}
  fullReset();
  while(car.alive&&ticks<120000){
    const previous=structuredClone({...car,brain:null}),activity=car.brain.activity.slice(),memory=car.brain.decoderMemory?.slice()||[0,0],priorHistory=history.map(row=>row.slice()),previousAuthority=longitudinalAuthority;observe();
    if(amplitude()>0){prefixState={car:previous,activity,memory,history:priorHistory,ticks,longitudinalAuthority:previousAuthority};break;}advance(baseline);
  }
  if(!prefixState)throw Error('No genuinely observed warm prefix');
  function reset(mode='practice'){
    if(!['practice','full'].includes(mode))throw Error('Invalid reset mode');
    if(mode==='full')fullReset();else{car=structuredClone(prefixState.car);car.brain=runtime.makeBrain(graph);car.brain.activity.set(prefixState.activity);car.brain.decoderMemory=prefixState.memory.slice();ticks=prefixState.ticks;history=prefixState.history.map(row=>row.slice());episodeSteps=0;longitudinalAuthority=prefixState.longitudinalAuthority;}
    observe();initialFitness=car.fitness;return {observation:observation(),info:info()};
  }
  function step(action){
    if(!car.alive)throw Error('Reset required after termination');const before=car.fitness;advance(controls(action));episodeSteps++;const terminated=!car.alive,truncated=car.alive&&ticks>=120000;
    if(car.alive)observe();return {observation:observation(),reward:(car.fitness-before)/100,terminated,truncated,info:{...info(),diagnosticCensor:truncated,trainingRewardSinceReset:(car.fitness-initialFitness)/100}};
  }
  function stepMotor(commands){
    if(!car.alive)throw Error('Reset required after termination');
    if(!Array.isArray(commands)||commands.length!==3||commands.some(v=>!Number.isFinite(v)||Math.abs(v)>1)||commands[1]<0||commands[2]<0||Math.min(commands[1],commands[2])!==0)throw Error('Three bounded exclusive neuronal motor commands required');
    const before=car.fitness,signal=graph.learning.nodes.some(i=>Math.abs(car.brain.activity[i])>=1e-7);advance(signal?commands.slice():[0,0,0]);episodeSteps++;
    const terminated=!car.alive,truncated=car.alive&&ticks>=120000;if(car.alive)observe();
    return {observation:observation(),reward:(car.fitness-before)/100,terminated,truncated,info:{...info(),diagnosticCensor:truncated,trainingRewardSinceReset:(car.fitness-initialFitness)/100}};
  }
  function metadata(){return {format:'male-cns-neural-rl-bridge-v1',modelId:'v3',circuitId:'monza',appVersion:'5.6.0',objectiveRevision:runtime.Rewards.REVISION,vehicleRevision:runtime.Vehicle.REVISION,graph:G.X.P.compatibleGraph(graph),observationLength:128*4+4,readoutNodes:indices,readoutBodyIds:indices.map(i=>graph.bodyIds[i]),sourceSha256:G.C.hashFile(source),readoutSha256:G.C.hashFile(readoutFile),legacySourceSha256:G.C.hashFile(original),prefixTicks:prefixState.ticks,actionScale:2,rewardScale:100,boundary:'Practice resets are real cached from-line states, not laps or full generations. Only independent full resets validate learned driving. No pose/route/time/target controls in observations. Fixed anatomical graph and prior genuinely learned controller; residual actor is trained from rewards.'};}
  const oldMetadata=metadata,captured=new WeakSet();
  function capture(){
    if(!car.alive)throw Error('A live actually reached state is required');
    const state={car:structuredClone({...car,brain:null}),activity:car.brain.activity.slice(),
      memory:car.brain.decoderMemory.slice(),history:history.map(r=>r.slice()),baseline:baseline.slice(),
      lastCommands:lastCommands.slice(),ticks,episodeSteps,longitudinalAuthority};
    captured.add(state);return state;
  }
  function restore(state){
    if(!captured.has(state))throw Error('Only a state captured in this environment may be restored');
    car=structuredClone(state.car);car.brain=runtime.makeBrain(graph);car.brain.activity.set(state.activity);
    car.brain.decoderMemory=state.memory.slice();history=state.history.map(r=>r.slice());baseline=state.baseline.slice();
    lastCommands=state.lastCommands.slice();ticks=state.ticks;episodeSteps=state.episodeSteps;
    longitudinalAuthority=state.longitudinalAuthority;initialFitness=car.fitness;
    return {observation:observation(),info:info()};
  }
  return {reset,step,stepMotor,priorCommands:controls,capture,restore,metadata:()=>({...oldMetadata(),format:'male-cns-private-neuronal-command-state-v1',actionDimensions:3,decoderRevision:'neuronal-command-residual-v1',authorityConfiguration:{retention,floor}}),observation,inspect:()=>({car,baseline,lastCommands,ticks,history,longitudinalAuthority})};
}
if(require.main===module){
  const readline=require('node:readline');let env;
  readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
    let id=null;try{if(line.length>4096)throw Error('Message too large');const m=JSON.parse(line);id=m.id;if(!Number.isInteger(id))throw Error('Request ID required');if(m.op==='init'){if(env)throw Error('Already initialized');env=create(m.authorityConfiguration||{retention:'peak',floor:.5});process.stdout.write(JSON.stringify({id,result:env.metadata()})+'\n');return;}if(!env)throw Error('Initialize first');
      const result=m.op==='reset'?env.reset(m.mode):m.op==='step'?env.step(m.action):m.op==='metadata'?env.metadata():null;if(!result)throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');
    }catch(e){process.stdout.write(JSON.stringify({id,error:e.stack})+'\n');}
  });
}
module.exports={create};
