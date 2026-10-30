'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{rescale,response}=require('./prefix-output-mutation.cjs');
const policy={nodes:[0,1],readoutOffset:2},parent=[1,2,.5,-.2,.3,.1,.1,-.1],rows=[[.1,.7],[-.4,.6],[.8,-.1]];
test('Both directions keep the measured command budget and exact coefficient symmetry',()=>{
  const raw=parent.map((v,i)=>i<2?v:v+1.5),r=rescale(policy,parent,raw,rows,{rmsLimit:.03,maxLimit:.08});
  assert.ok(r.factor>0&&r.factor<1);
  for(const child of [r.child,r.mirror]){const x=response(policy,parent,child,rows);assert.ok(x.rms<=.03+1e-12&&x.max<=.08+1e-12);assert.deepEqual(child.slice(0,2),parent.slice(0,2));}
  for(let i=0;i<parent.length;i++)assert.ok(Math.abs(r.child[i]+r.mirror[i]-2*parent[i])<1e-12);
});
test('An already small mutation is unchanged and the inputs remain intact',()=>{
  const raw=parent.map((v,i)=>i<2?v:v+.001),before=JSON.stringify({parent,raw,rows}),r=rescale(policy,parent,raw,rows,{rmsLimit:.03,maxLimit:.08});
  assert.equal(r.factor,1);assert.deepEqual(r.child,raw);assert.equal(JSON.stringify({parent,raw,rows}),before);
});
test('Calibration rejects sensory/gain changes, non-finite rows and missing evidence',()=>{
  assert.throws(()=>rescale(policy,parent,parent.map(v=>v+.1),rows,{rmsLimit:.03,maxLimit:.1}),/motor readout/);
  assert.throws(()=>rescale(policy,parent,parent,[],{rmsLimit:.03,maxLimit:.1}),/neural calibration/);
  assert.throws(()=>rescale(policy,parent,parent,[[NaN,0]],{rmsLimit:.03,maxLimit:.1}),/neural calibration/);
});
