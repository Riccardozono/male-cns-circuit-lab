'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),F=require('../simulation.js'),A=require('../agent-selection.js'),Legacy=require('../legacy-models.js'),data=require('../data/connectome.json');
const car=(id,extra={})=>({id,alive:true,laps:0,bestLapTime:Infinity,bestProgress:0,fitness:0,...extra});
test('Automatic selection is enabled at startup',()=>{const s=new A.Selection();assert.equal(s.automatic,true);assert.equal(s.update([car(0),car(1,{bestProgress:100})]).id,1);});
test('A new leader is selected without another click',()=>{const s=new A.Selection(),cars=[car(0,{bestProgress:100}),car(1)];assert.equal(s.update(cars).id,0);cars[1].bestProgress=200;assert.equal(s.update(cars).id,1);});
test('Best active car is followed rather than a crashed former leader',()=>{const cars=[car(0,{bestProgress:500,alive:false}),car(1,{bestProgress:100}),car(2,{bestProgress:200})];assert.equal(A.bestActive(cars,0).id,2);cars[2].alive=false;assert.equal(A.bestActive(cars,2).id,1);});
test('If all cars are inactive the final best is still inspectable',()=>{assert.equal(A.bestActive([car(0,{alive:false}),car(1,{alive:false,bestProgress:200})],0).id,1);});
test('Ranking uses the actual net score even when a worse car has laps',()=>{const cars=[car(0,{fitness:1000,bestProgress:1000}),car(1,{laps:1,bestLapTime:100,fitness:-10000}),car(2,{laps:1,bestLapTime:95,fitness:-20000})];assert.equal(A.bestActive(cars,0).id,0);});
test('Before a lap fitness also decides, with actual progress as an exact-score tiebreak',()=>{const cars=[car(0,{bestProgress:100,fitness:99}),car(1,{bestProgress:200,fitness:-50}),car(2,{bestProgress:200,fitness:100})];assert.equal(A.bestActive(cars,0).id,2);});
test('Exact ties retain selection and do not produce flickering switches',()=>{const cars=[car(0),car(7),car(99)],s=new A.Selection();s.selectedId=99;for(let i=0;i<100;i++)assert.equal(s.update(cars).id,99);});
test('Manual selection disables automatic switching until it is re-enabled',()=>{const s=new A.Selection(),cars=[car(0),car(1,{bestProgress:200})];s.select(0);assert.equal(s.automatic,false);assert.equal(s.update(cars).id,0);s.toggle();assert.equal(s.automatic,true);assert.equal(s.update(cars).id,1);s.toggle();assert.equal(s.update(cars).id,1);});
test('Missing manual ID and changed population recover to a real car',()=>{const s=new A.Selection();s.select(99);assert.equal(s.update([car(7),car(11)]).id,7);s.reset();assert.equal(s.automatic,false);assert.equal(s.update([car(0)]).id,0);});
test('Empty populations are handled without fabricated agents',()=>{const s=new A.Selection();assert.equal(s.update([]),null);assert.equal(A.bestActive(null,0),null);assert.equal(s.selectedId,0);});
test('100 agents are ranked without sorting or mutating the source',()=>{const cars=Array.from({length:100},(_,id)=>car(id,{bestProgress:id*10})),before=structuredClone(cars);assert.equal(A.bestActive(cars,0).id,99);assert.deepEqual(cars,before);});
test('Selecting an agent never changes CPU physics, neural state, genomes, optimizer or RNG',()=>{
  const sim=new F.Simulation(Legacy.buildV2(data),{population:4,seed:7717});sim.advance(.15);
  const before=structuredClone(sim.cars),rng=sim.random.getState(),mean=sim.optimizer.mean.slice(),sigma=sim.optimizer.sigma.slice(),history=structuredClone(sim.history),s=new A.Selection();
  for(let i=0;i<100;i++){s.update(sim.cars);s.select(i%4);s.update(sim.cars);s.toggle();}
  assert.deepEqual(sim.cars,before);assert.equal(sim.random.getState(),rng);assert.deepEqual(sim.optimizer.mean,mean);assert.deepEqual(sim.optimizer.sigma,sigma);assert.deepEqual(sim.history,history);
});
