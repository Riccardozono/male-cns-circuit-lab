'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{updateDistribution}=require('./train-neural-context-cem.cjs');
test('ranked episodes fit a full covariance distribution without collapsing its exploration',()=>{
  const previous={mean:[0,0],cov:[[1,0],[0,1]]},elite=[[1,2],[.9,1.8],[.8,1.6],[.7,1.4]].map(weights=>({spec:{weights}})),next=updateDistribution(previous,elite);
  assert.ok(next.mean[0]>.5&&next.mean[0]<.6);assert.equal(next.mean[1],2*next.mean[0]);assert.ok(next.cov[0][1]>0);
  assert.ok(next.cov[0][0]*next.cov[1][1]-next.cov[0][1]**2>0);assert.deepEqual(previous,{mean:[0,0],cov:[[1,0],[0,1]]});
  const collapsed=updateDistribution({mean:[1,2],cov:[[.0004,0],[0,.0004]]},Array(4).fill({spec:{weights:[1,2]}}));
  assert.ok(collapsed.cov[0][0]>=.0004&&collapsed.cov[1][1]>=.0004);
});
