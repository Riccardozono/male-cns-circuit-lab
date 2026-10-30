'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{CMA,eigen}=require('./neural-cma.cjs'),F=require('../outputs/simulation.js'),P=require('./ppo-neural.cjs');
test('Jacobi eigensystem reconstructs a correlated covariance',()=>{
  const a=[[2,.4,-.2],[.4,1,.3],[-.2,.3,.8]],{values,vectors:b}=eigen(a);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)assert.ok(Math.abs(b[i].reduce((sum,v,k)=>sum+v*values[k]*b[j][k],0)-a[i][j])<1e-10);
});
test('Full covariance evolution converges on a rotated ill-conditioned objective',()=>{
  const c=new CMA([3,-2,4,1],.7,16),r=F.rng(14417);let best=Infinity;
  for(let t=0;t<250;t++){const candidates=c.ask(r).map(row=>({...row,fitness:-((row.x[0]+row.x[1]-1)**2*100+(row.x[0]-row.x[1]-.2)**2+(row.x[2]-.3)**2*10+(row.x[3]+.7)**2)}));c.tell(candidates);best=Math.min(best,-Math.max(...candidates.map(v=>v.fitness)));}
  assert.ok(best<1e-12,String(best));assert.deepEqual(CMA.restore(c).ask(F.rng(910)),c.ask(F.rng(910)));assert.throws(()=>c.tell([]),/Invalid/);
});
test('Neural-prefix projection preserves all protected logits and parameter bounds',()=>{
  const reference={dimension:4,weights:[.1,.3,.2,-.4,.1,.1,0,0]},actor={dimension:4,weights:[1,2,3,-4,2,-1,.5,-.2]},anchors=[[1,0,1,1],[0,1,1,1]],basis=P.prefixBasis(anchors);
  P.projectActor(actor,reference,basis);
  for(const x of anchors)for(let action=0;action<2;action++)assert.ok(Math.abs(x.reduce((s,v,j)=>s+v*(actor.weights[j*2+action]-reference.weights[j*2+action]),0))<1e-12);
  assert.ok(actor.weights.every(v=>Math.abs(v)<=8));
});
test('One-sided prefix projection lets saturated coefficients move inward',()=>{
  for(const bound of [-8,8]){
    const reference={dimension:2,weights:[bound,0,0,0]},actor={dimension:2,weights:[bound-Math.sign(bound),.2,.3,.4]};
    P.projectActor(actor,reference,[]);assert.equal(actor.weights[0],bound-Math.sign(bound));assert.equal(actor.weights[1],.2);
    const outward={dimension:2,weights:[bound+Math.sign(bound),0,0,0]};P.projectActor(outward,reference,[]);assert.equal(outward.weights[0],bound);
  }
});
