'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../simulation.js'),L=require('../neural-learning.js'),P=require('../progress-save.js'),Legacy=require('../legacy-models.js'),data=require('../data/connectome.json');
const simulation=(options={})=>new F.Simulation(Legacy.buildV2(data),{population:16,mutation:.16,...options});
test('Equal returns cannot invent a preferred learning direction',()=>{
  const s=simulation(),mean=s.optimizer.mean.slice(),sigma=s.optimizer.sigma.slice();
  for(const car of s.cars)car.fitness=-3000;
  s.optimizer.update(s.cars);assert.deepEqual(s.optimizer.mean,mean);assert.deepEqual(s.optimizer.sigma,sigma);
  assert.equal(s.optimizer.episodes,16);assert.equal(s.optimizer.updates,1);
});
test('A selection-cutoff tie is invariant to agent order and positive affine reward scaling',()=>{
  const s=simulation(),ranked=s.cars.map((car,i)=>({...car,fitness:i<6?10:0}));
  const a=new L.EvolutionStrategy(s.graph),b=new L.EvolutionStrategy(s.graph),c=new L.EvolutionStrategy(s.graph);
  a.update(ranked);b.update([...ranked.slice(0,6).reverse(),...ranked.slice(6).reverse()]);
  c.update(ranked.map(car=>({...car,fitness:car.fitness*900+2000})));
  a.mean.forEach((v,i)=>assert.ok(Math.abs(v-b.mean[i])<1e-12));assert.deepEqual(a.mean,c.mean);
  a.sigma.forEach((v,i)=>assert.ok(Math.abs(v-b.sigma[i])<1e-12));
});
test('Mirrored trials remain symmetric and bounded at the parameter limits',()=>{
  const s=simulation(),center=s.cars[0].genome.policyWeights.slice();center[0]=7.99;center[1]=-8;s.optimizer.mean=center;
  const a=s.optimizer.sample(F.rng(44),.35,4),b=s.optimizer.sample(F.rng(44),.35,4,a);
  assert.ok(L.valid(s.graph,a)&&L.valid(s.graph,b));assert.notDeepEqual(a,center);
  for(let i=0;i<center.length;i++)assert.ok(Math.abs(a[i]+b[i]-2*center[i])<1e-12);
  assert.equal(a[1],-8);assert.equal(b[1],-8);assert.deepEqual(s.optimizer.sample(F.rng(1),0),center);
});
test('New generation still reevaluates the incumbent and reserves independent exploration',()=>{
  const s=simulation({population:8}),winner=s.cars[0];
  for(const car of s.cars)car.reward=200-car.id;
  const old=F.cloneGenome(winner.genome),originals=new Set(s.cars.map(c=>JSON.stringify(c.genome)));s.evolve();
  assert.deepEqual(s.cars[0].genome,old);assert.equal(s.cars.length,8);assert.ok(s.history[0].immigrantCount>=1);
  assert.equal(s.cars.filter(c=>originals.has(JSON.stringify(c.genome))).length,1);
  assert.ok(s.cars.every(c=>L.valid(s.graph,c.genome.policyWeights)));
});
test('Learning changes preserve exact save tensors and deterministic continuation on restore',()=>{
  const a=simulation({population:8}),b=simulation({population:8});
  for(const car of a.cars)car.rewardBreakdown.rewards.progress=car.reward=300-car.id;
  a.evolve();P.restore(b,P.capture(a));a.running=true;b.running=true;
  for(let i=0;i<30;i++){a.tick();b.tick();}
  a.evolve();b.evolve();assert.deepEqual(P.capture(a),P.capture(b));
});
