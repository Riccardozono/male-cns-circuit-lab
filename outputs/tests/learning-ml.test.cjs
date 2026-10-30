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
test('Unsafe bottom-ranked trials push the neural mean away but do not set exploration scale',()=>{
  const s=simulation({population:8}),mean=s.optimizer.mean.slice(),make=(offset,progress,reason)=>{
    const policyWeights=mean.slice();policyWeights[0]+=offset;
    return {fitness:progress,bestProgress:progress,laps:0,reason,rewardBreakdown:{penalties:{collision:reason==='urto'?900:0}},genome:{policyWeights}};
  };
  const ranked=[make(.1,700,'ferma / senza progresso'),make(.2,800,'ferma / senza progresso'),
    make(.3,900,'ferma / senza progresso'),make(.4,1000,'ferma / senza progresso'),
    make(.5,1100,'urto'),make(.6,1200,'urto'),make(.7,1300,'urto'),make(.8,1400,'urto')];
  const withCrashes=new L.EvolutionStrategy(s.graph),safeOnly=new L.EvolutionStrategy(s.graph);
  withCrashes.update(ranked,F.compareOptimizerAgents);safeOnly.update(ranked.filter(F.isSafeLearningOutcome),F.compareOptimizerAgents);
  assert.ok(withCrashes.mean[0]<safeOnly.mean[0],'worse crash-ranked actions provide a negative direction instead of being ignored');
  assert.deepEqual(withCrashes.sigma,safeOnly.sigma,'crash samples do not control exploration scale');
  assert.equal(withCrashes.episodes,ranked.length);
});
test('Bottom-ranked genomes cannot cancel elite mass or destabilize the exploration scale',()=>{
  const s=simulation(),base=s.optimizer.mean.slice(),make=(fitness,offset)=>{
    const policyWeights=base.slice();policyWeights[0]+=offset;
    return {fitness,genome:{policyWeights}};
  };
  const ranked=[make(8,.15),make(7,.2),make(6,.05),make(5,.1),make(4,.3),make(3,.4),make(2,.7),make(1,.8)];
  const allRanks=new L.EvolutionStrategy(s.graph),sameElites=new L.EvolutionStrategy(s.graph);
  allRanks.update(ranked);sameElites.update(ranked.slice(0,4));
  const scales=s.graph.learning.scales;
  for(let i=0;i<allRanks.sigma.length;i++){
    assert.ok(Number.isFinite(allRanks.sigma[i]),`sigma[${i}] must remain finite`);
    assert.ok(allRanks.sigma[i]>=scales[i]*.5&&allRanks.sigma[i]<=scales[i]*3,`sigma[${i}] must remain within its bounds`);
    assert.ok(Math.abs(allRanks.sigma[i]-sameElites.sigma[i])<1e-12,`bottom ranks must not alter sigma[${i}]`);
  }
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
  assert.equal(s.lastOptimizerSampleCount,2,'small learning populations reserve enough independent ES samples to update the distribution');
  assert.equal(s.cars.filter(c=>originals.has(JSON.stringify(c.genome))).length,1);
  assert.ok(s.cars.every(c=>L.valid(s.graph,c.genome.policyWeights)));
});
test('Learning checkpoints preserve exact tensors and resume ES updates without changing the save schema',()=>{
  const a=simulation({population:8}),b=simulation({population:8});
  for(const car of a.cars)car.rewardBreakdown.rewards.progress=car.reward=300-car.id;
  a.evolve();const checkpoint=P.capture(a);P.restore(b,checkpoint);
  assert.deepEqual(P.capture(b),checkpoint,'the saved optimizer and policy tensors round-trip exactly');
  a.running=true;b.running=true;
  for(let i=0;i<30;i++){a.tick();b.tick();}
  assert.deepEqual(a.cars.map(car=>[car.x,car.y,car.speed]),b.cars.map(car=>[car.x,car.y,car.speed]),'restored cars continue the same physical rollout');
  const updatesBefore=b.optimizer.updates;b.evolve();
  assert.equal(b.optimizer.updates,updatesBefore+1,'legacy checkpoints still provide learning feedback during resume');
  assert.equal(b.optimizerSampleIds instanceof Set,true,'the next generation establishes fresh in-memory ES lineage');
  assert.ok(b.optimizerSampleIds.size>=2);
});
