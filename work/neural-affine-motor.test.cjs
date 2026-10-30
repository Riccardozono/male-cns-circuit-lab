'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Affine=require('./neural-affine-motor.cjs');

test('Zero affine head is bit-exact identity and leaves parent commands untouched',()=>{
  let state=0x6d2b79f5;
  const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/0x100000000;};
  const samples=[[-1,0,0],[1,0,0],[0,0,0],[0,1,0],[0,0,1]];
  for(let i=0;i<2000;i++){const steer=next()*2-1,long=next()*2-1;samples.push([steer,Math.max(0,long),Math.max(0,-long)]);}
  for(const prior of samples){const before=prior.slice(),actual=Affine.compose(prior,[0,0,0,0]);assert.deepEqual(actual,prior);assert.deepEqual(prior,before);}
});

test('The affine head transforms the actual command without ever overlapping pedals',()=>{
  for(const prior of [[-.8,.7,0],[.25,0,.9],[-1,0,0],[0,0,0]])for(const weights of [[1.2,.5,-.7,.3],[-1.5,-2,1.5,2]]){
    const actual=Affine.compose(prior,weights);assert.equal(actual.length,3);assert.ok(actual.every(Number.isFinite));assert.ok(actual.every(v=>Math.abs(v)<=1));assert.ok(actual[1]>=0&&actual[2]>=0);assert.equal(Math.min(actual[1],actual[2]),0);
  }
});

test('Each affine motor pair leaves the other channel bit-exact',()=>{
  const prior=[.234567890123,.67,0],steerOnly=Affine.compose(prior,[.4,.2,0,0]);
  assert.equal(steerOnly[1],prior[1]);assert.equal(steerOnly[2],prior[2]);
  const throttleOnly=Affine.compose(prior,[0,0,-.3,.7]);assert.equal(throttleOnly[0],prior[0]);
});

test('Neural gate zero preserves the verified parent exactly; gate one matches the direct head',()=>{
  const prior=[.234567890123,.67,0],weights=[.4,.2,-.3,.7];
  assert.deepEqual(Affine.composeGated(prior,weights,0),prior);
  assert.deepEqual(Affine.composeGated(prior,weights,1),Affine.compose(prior,weights));
});

test('Fractional neural gates scale the affine parameters and keep mutually exclusive pedals',()=>{
  const prior=[-.47,0,.82],weights=[.8,-.4,.6,.3],gate=.25;
  assert.deepEqual(Affine.composeGated(prior,weights,gate),Affine.compose(prior,weights.map(v=>v*gate)));
  for(const value of Affine.composeGated(prior,weights,gate))assert.ok(Number.isFinite(value)&&Math.abs(value)<=1);
  const result=Affine.composeGated(prior,weights,gate);assert.equal(Math.min(result[1],result[2]),0);
});

test('Malformed commands and out-of-range parameters are rejected',()=>{
  for(const [prior,weights] of [
    [[0,.2,.1],[0,0,0,0]],[[0,-.1,0],[0,0,0,0]],[[0,1.1,0],[0,0,0,0]],[[0,0,0],[0,0,0]],[[0,0,0],[NaN,0,0,0]],[[0,0,0],[1.51,0,0,0]],[[0,0,0],[0,0,0,2.01]]
  ])assert.throws(()=>Affine.compose(prior,weights));
  for(const gate of [NaN,-.01,1.01])assert.throws(()=>Affine.composeGated([0,0,0],[0,0,0,0],gate));
});
