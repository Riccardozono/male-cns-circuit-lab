'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),B=require('./neural-rl-bridge.cjs'),G=require('./guard-memory-runtime.cjs'),H=require('./causal-checkpoint.cjs'),N=require('./neural-causal-memory.cjs'),D=require('./exact-dense.cjs'),path=require('node:path');
test('RL observations are neuronal history, not pose, route or elapsed time',()=>{const env=B.create(),reset=env.reset('practice'),obs=reset.observation;assert.equal(obs.length,516);assert.ok(obs.every(v=>Number.isFinite(v)&&Math.abs(v)<=1));const car=env.inspect().car;car.x+=100000;car.heading+=10;car.lifetime+=1000;assert.deepEqual(env.observation(),obs);assert.equal(env.metadata().readoutNodes.length,128);assert.throws(()=>env.step([2,0]),/Bounded/);});
test('Full and practice zero-actor episodes exactly replay the genuinely learned baseline',()=>{
  const env=B.create(),metadata=env.metadata(),results=[];
  for(const mode of ['full','practice']){env.reset(mode);let r;do{r=env.step([0,0]);}while(!r.terminated&&!r.truncated);assert.equal(r.truncated,false);results.push(r.info);}
  const {saved,sim}=H.load(path.join(G.root,'.impeccable/review/neural-local-rbf/causal-single-axis-guard4/checkpoint.json')),prior=N.replay(sim.track,sim.graph,saved.baseGenome,saved.centres,saved.explorerWeights,{decay:saved.decay,runtime:D.wrap(G.F,require('./exact-coo.cjs').pass)}).result;
  for(const r of results){assert.equal(r.bestProgress,prior.bestProgress);assert.equal(r.fitness,prior.fitness);assert.equal(r.laps,prior.laps);assert.equal(r.reason,prior.reason);assert.equal(r.totalSimulationSeconds,prior.simulationSeconds);}
  assert.ok(results[1].episodeControlSteps<results[0].episodeControlSteps);assert.ok(metadata.prefixTicks>0);
});
