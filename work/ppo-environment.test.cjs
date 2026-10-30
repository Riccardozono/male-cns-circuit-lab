'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Env=require('./ppo-environment.cjs'),P=require('./ppo-neural.cjs');
test('Real training rollouts do not modify the incumbent, anatomy or snapshot',()=>{
  const s=new Env.F.Simulation(Env.X.model(require('../outputs/data/connectome.json')),{population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json')}),car=s.cars[0];
  const state=Env.F.capturePracticeState(car),before=JSON.stringify(state),genome=Env.F.cloneGenome(car.genome),activity=car.brain.activity.slice(),edges=s.graph.targets.slice();
  const actor=new P.Actor(s.graph.learning,genome.policyWeights),critic=new P.Critic(actor.dimension+2,Env.F.rng(3747),4);
  const result=Env.collect(s.track,s.graph,genome,[state],[],critic.snapshot(),3774,64,2);
  assert.equal(result.rows.length,64);assert.equal(result.episodes.length,32);assert.ok(result.episodes.every(e=>!e.terminal&&e.reason==='truncated rollout'&&e.laps===0));
  assert.ok(result.rows.every(row=>row.features.length===actor.dimension&&row.criticFeatures.length===critic.dimension&&Number.isFinite(row.reward)&&Number.isFinite(row.targetValue)&&!row.terminal));
  assert.equal(JSON.stringify(state),before);assert.deepEqual(car.genome,genome);assert.deepEqual(car.brain.activity,activity);assert.deepEqual(s.graph.targets,edges);
});
test('Truncated evaluations are explicit and do not acquire terminal or lap rewards',()=>{
  const s=new Env.F.Simulation(Env.X.model(require('../outputs/data/connectome.json')),{population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json')}),genome=Env.F.cloneGenome(s.cars[0].genome),copy=JSON.stringify(genome);
  const result=Env.evaluate(s.track,s.graph,genome,1);
  assert.equal(result.complete,false);assert.equal(result.reason,'evaluation censored');assert.equal(result.laps,0);assert.equal(result.simulationSeconds,Env.F.DT);assert.deepEqual(result.lapTimes,[]);assert.equal(JSON.stringify(genome),copy);
});
