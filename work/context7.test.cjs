'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),OldF=require('../outputs/simulation.js'),OldL=require('../outputs/neural-learning.js'),Legacy=require('../outputs/legacy-models.js'),data=require('../outputs/data/connectome.json'),X=require('./context7-model.cjs');
const oldGraph=OldF.compileGraph(Legacy.tagV3(data)),a=OldF.ensureLearning(oldGraph),g=X.F.compileGraph(X.model(data)),p=X.F.ensureLearning(g);
test('Context decoder keeps exact anatomy and reads real descending neurons only',()=>{assert.equal(p.length,1070);assert.equal(p.contextCount,12);assert.deepEqual(g.targets,oldGraph.targets);assert.deepEqual(p.nodes,a.nodes);assert.equal(g.n,7721);assert.equal(g.edgeCount,242486);});
test('Zero residual migration and unsupervised context initialization preserve old actions',()=>{
  const r=OldF.rng(614),weights=OldL.initial(oldGraph,r),next=X.transfer(weights,a,p),experience={centres:[],samples:50};
  for(let k=0;k<12;k++)experience.centres.push({count:k?4:40,values:Array.from({length:64},()=>r()*2-1)});
  const initialized=X.L.initialiseContexts(g,next,experience);assert.notDeepEqual(initialized,next);assert.deepEqual(initialized.slice(0,200),weights.slice(0,200));
  for(let i=0;i<100;i++){const activity=Float32Array.from({length:g.n},()=>i?r()*2-1:0),old=OldL.commands(oldGraph,{activity},{adapterVersion:3,policyWeights:weights});assert.deepEqual(X.L.commands(g,{activity},{adapterVersion:7,policyWeights:next}),old);assert.deepEqual(X.L.commands(g,{activity},{adapterVersion:7,policyWeights:initialized}),old);}
});
test('Context mutations preserve incumbent action at its dominant real neural feature vector',()=>{
  const r=OldF.rng(993),experience={centres:[{count:50,values:Array.from({length:64},()=>r()*.4-.2)},{count:20,values:Array.from({length:64},()=>r()*.8-.4)}]},values=X.transfer(a.mean,a,p),activity=new Float64Array(g.n);
  for(let j=0;j<64;j++)activity[p.nodes[j]]=Math.atanh(experience.centres[0].values[j])/8;
  const old=X.L.commands(g,{activity},{adapterVersion:7,policyWeights:values});
  for(let i=0;i<50;i++){const mutation=X.L.contextMutation(g,values,r,.24,experience);assert.ok(X.L.valid(g,mutation.child));assert.ok(X.L.valid(g,X.L.mirroredMutation(mutation.base,mutation.child)));assert.deepEqual(mutation.child.slice(0,200),values.slice(0,200));const next=X.L.commands(g,{activity},{adapterVersion:7,policyWeights:mutation.child});next.forEach((v,j)=>assert.ok(Math.abs(v-old[j])<1e-12));}
});
test('Context output coefficients and widths cannot bypass zero activity or disabled propagation',()=>{
  const values=p.mean.slice();for(let i=p.contextWeightOffset;i<p.centreOffset;i++)values[i]=8;values[values.length-1]=8;
  const brain=X.F.makeBrain(g),genome={adapterVersion:7,policyWeights:values};assert.deepEqual(X.L.commands(g,brain,genome),[0,0,0]);assert.deepEqual(X.F.neuralStep(g,brain,genome,Array(X.F.SENSOR_COUNT).fill(.8),true,false),[0,0,0]);
});
test('Old model revisions and wrong parameter lengths fail closed',()=>{assert.equal(X.L.valid(g,a.mean),false);assert.throws(()=>X.L.commands(g,{activity:new Float64Array(g.n)},{adapterVersion:3,policyWeights:a.mean}),/incompatibile/);assert.throws(()=>X.transfer(Array(394).fill(0),a,p),/non supportato/);});
test('Mutations are bounded even when a context index is sampled repeatedly near a limit',()=>{
  const values=p.mean.slice(),r=OldF.rng(261),experience={centres:[{count:100,values:Array(64).fill(.3)},{count:20,values:Array(64).fill(-.5)}]};
  const base=X.L.initialiseContexts(g,values,experience);for(let j=p.contextWeightOffset;j<p.centreOffset;j++)base[j]=j%2?7.99:-7.99;
  for(let k=0;k<1000;k++){const proposal=X.L.contextMutation(g,base,r,.35,experience);assert.ok(X.L.valid(g,proposal.child));assert.ok(X.L.valid(g,X.L.mirroredMutation(proposal.base,proposal.child)));}
});
test('Protected actual neural-prefix states bound action leakage, not only one average anchor',()=>{
  const r=OldF.rng(189),prefix=Array.from({length:30},(_,k)=>Array.from({length:64},(_,j)=>Math.sin(j*.1)*.3+k*.003)),experience={centres:[{count:80,values:prefix[15]},{count:20,values:Array(64).fill(-.65)}]},values=p.mean.slice();
  for(let trial=0;trial<100;trial++){
    const proposal=X.L.safeContextMutation(g,values,r,.35,experience,prefix);assert.ok(X.L.valid(g,proposal.child));assert.ok(proposal.leak<=.002+1e-12);
    for(const f of prefix){const activity=new Float64Array(g.n);for(let j=0;j<64;j++)activity[p.nodes[j]]=Math.atanh(f[j])/8;
      const a=X.L.commands(g,{activity},{adapterVersion:7,policyWeights:proposal.base}),b=X.L.commands(g,{activity},{adapterVersion:7,policyWeights:proposal.child});a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<=.002+1e-12));}
  }
});
