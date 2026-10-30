'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),F=require('../outputs/simulation.js'),L=require('../outputs/neural-learning.js'),Legacy=require('../outputs/legacy-models.js'),X=require('./context8-model.cjs'),data=require('../outputs/data/connectome.json');
const oldGraph=F.compileGraph(Legacy.tagV3(data)),old=F.ensureLearning(oldGraph),g=X.F.compileGraph(X.model(data)),p=X.F.ensureLearning(g);
test('Normalized contexts preserve exact migrated commands and unchanged real anatomical graph',()=>{
  assert.equal(p.version,8);assert.equal(p.length,1070);assert.deepEqual(g.targets,oldGraph.targets);assert.deepEqual(p.nodes,old.nodes);
  const r=F.rng(426),values=L.initial(oldGraph,r),migrated=X.transfer(values,old,p),experience={centres:Array.from({length:64},(_,k)=>({count:k+1,values:Array.from({length:64},()=>r()*1.8-.9)}))},initialized=X.L.initialiseContexts(g,migrated,experience);
  for(let k=0;k<100;k++){const activity=Float64Array.from({length:g.n},()=>k?r()*.4-.2:0),expected=L.commands(oldGraph,{activity},{adapterVersion:3,policyWeights:values});assert.deepEqual(X.L.commands(g,{activity},{adapterVersion:8,policyWeights:migrated}),expected);assert.deepEqual(X.L.commands(g,{activity},{adapterVersion:8,policyWeights:initialized}),expected);}
});
test('Context probabilities stay finite and partition unity even far from observed states',()=>{
  const r=F.rng(917),values=p.mean.slice(),experience={centres:Array.from({length:64},(_,k)=>({count:k+1,values:Array.from({length:64},()=>r()*1.8-.9)}))},base=X.L.initialiseContexts(g,values,experience);
  for(let n=0;n<100;n++){const vector=Array.from({length:64},()=>r()*16-8),f=X.L.contextVector(g,base,vector);assert.ok(f.every(v=>Number.isFinite(v)&&Math.abs(v)<=1));assert.ok(Math.abs(f.reduce((a,b)=>a+b,0))<1e-12);}
});
test('Observed neural clustering is finer but bounded and excludes raw sensors, pose and targets',()=>{
  const r=F.rng(376),brain={contextFeatures:new Float64Array(12)};
  for(let k=0;k<1500;k++){brain.policyFeatures=Float64Array.from({length:64},()=>r()*2-1);X.L.rememberActivity(brain);}
  assert.equal(brain.policyExperience.samples,1500);assert.equal(brain.policyExperience.centres.length,64);assert.ok(brain.policyExperience.centres.every(c=>c.values.length===64&&c.count>0&&Number.isInteger(c.lastSeen)));
  assert.ok(brain.policyExperience.centres.every(c=>Object.keys(c).every(k=>['values','count','lastSeen'].includes(k))));
});
test('Protected-prefix context changes have bounded leakage and valid mirrored coefficients',()=>{
  const r=F.rng(932),prefix=Array.from({length:30},(_,k)=>Array.from({length:64},(_,j)=>Math.sin(j*.1)*.3+k*.003)),experience={centres:[{count:80,values:prefix[15]},{count:20,values:Array(64).fill(-.65)}]},values=p.mean.slice();
  for(let trial=0;trial<100;trial++){const proposal=X.L.safeContextMutation(g,values,r,.35,experience,prefix);assert.ok(X.L.valid(g,proposal.child));assert.ok(X.L.valid(g,X.L.mirroredMutation(proposal.base,proposal.child)));assert.ok(proposal.leak<=.002+1e-12);
    for(const f of prefix){const activity=new Float64Array(g.n);for(let j=0;j<64;j++)activity[p.nodes[j]]=Math.atanh(f[j])/8;const a=X.L.commands(g,{activity},{adapterVersion:8,policyWeights:proposal.base}),b=X.L.commands(g,{activity},{adapterVersion:8,policyWeights:proposal.child});a.forEach((v,j)=>assert.ok(Math.abs(v-b[j])<=.002+1e-12));}
  }
});
test('No neural activity and disabled anatomical propagation still mean zero actions',()=>{
  const values=p.mean.slice();for(let k=p.contextWeightOffset;k<p.centreOffset;k++)values[k]=8;values[values.length-1]=8;
  const brain=X.F.makeBrain(g),genome={adapterVersion:8,policyWeights:values};assert.deepEqual(X.L.commands(g,brain,genome),[0,0,0]);assert.deepEqual(X.F.neuralStep(g,brain,genome,Array(X.F.SENSOR_COUNT).fill(.9),true,false),[0,0,0]);
});
test('Saved sigma lower bounds remain valid after an actual optimizer update',()=>{
  const optimizer=new X.L.EvolutionStrategy(g),a=p.mean.slice(),b=p.mean.slice();b[0]+=.01;optimizer.update([{fitness:2,genome:{policyWeights:a}},{fitness:1,genome:{policyWeights:b}}]);assert.ok(optimizer.sigma.every(s=>s>=.000001));
});
