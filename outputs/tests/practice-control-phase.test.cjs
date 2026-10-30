'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../simulation.js'),L=require('../neural-learning.js'),P=require('../progress-save.js'),Legacy=require('../legacy-models.js');
const data=require('../data/connectome.json'),circuits=require('../data/circuits.json');

// Independent replay of a genuine car snapshot. It has the same reset reward
// objective as local practice, but retains the command already held at capture.
function reference(sim,genome,state,phase,held,maxTicks){
  const car=F.makeCar(sim.track,0,F.cloneGenome(genome),state.rewardRevision);
  Object.assign(car,{x:state.x,y:state.y,heading:state.heading,speed:state.speed,_physicsSpeed:state.speed},state.physics);
  car.footprintSensorsEnabled=state.footprintSensorsEnabled;car.vehicle=structuredClone(state.vehicle);
  car.brain=F.makeBrain(sim.graph);car.brain.activity.set(state.activity);
  F.Rewards.initialise(sim.track,car,null,state.rewardRevision);car.rewardState.along=state.along;
  const mapCircuit=sim.track.halfWidth<20,
    physicsGain=mapCircuit?F.MAP_PHYSICS_ADAPTER_GAIN:F.PHYSICS_ADAPTER_GAIN,
    launchBias=mapCircuit?F.MAP_NEURAL_MOTOR_LAUNCH_BIAS:F.NEURAL_MOTOR_LAUNCH_BIAS;
  let commands=held.slice(),brakeMax=0,steeringMax=0;
  for(let tick=0;tick<maxTicks&&car.alive;tick++){
    if((phase+tick)%sim.neuralInterval===0)commands=F.neuralStep(sim.graph,car.brain,car.genome,F.sense(sim.track,car).concat(F.physicsSense(car,sim.track)),true,true,physicsGain,launchBias);
    brakeMax=Math.max(brakeMax,commands[2]);steeringMax=Math.max(steeringMax,Math.abs(commands[0]));F.drive(sim.track,car,commands,F.DT);
  }
  if(car.alive)F.Rewards.finish(sim.track,car,'fine prova locale');
  return {fitness:car.fitness,progress:car.bestProgress,laps:car.laps,reason:car.reason,brakeMax,steeringMax,safe:F.isSafeLearningOutcome(car)};
}

test('Current practice resumes the held neural command and real control phase',()=>{
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{population:1,seed:7717,modelId:'v3',circuitId:'monza',circuits});
  sim.running=true;const car=sim.cars[0],seen=new Set();
  for(let i=0;i<L.CONTROL_INTERVAL;i++){
    sim.tick();assert.ok(car.alive,'fixture must remain a real moving or stopped live car');
    const phase=sim.ticks%sim.neuralInterval,state=F.capturePracticeState(car),held=car.slowOutputs.slice();
    seen.add(phase);assert.equal(state.nextControlPhase,phase);
    assert.equal(state.controlInterval,sim.neuralInterval);assert.deepEqual(state.heldOutputs,held);
    assert.deepEqual(F.evaluatePractice(sim.track,sim.graph,car.genome,state,12),reference(sim,car.genome,state,phase,held,12));
  }
  assert.equal(seen.size,L.CONTROL_INTERVAL);
});

test('A snapshot without an observed phase keeps the historical replay behavior',()=>{
  const sim=new F.Simulation(Legacy.buildV2(data),{population:1,seed:12}),car=sim.cars[0];
  const state=F.capturePracticeState(car),legacy={...state,rewardRevision:F.Rewards.LEGACY_REVISION};
  const current=F.evaluatePractice(sim.track,sim.graph,car.genome,state,12),legacyResult=F.evaluatePractice(sim.track,sim.graph,car.genome,legacy,12);
  assert.deepEqual(current,reference(sim,car.genome,state,0,[0,0,0],12));
  assert.deepEqual(legacyResult,reference(sim,car.genome,legacy,0,[0,0,0],12));
});

test('Historical rewards ignore any new transient phase information',()=>{
  const sim=new F.Simulation(Legacy.buildV2(data),{population:1,seed:7717}),car=sim.cars[0];
  for(let i=0;i<5;i++)sim.tick();
  const state={...F.capturePracticeState(car),rewardRevision:F.Rewards.LEGACY_REVISION,
    nextControlPhase:5,controlInterval:L.CONTROL_INTERVAL,heldOutputs:car.slowOutputs.slice()};
  assert.deepEqual(F.evaluatePractice(sim.track,sim.graph,car.genome,state,12),reference(sim,car.genome,state,0,[0,0,0],12));
});

test('Local safety reports a real off-track ending separately from an on-track timeout',()=>{
  const sim=new F.Simulation(Legacy.buildV2(data),{population:1,seed:12}),car=sim.cars[0],state=F.capturePracticeState(car);
  const normal=F.evaluatePractice(sim.track,sim.graph,car.genome,state,1);
  const offTrack=F.evaluatePractice(sim.track,sim.graph,car.genome,{...state,x:-100000,y:-100000},1);
  assert.equal(normal.reason,'fine prova locale');assert.equal(normal.safe,true);
  assert.ok(['urto','fuori pista','progresso non valido'].includes(offTrack.reason));assert.equal(offTrack.safe,false);
});

test('Current local selection cannot promote a crash merely because a stall scores worse',()=>{
  // This relation occurred in an offline replay of a real stopped elite:
  // the stall incurred 1,400 points while the short crash incurred 900+impact.
  const baseline={progress:0,fitness:-4407,safe:true},best=baseline;
  const crash={progress:8.8,fitness:-3910,safe:false},safeProgress={progress:4.5,fitness:-3006,safe:true};
  assert.equal(F.shouldPromotePracticeCandidate(crash,baseline,best,1,F.Rewards.REVISION),false);
  assert.equal(F.shouldPromotePracticeCandidate(safeProgress,baseline,best,1,F.Rewards.REVISION),true);
  assert.equal(F.shouldPromotePracticeCandidate({...safeProgress,progress:.5},baseline,best,1,F.Rewards.REVISION),false);
  assert.equal(F.shouldPromotePracticeCandidate(crash,baseline,best,1,F.Rewards.LEGACY_REVISION),true);
});

test('The transient practice phase is not written into the shareable save',()=>{
  const dataV3=()=>Legacy.tagV3(structuredClone(data));
  const sim=new F.Simulation(dataV3(),{population:4,seed:7717,modelId:'v3',circuitId:'monza',circuits});
  for(let i=0;i<7;i++)sim.tick();
  assert.ok(Number.isInteger(F.capturePracticeState(sim.cars[0]).nextControlPhase));
  const saved=P.capture(sim),text=JSON.stringify(saved);
  for(const key of ['nextControlPhase','controlInterval','heldOutputs','practiceNextControlPhase','practiceControlInterval'])assert.equal(text.includes('"'+key+'"'),false);
  const restored=new F.Simulation(dataV3(),{population:4,seed:7717,modelId:'v3',circuitId:'monza',circuits});
  P.restore(restored,saved);
  const roundTrip=P.capture(restored);
  // Restoring deliberately starts the saved generation again from its line.
  assert.equal(roundTrip.elapsedAtSave,0);
  assert.deepEqual({...roundTrip,elapsedAtSave:saved.elapsedAtSave},saved);
});
