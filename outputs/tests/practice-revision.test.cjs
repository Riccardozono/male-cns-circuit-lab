'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../simulation.js'),Legacy=require('../legacy-models.js'),data=require('../data/connectome.json');

function fixture(revision){
  const sim=new F.Simulation(Legacy.buildV2(data),{population:1,seed:7717}),car=sim.cars[0],p=sim.graph.learning;
  F.Rewards.initialise(sim.track,car,null,revision);
  car.genome.policyWeights.fill(0,p.readoutOffset);
  // Use a real active MaleCNS state and a bias that still requests braking
  // after the track launch bias is applied.
  car.genome.policyWeights[car.genome.policyWeights.length-1]=-.3;
  car.speed=15*(sim.track.pixelsPerMeter||1);
  F.neuralStep(sim.graph,car.brain,car.genome,F.sense(sim.track,car).concat(F.physicsSense(car,sim.track)));
  F.drive(sim.track,car,[0,0,0]);
  return {sim,car,state:F.capturePracticeState(car)};
}

// An independent physical rollout fixes the reward version explicitly. It
// exercises the actual brake-lock penalty rather than trusting a version label.
function reference(sim,genome,state,revision,maxTicks=1200){
  const car=F.makeCar(sim.track,0,F.cloneGenome(genome),revision);
  Object.assign(car,{x:state.x,y:state.y,heading:state.heading,speed:state.speed,_physicsSpeed:state.speed},state.physics);
  car.footprintSensorsEnabled=state.footprintSensorsEnabled;
  car.vehicle=structuredClone(state.vehicle);car.brain=F.makeBrain(sim.graph);car.brain.activity.set(state.activity);
  F.Rewards.initialise(sim.track,car,null,revision);car.rewardState.along=state.along;
  let commands=[0,0,0];
  for(let tick=0;tick<maxTicks&&car.alive;tick++){
    if(tick%6===0)commands=F.neuralStepForTrack(sim.track,sim.graph,car.brain,car.genome,F.sense(sim.track,car).concat(F.physicsSense(car,sim.track)),true,true,car.vehicle?.speedMps??car.speed/(car.pixelsPerMeter||1));
    F.drive(sim.track,car,commands);
  }
  if(car.alive)F.Rewards.finish(sim.track,car,'fine prova locale');
  return car;
}

test('Practice snapshots retain the reward revision of the evaluated parent',()=>{
  for(const revision of F.Rewards.SUPPORTED_REVISIONS){
    const {state}=fixture(revision);assert.equal(state.rewardRevision,revision);
  }
});

test('Historical practice keeps its numerical reward rules instead of silently applying the latest penalty',()=>{
  const {sim,car,state}=fixture(F.Rewards.LEGACY_REVISION),snapshot={...state,rewardRevision:F.Rewards.LEGACY_REVISION};
  const legacy=reference(sim,car.genome,snapshot,F.Rewards.LEGACY_REVISION),current=reference(sim,car.genome,snapshot,F.Rewards.REVISION);
  assert.ok(legacy.bestProgress/(sim.track.pixelsPerMeter||1)>20,'fixture must move before holding the brake');
  assert.ok(current.rewardBreakdown.penalties.stall>legacy.rewardBreakdown.penalties.stall+100,'fixture must distinguish legacy and latest penalties');
  const result=F.evaluatePractice(sim.track,sim.graph,car.genome,snapshot,1200);
  assert.equal(result.fitness,legacy.fitness);assert.equal(result.progress,legacy.bestProgress);assert.equal(result.reason,legacy.reason);
});

test('Practice with a current or unversioned transient snapshot uses the current objective',()=>{
  const {sim,car,state}=fixture(F.Rewards.REVISION),expected=reference(sim,car.genome,state,F.Rewards.REVISION);
  for(const snapshot of [state,Object.fromEntries(Object.entries(state).filter(([key])=>key!=='rewardRevision'))]){
    const actual=F.evaluatePractice(sim.track,sim.graph,car.genome,snapshot,1200);
    assert.equal(actual.fitness,expected.fitness);assert.equal(actual.progress,expected.bestProgress);
  }
});

test('Practice rejects an unknown reward revision',()=>{
  const {sim,car,state}=fixture(F.Rewards.LEGACY_REVISION);
  assert.throws(()=>F.evaluatePractice(sim.track,sim.graph,car.genome,{...state,rewardRevision:'unknown-revision'},1),/ricompense incompatibile/);
});
