'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('./ppo-neural.cjs'),F=require('../outputs/simulation.js'),X=require('./context8-model.cjs');
test('GAE handles real termination separately from truncated bootstrap estimates',()=>{
  const a=P.gae([{reward:1,value:2,nextValue:3,terminal:true}],.9,.95)[0];assert.equal(a.advantage,-1);assert.equal(a.targetValue,1);
  const b=P.gae([{reward:1,value:2,nextValue:3,terminal:false}],.9,.95)[0];assert.ok(Math.abs(b.advantage-1.7)<1e-12);assert.ok(Math.abs(b.targetValue-3.7)<1e-12);
});
test('Clipped Gaussian policy gradient matches finite differences without teacher targets',()=>{
  const actor={dimension:2,weights:[.1,-.2,.03,.02],mean(x){return [x[0]*this.weights[0]+x[1]*this.weights[2],x[0]*this.weights[1]+x[1]*this.weights[3]];}},row={features:[.4,1],sample:[.13,-.15],shift:[.01,.02],std:[.3,.25],advantage:1.3,active:true};
  row.logp=P.logProbability(row.sample,actor.mean(row.features).map((v,j)=>v+row.shift[j]),row.std);const result=P.actorGradient(actor,row);
  for(let j=0;j<actor.weights.length;j++){const value=actor.weights[j],eps=1e-6;actor.weights[j]=value+eps;const up=P.actorGradient(actor,row).loss;actor.weights[j]=value-eps;const down=P.actorGradient(actor,row).loss;actor.weights[j]=value;assert.ok(Math.abs((up-down)/(2*eps)-result.gradient[j])<1e-7);}
  row.logp-=1;assert.ok(P.actorGradient(actor,row).clipped);row.advantage=-1.3;row.logp+=2;assert.ok(P.actorGradient(actor,row).clipped);
});
test('Value-network backpropagation matches numerical gradients on bounded data',()=>{
  const critic=new P.Critic(3,F.rng(187),4),x=[.2,-.4,1],gradient=critic.gradient(x,.7).gradient;
  for(let j=0;j<critic.weights.length;j++){const value=critic.weights[j],eps=1e-6;critic.weights[j]=value+eps;const up=critic.gradient(x,.7).loss;critic.weights[j]=value-eps;const down=critic.gradient(x,.7).loss;critic.weights[j]=value;assert.ok(Math.abs((up-down)/(2*eps)-gradient[j])<1e-7);}
  assert.deepEqual(P.Critic.restore(critic.snapshot()).forward(x),critic.forward(x));
});
test('Adam descends a known quadratic and refuses non-finite gradients',()=>{
  const optimizer=new P.Adam(1,.02),values=[3];for(let i=0;i<500;i++)optimizer.update(values,[values[0]-1],2);assert.ok(Math.abs(values[0]-1)<.001);assert.throws(()=>optimizer.update(values,[NaN]),/Non-finite/);
});
test('Actor agrees exactly with the real neural decoder and cannot sample controls when silent',()=>{
  const graph=X.F.compileGraph(X.model(require('../outputs/data/connectome.json'))),p=X.F.ensureLearning(graph),genes=X.L.initial(graph,F.rng(672)),actor=new P.Actor(p,genes),brain=X.F.makeBrain(graph),r=F.rng(812);
  for(let trial=0;trial<20;trial++){
    for(const node of p.nodes)brain.activity[node]=r()*.4-.2;
    const state=P.neuralFeatures(graph,brain,genes,X.L),mean=actor.mean(state.features),expected=X.L.commands(graph,brain,{adapterVersion:8,policyWeights:genes});
    assert.ok(Math.abs(Math.tanh(mean[0])-expected[0])<1e-12);assert.ok(Math.abs(Math.tanh(mean[1])-expected[1]+expected[2])<1e-12);
    const sampled=P.sampleAction(actor,state,r,[.2,.2]);assert.ok(sampled.controls.every(Number.isFinite));assert.equal(sampled.controls[1]*sampled.controls[2],0);
  }
  brain.activity.fill(0);const quiet=P.neuralFeatures(graph,brain,genes,X.L);assert.deepEqual(P.sampleAction(actor,quiet,r,[1,1]).controls,[0,0,0]);
  brain.activity[p.nodes[0]]=.2;assert.deepEqual(P.sampleAction(actor,P.neuralFeatures(graph,brain,genes,X.L,true,false),r,[1,1]).controls,[0,0,0]);
});
