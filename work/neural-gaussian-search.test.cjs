'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),G=require('./neural-gaussian-search.cjs'),{updateDistribution}=require('./train-neural-context-cem.cjs'),
  samples=require('../.impeccable/review/learning-ml/v3-neural-context-bank-cem-ab-20261024-01/report.json').events[0].arms[0].cases.slice(0,4);
test('generic CEM matches the existing two-dimensional rank fit on actual evaluated coefficients',()=>{
  const previous={mean:[0,0],cov:[[.1,0],[0,.2]]};assert.deepEqual(G.update(previous,samples.map(s=>s.spec.weights)),updateDistribution(previous,samples));
});
test('four-dimensional updates retain positive covariance even with a rank-deficient elite',()=>{
  const p={mean:[.4,.2,0,0],cov:[[.01,0,0,0],[0,.01,0,0],[0,0,.04,0],[0,0,0,.04]]},vectors=samples.map(s=>[.4,.2,...s.spec.weights]),next=G.update(p,vectors),L=G.cholesky(next.cov);
  for(let a=0;a<4;a++)for(let b=0;b<4;b++){const reconstructed=L[a].reduce((sum,v,j)=>sum+v*L[b][j],0);assert.ok(Math.abs(reconstructed-next.cov[a][b])<1e-12);}
  assert.deepEqual(p.mean,[.4,.2,0,0]);assert.ok(G.transform(next.cov,[1,0,-1,0]).every(Number.isFinite));
});
test('invalid dimensions or nonpositive/asymmetric covariance cannot generate proposals',()=>{
  assert.throws(()=>G.cholesky([[1,2],[2,1]]),/Positive/);assert.throws(()=>G.cholesky([[1,.1],[.2,1]]),/Symmetric/);
  assert.throws(()=>G.transform([[1]],[NaN]),/Finite/);assert.throws(()=>G.update({mean:[0],cov:[[1]]},[[0,1]]),/dimensional/);
});
