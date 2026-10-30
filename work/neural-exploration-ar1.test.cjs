'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),X=require('./neural-exploration-ar1.cjs');
test('AR1 conditional Gaussian uses action history, while rho zero is independent',()=>{
  const prev={mean:[.1,-.2],sigma:[.2,.4],action:[.3,.2]},mean=[.5,-.3],sigma=[.1,.2],r=X.conditional(mean,sigma,prev,.9);
  assert.ok(Math.abs(r.mean[0]-.59)<1e-15);assert.ok(Math.abs(r.mean[1]-(-.12))<1e-15);
  assert.equal(r.std[0],.1*Math.sqrt(.19));
  assert.deepEqual(X.conditional(mean,sigma,prev,0),{mean,std:sigma});
});
test('neural variance is bounded and cannot shift a motor mean',()=>{
  const c=X.validate({direction:[1,0,0],threshold:.1,rho:.9,floor:[.001,.002],ceiling:[.04,.2]},2);
  assert.deepEqual(X.scale([0,0],c).sigma,c.floor);
  assert.deepEqual(X.scale([2,0],c).sigma,c.ceiling);
  assert.equal(X.kl([0,0],[1,2],[0,0],[1,2]),0);
  assert.equal(X.conditional([.2,-.1],[.04,.2],null,.9).mean[1],-.1);
});
