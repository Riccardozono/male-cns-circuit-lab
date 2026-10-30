'use strict';
// Unit algebra only: neither example specifies a correct driving action.
const test=require('node:test'),assert=require('node:assert/strict'),P=require('./neural-ppo-steering-policy.cjs'),Old=require('./neural-ppo-wide-policy.cjs');
test('Zero residual and zero gate preserve parent commands exactly',()=>{
  assert.deepEqual(P.compose([.8,.5,0],1,[0,0]),[.8,.5,0]);assert.deepEqual(P.compose([.8,.5,0],0,[.5,-.5]),[.8,.5,0]);
});
test('Only steering latent scale changes; motors remain bounded and pedals exclusive',()=>{
  for(const action of [[.12,.08],[-.12,-.08],[.6,-.6],[0,0]]){const a=P.compose([.5,.3,0],1,action),b=Old.compose([.5,.3,0],1,action);assert.equal(a[1],b[1]);assert.equal(a[2],b[2]);assert.equal(Math.min(a[1],a[2]),0);assert.ok(a.every(v=>Math.abs(v)<=1));}
  assert.ok(Math.abs(P.compose([0,0,0],1,[.12,0])[0])>Math.abs(Old.compose([0,0,0],1,[.12,0])[0]));
});
