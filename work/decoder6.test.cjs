'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../outputs/simulation.js'),L=require('../outputs/neural-learning.js'),Legacy=require('../outputs/legacy-models.js'),data=require('../outputs/data/connectome.json'),X=require('./decoder6-model.cjs');
const oldGraph=F.compileGraph(Legacy.tagV3(data)),newGraph=X.F.compileGraph(X.model(data));
const oldPolicy=F.ensureLearning(oldGraph),p=X.F.ensureLearning(newGraph);
test('Decoder6 expands learned features, not biological neurons or edges',()=>{
  assert.equal(newGraph.n,7721);assert.equal(newGraph.edgeCount,242486);assert.deepEqual(newGraph.targets,oldGraph.targets);assert.deepEqual(newGraph.csrWeights,oldGraph.csrWeights);
  assert.deepEqual(p.nodes,oldPolicy.nodes);assert.equal(p.nodes.length,64);assert.equal(p.featureCount,128);assert.equal(p.length,394);assert.equal(p.thresholdOffset,328);
  assert.equal(p.version,6);assert.equal(oldPolicy.length,202);assert.equal(p.featureNorm,1/8);
});
test('Zero-initialized residual transfer preserves every old coefficient and command',()=>{
  const random=F.rng(45),old={adapterVersion:3,policyWeights:L.initial(oldGraph,random)},next={adapterVersion:6,policyWeights:X.transfer(old.policyWeights,oldPolicy,p)};
  assert.deepEqual(next.policyWeights.slice(0,200),old.policyWeights.slice(0,200));assert.deepEqual(next.policyWeights.slice(200,392),Array(192).fill(0));assert.deepEqual(next.policyWeights.slice(-2),old.policyWeights.slice(-2));
  for(let i=0;i<120;i++){
    const activity=Float32Array.from({length:oldGraph.n},()=>i===0?0:random()*2-1);
    assert.deepEqual(X.L.commands(newGraph,{activity},next),L.commands(oldGraph,{activity},old));
  }
});
test('New nonlinear features influence either actuator only through descending activity',()=>{
  const values=p.mean.slice(),brain={activity:new Float32Array(newGraph.n)};brain.activity[p.nodes[0]]=.01;
  const g={adapterVersion:6,policyWeights:values};assert.deepEqual(X.L.commands(newGraph,brain,g),[0,0,0]);
  values[p.readoutOffset+p.nodes.length*2]=4;values[p.readoutOffset+p.nodes.length*2+1]=-4;
  const out=X.L.commands(newGraph,brain,g);assert.ok(out[0]>.1&&out[1]===0&&out[2]>.1);
  values[p.thresholdOffset]=brain.activity[p.nodes[0]];assert.deepEqual(X.L.commands(newGraph,brain,g),[0,0,0]);
  values[p.thresholdOffset]=-3;brain.activity.fill(0);assert.deepEqual(X.L.commands(newGraph,brain,g),[0,0,0]);
  assert.deepEqual(X.L.commands(newGraph,brain,g,true,false),[0,0,0]);
});
test('Safe mutation protects dominant action in the expanded feature space',()=>{
  const random=F.rng(99),values=p.mean.slice(),brain={activity:new Float32Array(newGraph.n)};
  const centres=[];for(let k=0;k<3;k++){for(let j=0;j<p.nodes.length;j++)brain.activity[p.nodes[j]]=Math.sin(j+k)*.02;X.L.commands(newGraph,brain,{adapterVersion:6,policyWeights:values});centres.push({values:Array.from(brain.policyFeatures),count:k?20:100});}
  for(let j=0;j<p.nodes.length;j++)brain.activity[p.nodes[j]]=Math.sin(j)*.02;
  const before=X.L.commands(newGraph,brain,{adapterVersion:6,policyWeights:values});
  for(let i=0;i<30;i++){
    const child=X.L.safeMotorMutation(newGraph,values,random,.24,{centres});assert.ok(X.L.valid(newGraph,child));assert.notDeepEqual(child,values);
    assert.deepEqual(child.slice(p.thresholdOffset,-2),values.slice(p.thresholdOffset,-2));
    const out=X.L.commands(newGraph,brain,{adapterVersion:6,policyWeights:child});out.forEach((v,j)=>assert.ok(Math.abs(v-before[j])<1e-12));
    assert.ok(X.L.valid(newGraph,X.L.mirroredMutation(values,child)));
  }
});
test('Local threshold mutations never mix thresholds with motor parity',()=>{
  const values=p.mean.slice(),blocks=new Set();
  for(let seed=1;seed<100;seed++){
    const child=X.L.localMutation(newGraph,values,F.rng(seed),.24),indices=child.map((v,i)=>v===values[i]?null:i).filter(i=>i!==null);
    assert.ok(X.L.valid(newGraph,child));
    if(indices.some(i=>i>=p.thresholdOffset&&i<p.length-2)){blocks.add('thresholds');assert.ok(indices.every(i=>i>=p.thresholdOffset&&i<p.length-2));}
    if(indices.some(i=>i>=p.readoutOffset&&i<p.thresholdOffset))blocks.add('motor');
  }
  assert.equal(blocks.size,2);
});
test('Old-length weights are rejected rather than silently imported into decoder6',()=>{
  assert.equal(X.L.valid(newGraph,oldPolicy.mean),false);
  assert.throws(()=>X.L.commands(newGraph,{activity:new Float32Array(newGraph.n)},{adapterVersion:3,policyWeights:oldPolicy.mean}),/incompatibile/);
  assert.throws(()=>X.transfer(Array(201).fill(0),oldPolicy,p),/non supportato/);
});
test('Observed threshold proposals preserve dominant logits without using sensor or route data',()=>{
  const r=F.rng(713),values=X.L.initial(newGraph,r),brain={activity:new Float32Array(newGraph.n)},centres=[];
  for(let k=0;k<5;k++){
    for(let j=0;j<p.nodes.length;j++)brain.activity[p.nodes[j]]=Math.sin(j*.2+k)*.04;
    X.L.commands(newGraph,brain,{adapterVersion:6,policyWeights:values});centres.push({count:k?10:100,values:Array.from(brain.policyFeatures)});
  }
  for(let j=0;j<p.nodes.length;j++)brain.activity[p.nodes[j]]=Math.sin(j*.2)*.04;
  const before=X.L.commands(newGraph,brain,{adapterVersion:6,policyWeights:values});
  for(let trial=0;trial<40;trial++){
    const proposal=X.L.representationMutation(newGraph,values,r,{samples:140,centres});assert.ok(X.L.valid(newGraph,proposal.weights));
    assert.notDeepEqual(proposal.weights.slice(p.thresholdOffset,-2),values.slice(p.thresholdOffset,-2));
    assert.deepEqual(proposal.weights.slice(0,p.thresholdOffset),values.slice(0,p.thresholdOffset));
    const after=X.L.commands(newGraph,brain,{adapterVersion:6,policyWeights:proposal.weights});after.forEach((v,i)=>assert.ok(Math.abs(v-before[i])<1e-8));
    const child=X.L.safeMotorMutation(newGraph,proposal.weights,r,.24,proposal.experience);
    assert.ok(X.L.valid(newGraph,child)&&X.L.valid(newGraph,X.L.mirroredMutation(proposal.weights,child)));
  }
});
