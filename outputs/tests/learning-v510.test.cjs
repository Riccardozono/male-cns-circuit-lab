'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../simulation.js'),L=require('../neural-learning.js'),R=require('../rewards.js'),P=require('../progress-save.js'),M=require('../learning-metrics.js'),data=require('../data/connectome.json'),Legacy=require('../legacy-models.js');
const {fixture}=require('./fixtures/reward-rollout.cjs');
test('Equal-impact useful movement is preferable before the first Monza checkpoint at several speeds',()=>{
  for(const speed of [3,5,10,20,35]){
    const a=fixture({total:5793,referenceMps:45}),b=fixture({total:5793,referenceMps:45});
    a.move(speed*2.5,2.5);b.move(speed*5,5);a.move(speed/60,1/60,{collision:true});b.move(speed/60,1/60,{collision:true});
    assert.ok(b.car.fitness>a.car.fitness,`speed=${speed}: ${b.car.fitness} <= ${a.car.fitness}`);assert.equal(a.car.laps,0);assert.equal(b.car.laps,0);
  }
});
test('Stagnation reacts to real progress even when an early-crash score improves',()=>{
  const sim=new F.Simulation(Legacy.buildV2(data),{population:8,mutation:.16});
  sim.learningFrontier={progress:500,laps:0,lapTime:null};sim.safeLearningFrontier={progress:500,laps:0,lapTime:null};sim.championStats={fitness:-1e6,bestProgress:10,laps:0,bestLapTime:Infinity};sim.champion=F.cloneGenome(sim.cars[0].genome);
  for(const c of sim.cars){c.bestProgress=20;c.reward=100;c.alive=false;c.reason='urto';c.rewardBreakdown.penalties.collision=F.SCORE_RULES.collision;}
  sim.evolve();assert.equal(sim.stagnation,1);assert.equal(sim.learningFrontier.progress,500);assert.ok(sim.history[0].immigrantCount>0);assert.ok(sim.history[0].mutationAmount>=.16);
});
test('Random explorers and block-local children remain enabled in the neural ES path',()=>{
  const sim=new F.Simulation(Legacy.buildV2(data),{population:16});for(let i=0;i<6;i++)sim.evolve();
  assert.ok(sim.history.every(h=>h.immigrantCount>=1));assert.ok(sim.cars.every(c=>L.valid(sim.graph,c.genome.policyWeights)));
  const p=sim.graph.learning,w=sim.cars[0].genome.policyWeights,child=L.localMutation(sim.graph,w,F.rng(34),.16);
  assert.notDeepEqual(child,w);assert.ok(child.some((v,i)=>v===w[i]));assert.ok(child.every(Number.isFinite));
  const zero=L.localMutation(sim.graph,w,F.rng(34),0);assert.deepEqual(zero,w);assert.notEqual(zero,w);
  for(let i=0;i<300;i++)sim.optimizer.update(sim.cars);
  assert.ok(sim.optimizer.sigma.every((s,i)=>s>=p.scales[i]*.5));
});
test('The physical frontier survives export/restore and rejects malformed saved values',()=>{
  const sim=new F.Simulation(Legacy.buildV2(data),{population:4});sim.learningFrontier={progress:421,laps:0,lapTime:null};
  const saved=P.capture(sim),other=new F.Simulation(Legacy.buildV2(data),{population:4});P.restore(other,saved);assert.deepEqual(other.learningFrontier,sim.learningFrontier);
  for(const value of [{progress:-1,laps:0,lapTime:null},{progress:1,laps:3,lapTime:2},{progress:1,laps:0,lapTime:NaN}]){const bad=structuredClone(saved);bad.learningFrontier=value;assert.throws(()=>P.restore(other,bad));}
});
test('A rising point score cannot label declining distance as better driving',()=>{
  const history=Array.from({length:10},(_,i)=>({generation:i+1,best:100+i*50,mean:50+i*10,bestProgress:i<5?800:40,meanProgress:i<5?400:20,laps:0,bestLapTime:null}));
  const metrics=M.summarize(history,{pixelsPerMeter:1});assert.equal(metrics.trend,'regressing');assert.equal(metrics.delta,-760);assert.equal(M.summarize(history.slice(0,9),{}).trend,'pending');
  assert.equal(M.series(history,{},'progress').max,800);assert.equal(M.series(history,{},'fitness').unit,'pt');assert.equal(metrics.lapTime,null);
});
test('Safe learning curves exclude farther crash-only genomes while preserving a raw diagnostic series',()=>{
  const history=Array.from({length:10},(_,i)=>({generation:i+1,best:100,mean:50,bestProgress:i<5?900:1400,meanProgress:600,
    bestSafeProgress:i<5?180:320,meanSafeProgress:i<5?90:160,maxLaps:0,bestLapTime:null}));
  const metrics=M.summarize(history,{pixelsPerMeter:1});
  assert.equal(metrics.distance,320);assert.equal(metrics.rawDistance,1400);assert.equal(metrics.progressBasis,'safe');
  assert.equal(metrics.delta,140);assert.equal(metrics.trend,'improving');
  assert.equal(M.series(history,{},'progress').max,320);assert.equal(M.series(history,{},'raw-progress').max,1400);
});
test('Stable records do not drift when the previous-generation time reference changes repeatedly',()=>{
  const f=fixture({previousLap:30});f.move(1000,40);f.end();const initial=R.recordStats(f.car);for(const ref of [20,45,35,70,30]){R.comparisonPenalty(f.car,ref);assert.deepEqual(R.recordStats(f.car),initial);}
});
