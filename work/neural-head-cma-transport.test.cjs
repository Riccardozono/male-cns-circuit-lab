'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{Search}=require('./neural-head-cma-transport.cjs'),{CMA}=require('./neural-cma.cjs');
test('The physically reevaluated elite is the same coefficient vector actually ranked by CMA',()=>{
  const settings={mean:[0,0],sigma:.03,population:4,seed:15101837},search=new Search(settings),elite=[.12,-.25],asked=search.ask(elite);assert.deepEqual(asked[0],elite);assert.throws(()=>search.ask(elite),/Tell/);
  const expected=new CMA(settings.mean,settings.sigma,settings.population);let seed=settings.seed;const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return (seed+.5)/4294967296;},batch=expected.ask(random);batch[0]={x:elite.slice()};const fitness=[10,-1,-2,-3];expected.tell(batch.map((r,i)=>({...r,fitness:fitness[i]})));search.tell(fitness);
  assert.deepEqual(search.state().optimizer.mean,expected.mean);assert.deepEqual(search.state().optimizer.covariance,expected.covariance);assert.equal(search.state().seed,seed);assert.throws(()=>search.tell(fitness),/Actual/);
});
