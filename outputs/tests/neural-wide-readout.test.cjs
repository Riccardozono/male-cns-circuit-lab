'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const F=require('../simulation.js');
const Learning=require('../neural-learning.js');
const Legacy=require('../legacy-models.js');
const Progress=require('../progress-save.js');

const source=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','connectome.json'),'utf8'));
const original=F.compileGraph(Legacy.tagV3(source));
const legacySensors=F.compileGraph(Legacy.tagV3TrainingBaseline(source));
const currentSensors=F.compileGraph(Legacy.tagV3TrainingCurrent(source));
const expanded=F.compileGraph(Legacy.tagV3WideReadout(source));
const oldPolicy=F.ensureLearning(original),newPolicy=F.ensureLearning(expanded);

function mappedWeights(){
  const old=Array.from({length:oldPolicy.length},(_,index)=>Math.sin(index*.17)*.7);
  const next=Array(newPolicy.length).fill(0);
  next.splice(0,oldPolicy.readoutOffset,...old.slice(0,oldPolicy.readoutOffset));
  for(let feature=0;feature<oldPolicy.nodes.length;feature++)for(let action=0;action<2;action++)next[newPolicy.readoutOffset+feature*2+action]=old[oldPolicy.readoutOffset+feature*2+action];
  next[newPolicy.length-2]=old[oldPolicy.length-2];next[newPolicy.length-1]=old[oldPolicy.length-1];
  return [old,next];
}

test('V3 wide readout keeps the existing 64 neuron identities and starts 64 new outputs at zero',()=>{
  assert.equal(oldPolicy.version,3);assert.equal(oldPolicy.length,202);assert.equal(oldPolicy.nodes.length,64);
  assert.equal(newPolicy.version,6);assert.equal(newPolicy.length,330);assert.equal(newPolicy.nodes.length,128);
  assert.deepEqual(Array.from(newPolicy.nodes.slice(0,64)),Array.from(oldPolicy.nodes));
  assert.equal(newPolicy.normalizationCount,64);assert.equal(newPolicy.signalCount,64);
  const [,weights]=mappedWeights();
  for(let i=newPolicy.readoutOffset+64*2;i<newPolicy.length-2;i++)assert.equal(weights[i],0);
});

test('training-only migration profiles preserve the 5.6 centerline sensor semantics',()=>{
  assert.equal(original.sensorProfile,null);
  assert.equal(legacySensors.sensorProfile,'v3-centerline-legacy-v1');
  assert.equal(currentSensors.sensorProfile,'v3-footprint-current-v57-v1');
  assert.equal(expanded.sensorProfile,legacySensors.sensorProfile);
  assert.equal(Progress.compatibleGraph(original).sensorProfile,undefined);
  assert.equal(Progress.compatibleGraph(legacySensors).sensorProfile,legacySensors.sensorProfile);
  assert.equal(Progress.compatibleGraph(currentSensors).sensorProfile,currentSensors.sensorProfile);
  const normal=new F.Simulation(Legacy.tagV3(source),{population:1,running:false});
  const baseline=new F.Simulation(Legacy.tagV3TrainingBaseline(source),{population:1,running:false});
  const current=new F.Simulation(Legacy.tagV3TrainingCurrent(source),{population:1,running:false});
  const wide=new F.Simulation(Legacy.tagV3WideReadout(source),{population:1,running:false});
  assert.equal(normal.cars[0].footprintSensorsEnabled,true);
  assert.equal(baseline.cars[0].footprintSensorsEnabled,false);
  assert.equal(current.cars[0].footprintSensorsEnabled,true);
  assert.equal(wide.cars[0].footprintSensorsEnabled,false);
});

test('mapped decoder reproduces V3 actions even when only appended neurons are active',()=>{
  const [oldWeights,newWeights]=mappedWeights(),activity=new Float64Array(original.n);
  for(let index=0;index<activity.length;index++)activity[index]=Math.sin(index*.013)*.04;
  const oldBrain={activity:activity.slice()},newBrain={activity:activity.slice()};
  const oldGenome={adapterVersion:oldPolicy.version,policyWeights:oldWeights},newGenome={adapterVersion:newPolicy.version,policyWeights:newWeights};
  assert.deepEqual(Learning.commands(original,oldBrain,oldGenome),Learning.commands(expanded,newBrain,newGenome));
  activity.fill(0);activity[newPolicy.nodes[90]]=.5;
  assert.deepEqual(Learning.commands(original,{activity:activity.slice()},{adapterVersion:oldPolicy.version,policyWeights:oldWeights}),[0,0,0]);
  assert.deepEqual(Learning.commands(expanded,{activity:activity.slice()},{adapterVersion:newPolicy.version,policyWeights:newWeights}),[0,0,0]);
});

test('wide-readout safe motor mutation preserves actions using the configured 64-neuron normalization',()=>{
  const simulation=new F.Simulation(Legacy.tagV3WideReadout(source),{population:1,running:false});
  const graph=simulation.graph,policy=graph.learning,features=Array.from({length:policy.nodes.length},(_,j)=>Math.sin(j*.19)*.2+Math.cos(j*.07)*.1);
  const experience={centres:[{values:features,count:100}]},values=mappedWeights()[1];
  const actionAt=weights=>{
    const brain=F.makeBrain(graph);brain.policyFeatures=Float64Array.from(features);
    for(let j=0;j<features.length;j++)brain.activity[policy.nodes[j]]=Math.atanh(features[j])/8;
    return Learning.commands(graph,brain,{adapterVersion:policy.version,policyWeights:weights});
  };
  const incumbent=actionAt(values);
  for(let seed=1;seed<=24;seed++){
    const child=Learning.safeMotorMutation(graph,values,F.rng(seed),.24,experience);
    assert.ok(Learning.valid(graph,child));assert.notDeepEqual(child,values);
    actionAt(child).forEach((action,index)=>assert.ok(Math.abs(action-incumbent[index])<1e-12,`seed ${seed}, action ${index} changed`));
  }
});
