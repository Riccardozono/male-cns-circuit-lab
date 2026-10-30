'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {mutate}=require('../../work/neural-context-mutation.cjs');
function fixture(){
  const p={nodes:Array.from({length:8},(_,i)=>i),featureCount:8,featureNorm:1/Math.sqrt(8),actionCount:3,readoutOffset:4,readoutStride:3,biasOffset:28,scales:Array(31).fill(.1)};
  const values=Array.from({length:31},(_,i)=>Math.sin(i)*.2),centres=Array.from({length:7},(_,i)=>({count:80-i*10,values:Array.from({length:8},(_,j)=>i===j?1:0)}));
  let seed=17;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
  return {graph:{learning:p},values,experience:{centres},random};
}
const logit=(p,w,x,action)=>x.reduce((sum,v,j)=>sum+v*w[p.readoutOffset+j*3+action]*p.featureNorm,w[p.biasOffset+action]);
test('Observed-context mutation preserves four complete action responses and changes a novel response',()=>{
  const f=fixture(),before=f.values.slice(),result=mutate(f.graph,f.values,f.random,.16,f.experience,{focus:'combined'}),p=f.graph.learning;
  assert.equal(result.audit.applied,true);assert.equal(result.audit.anchors,4);
  for(const c of f.experience.centres.slice(0,4))for(let a=0;a<3;a++)assert.ok(Math.abs(logit(p,before,c.values,a)-logit(p,result.weights,c.values,a))<1e-12);
  assert.ok(f.experience.centres.slice(4).some(c=>Math.abs(logit(p,before,c.values,0)-logit(p,result.weights,c.values,0))>.01));
  assert.deepEqual(result.weights.slice(0,p.readoutOffset),before.slice(0,p.readoutOffset));assert.deepEqual(f.values,before);
});
test('Context mutations respect selected heads, symmetric bounds and absent evidence',()=>{
  for(const focus of ['steering','longitudinal'])for(let k=0;k<25;k++){
    const f=fixture();for(let i=4;i<f.values.length;i++)f.values[i]=7.99-k*.01;
    for(let skip=0;skip<k;skip++)f.random();
    const result=mutate(f.graph,f.values,f.random,.64,f.experience,{focus});
    assert.equal(result.audit.applied,true);
    for(let i=0;i<result.weights.length;i++){
      assert.ok(Math.abs(result.weights[i])<=8&&Math.abs(2*f.values[i]-result.weights[i])<=8);
      const a=i>=28?i-28:i>=4?(i-4)%3:-1;
      if(a<0||(focus==='steering'?a!==0:a===0))assert.equal(result.weights[i],f.values[i]);
    }
  }
  const f=fixture();assert.equal(mutate(f.graph,f.values,f.random,.16,null).audit.applied,false);
  assert.deepEqual(mutate(f.graph,f.values,f.random,0,f.experience).weights,f.values);
});
test('Output trust caps empirical RMS and rare-context changes at the measured local-noise budget',()=>{
  const a=fixture(),b=fixture();a.graph.learning.scales.fill(.001);b.graph.learning.scales.fill(.001);
  const free=mutate(a.graph,a.values,a.random,.64,a.experience,{focus:'combined'}),limited=mutate(b.graph,b.values,b.random,.64,b.experience,{focus:'combined',outputTrust:1});
  assert.ok(limited.audit.applied&&limited.audit.clipped);
  assert.ok(limited.audit.maxNormalizedRmsChange<=1+1e-12&&limited.audit.maxNormalizedContextChange<=4+1e-12);
  const distance=result=>Math.hypot(...result.weights.map((v,i)=>v-a.values[i]));
  assert.ok(distance(limited)<distance(free));
  assert.ok(limited.audit.maxAnchorLogitDrift<1e-12);
});
