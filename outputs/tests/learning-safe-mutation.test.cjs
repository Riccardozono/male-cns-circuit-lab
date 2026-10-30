'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../simulation.js'),L=require('../neural-learning.js'),P=require('../progress-save.js'),Legacy=require('../legacy-models.js'),data=require('../data/connectome.json');
const sim=()=>new F.Simulation(Legacy.buildV2(data),{population:4});
const context=n=>{
  const common=Array.from({length:n},(_,j)=>Math.sin(j*.2)*.2),second=common.map((v,j)=>v+Math.cos(j*.5)*.1);
  return {samples:340,centres:[{values:common,count:200},{values:second,count:120},{values:common.map((v,j)=>v+(j%2?.5:-.5)),count:20}]};
};
const actions=(s,weights,features)=>{
  const brain=F.makeBrain(s.graph);for(let j=0;j<features.length;j++)brain.activity[s.graph.learning.nodes[j]]=Math.atanh(features[j])/8;
  return L.commands(s.graph,brain,{adapterVersion:3,policyWeights:weights});
};
test('Safe motor exploration preserves incumbent actions in the dominant observed neural context',()=>{
  const s=sim(),p=s.graph.learning,x=context(p.nodes.length),values=s.cars[0].genome.policyWeights;
  for(let seed=1;seed<30;seed++){
    const child=L.safeMotorMutation(s.graph,values,F.rng(seed),.24,x);
    assert.ok(L.valid(s.graph,child));assert.notDeepEqual(child,values);
    for(const c of x.centres.slice(0,1)){
      const a=actions(s,values,c.values),b=actions(s,child,c.values);
      a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-12));
    }
  }
});
test('Safe mutations explore either action without changing sensory injection or synaptic gains',()=>{
  const s=sim(),p=s.graph.learning,x=context(p.nodes.length),values=s.cars[0].genome.policyWeights,changedActions=new Set();
  for(let seed=1;seed<30;seed++){
    const child=L.safeMotorMutation(s.graph,values,F.rng(seed),.16,x);
    assert.deepEqual(child.slice(0,p.readoutOffset),values.slice(0,p.readoutOffset));
    const changed=child.map((v,i)=>v===values[i]?null:i).filter(i=>i!==null);
    assert.ok(changed.length>0);for(const i of changed)changedActions.add((i-p.readoutOffset)%2);
  }
  assert.equal(changedActions.size,2);
});
test('Stall-focused mutation changes only the learned longitudinal readout, including without saved context',()=>{
  const s=sim(),p=s.graph.learning,values=s.cars[0].genome.policyWeights;
  const child=L.safeMotorMutation(s.graph,values,F.rng(41),.16,null,'longitudinal');
  assert.ok(L.valid(s.graph,child));assert.notDeepEqual(child,values);
  const allowed=new Set(Array.from({length:p.nodes.length},(_,j)=>p.readoutOffset+j*2+1));allowed.add(values.length-1);
  const changed=child.map((value,index)=>value===values[index]?null:index).filter(index=>index!==null);
  assert.ok(changed.length>0);assert.ok(changed.every(index=>allowed.has(index)),'only the longitudinal motor weights and its bias may change');
  assert.deepEqual(child.slice(0,p.readoutOffset),values.slice(0,p.readoutOffset),'connectome gains and sensory injection stay unchanged');
});
test('Combined motor mutation can explore steering and longitudinal readouts together',()=>{
  const s=sim(),p=s.graph.learning,x=context(p.nodes.length),values=s.cars[0].genome.policyWeights,changedActions=new Set();
  const allowed=new Set();
  for(let j=0;j<p.nodes.length;j++){allowed.add(p.readoutOffset+j*2);allowed.add(p.readoutOffset+j*2+1);}
  allowed.add(values.length-2);allowed.add(values.length-1);
  for(let seed=1;seed<30;seed++){
    const child=L.safeMotorMutation(s.graph,values,F.rng(seed),.16,x,'combined');
    assert.ok(L.valid(s.graph,child));assert.notDeepEqual(child,values);
    const changed=child.map((value,index)=>value===values[index]?null:index).filter(index=>index!==null);
    assert.ok(changed.every(index=>allowed.has(index)),'only both motor readouts and their biases may change');
    for(const i of changed)changedActions.add((i-p.readoutOffset)%2);
    assert.deepEqual(child.slice(0,p.readoutOffset),values.slice(0,p.readoutOffset),'sensory injection and synaptic gains remain unchanged');
  }
  assert.deepEqual([...changedActions].sort(),[0,1]);
});
test('Local practice cannot alter the population, award inherited metres or create laps',()=>{
  const s=sim(),car=s.cars[0];for(let i=0;i<30&&car.alive;i++)s.tick();
  const state=F.capturePracticeState(car),before=JSON.stringify(P.capture(s)),body=JSON.stringify(car),neurons=car.brain.activity.slice();
  const result=F.evaluatePractice(s.track,s.graph,car.genome,state,1);
  assert.equal(result.laps,0);assert.ok(result.progress<=120*F.DT+1e-5);assert.ok(Number.isFinite(result.fitness));
  assert.equal(JSON.stringify(P.capture(s)),before);assert.equal(JSON.stringify(car),body);assert.deepEqual(car.brain.activity,neurons);
  assert.throws(()=>F.evaluatePractice(s.track,{full:true},car.genome,state),/GPU/);
});
test('V3 local practice reuses the captured footprint-aware wall sensors',()=>{
  const v3=new F.Simulation(Legacy.tagV3(JSON.parse(JSON.stringify(data))),{population:1}),car=v3.cars[0],track=v3.track,
    a=track.center[0],b=track.center[1],heading=Math.atan2(b.y-a.y,b.x-a.x),nx=-Math.sin(heading),ny=Math.cos(heading);
  Object.assign(car,{x:a.x+nx*(track.halfWidth-.8),y:a.y+ny*(track.halfWidth-.8),heading});
  const state=F.capturePracticeState(car);
  assert.equal(state.footprintSensorsEnabled,true,'the captured V3 rollout records its footprint sensor mode');
  const replay=F.makeCar(track,0,F.cloneGenome(car.genome));
  Object.assign(replay,{x:state.x,y:state.y,heading:state.heading,speed:state.speed});
  replay.vehicle=JSON.parse(JSON.stringify(state.vehicle));replay.footprintSensorsEnabled=state.footprintSensorsEnabled;
  assert.deepEqual(F.roadSense(track,replay),F.roadSense(track,car),'practice sees the same physical wall clearance as the real V3 car');
  const centreOnly=F.makeCar(track,0,F.cloneGenome(car.genome));
  Object.assign(centreOnly,{x:state.x,y:state.y,heading:state.heading,speed:state.speed});
  centreOnly.vehicle=JSON.parse(JSON.stringify(state.vehicle));
  assert.notDeepEqual(F.roadSense(track,centreOnly),F.roadSense(track,car),'the fixture distinguishes centre rays from the Porsche footprint');
  const result=F.evaluatePractice(track,v3.graph,car.genome,state,1);
  assert.ok(Number.isFinite(result.fitness));
});
test('Sensory exploration changes existing encoder weights without altering anatomy or the parent',()=>{
  const s=sim(),car=s.cars[0];for(let i=0;i<70&&car.alive;i++)s.tick();
  const genome=F.cloneGenome(car.genome),edges=s.graph.targets.slice(),neurons=car.brain.activity.slice();
  const context={activity:car.brain.activity.slice(),sensors:car.sensorVector.slice()};
  const child=F.mutateSensoryBlock(s.graph,genome,F.rng(12),.24,context);
  assert.ok(L.valid(s.graph,child.policyWeights));assert.notDeepEqual(child.policyWeights.slice(0,56),genome.policyWeights.slice(0,56));
  assert.deepEqual(child.policyWeights.slice(56,-2),genome.policyWeights.slice(56,-2));
  assert.deepEqual(car.genome,genome);assert.deepEqual(car.brain.activity,neurons);assert.deepEqual(s.graph.targets,edges);
  assert.deepEqual(F.mutateSensoryBlock(s.graph,genome,F.rng(12),0,context),genome);
});
test('Sensory trials and their mirrored partners cannot overflow saved parameter bounds',()=>{
  const s=sim(),car=s.cars[0],g=F.cloneGenome(car.genome),context={activity:car.brain.activity.slice(),sensors:car.sensorVector.slice()};
  for(let j=0;j<56;j++)g.policyWeights[j]=j%2?7.99:-7.99;
  for(let seed=1;seed<30;seed++){
    const c=F.mutateSensoryBlock(s.graph,g,F.rng(seed),.35,context),mirror=L.mirroredMutation(g.policyWeights,c.policyWeights);
    assert.ok(L.valid(s.graph,c.policyWeights)&&L.valid(s.graph,mirror));
  }
});
test('Scaled motor trials keep both mirrored weights valid without changing the anchor',()=>{
  const s=sim(),x=context(s.graph.learning.nodes.length),values=s.cars[0].genome.policyWeights;
  const child=L.safeMotorMutation(s.graph,values,F.rng(91),.35,x);
  for(const factor of [-3,-1,1,3]){
    const c=L.scaleMutation(values,child,factor),mirror=L.mirroredMutation(values,c);
    assert.ok(L.valid(s.graph,c)&&L.valid(s.graph,mirror));
    const a=actions(s,values,x.centres[0].values),b=actions(s,c,x.centres[0].values);
    a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-12));
  }
});
test('Safe exploration and its mirrored counterpart are bounded and symmetric near weight limits',()=>{
  const s=sim(),p=s.graph.learning,x=context(p.nodes.length),values=s.cars[0].genome.policyWeights.slice();
  for(let j=p.readoutOffset;j<values.length;j++)values[j]=j%2?7.999:-7.999;
  for(let seed=1;seed<40;seed++){
    const a=L.safeMotorMutation(s.graph,values,F.rng(seed),.35,x),b=L.mirroredMutation(values,a);
    assert.ok(L.valid(s.graph,a)&&L.valid(s.graph,b));
    for(let j=0;j<values.length;j++)assert.ok(Math.abs(a[j]+b[j]-2*values[j])<1e-12);
  }
  assert.deepEqual(L.safeMotorMutation(s.graph,values,F.rng(1),0,x),values);
});
test('Recording observed activity never changes neurons, policy weights or decoded actions',()=>{
  const s=sim(),car=s.cars[0],x=context(s.graph.learning.nodes.length);
  car.brain.policyFeatures=Float64Array.from(x.centres[0].values);
  const weights=car.genome.policyWeights.slice(),neurons=car.brain.activity.slice(),before=L.commands(s.graph,car.brain,car.genome);
  for(let i=0;i<100;i++)L.rememberActivity(car.brain);
  assert.deepEqual(car.brain.activity,neurons);assert.deepEqual(car.genome.policyWeights,weights);
  assert.deepEqual(L.commands(s.graph,car.brain,car.genome),before);
  assert.equal(car.brain.policyExperience.samples,100);assert.equal(car.brain.policyExperience.centres.length,1);
});
test('Stopped and crawling frames do not dominate the mutation context memory',()=>{
  const s=sim(),car=s.cars[0],features=Float64Array.from({length:s.graph.learning.nodes.length},(_,i)=>Math.sin(i*.11));
  car.brain.policyFeatures=features;
  assert.equal(L.rememberActivity(car.brain,0),false);
  assert.equal(L.rememberActivity(car.brain,1.99),false);
  assert.equal(L.rememberActivity(car.brain,Number.NaN),false);
  assert.equal(car.brain.policyExperience,undefined,'stationary observations do not allocate a context cache');
  assert.equal(L.rememberActivity(car.brain,2),true,'the 2 m/s boundary is included');
  assert.equal(L.rememberActivity(car.brain,-2.1),true,'reverse motion still records a real moving context');
  assert.equal(car.brain.policyExperience.samples,2);
  assert.equal(car.brain.policyExperience.centres.length,1);
});
test('UI/readout inspections do not become training observations; only control ticks are recorded',()=>{
  const s=new F.Simulation(Legacy.tagV3(JSON.parse(JSON.stringify(data))),{modelId:'v3',population:1});
  s.tick();const car=s.cars[0],samples=car.brain.policyExperience?.samples||0;
  for(let i=0;i<40;i++)F.neuralOutputsFromBrain(s.graph,car.brain,car.genome);
  assert.equal(car.brain.policyExperience?.samples||0,samples);
  for(let i=0;i<5;i++)s.tick();assert.equal(car.brain.policyExperience?.samples||0,samples);
  car.vehicle.speedMps=2.1;
  s.tick();assert.equal(car.brain.policyExperience?.samples||0,samples+1);
});
test('Experience is bounded, transient and is not added to shareable save schemas',()=>{
  const s=sim(),car=s.cars[0],n=s.graph.learning.nodes.length;
  for(let i=0;i<150;i++){car.brain.policyFeatures=Float64Array.from({length:n},(_,j)=>Math.sin(i+j));L.rememberActivity(car.brain);}
  assert.ok(car.brain.policyExperience.centres.length<=12);
  const saved=P.capture(s);assert.equal(JSON.stringify(saved).includes('policyExperience'),false);
  const other=sim();P.restore(other,saved);assert.deepEqual(P.capture(other),saved);
  assert.ok(other.cars.every(c=>!c.brain.policyExperience));
});
test('Zero activity and disabled anatomical propagation still cannot issue bias-driven controls',()=>{
  const s=sim(),car=s.cars[0],x=context(s.graph.learning.nodes.length);
  car.genome.policyWeights=L.safeMotorMutation(s.graph,car.genome.policyWeights,F.rng(88),.35,x);
  L.rememberActivity(car.brain);assert.deepEqual(L.commands(s.graph,car.brain,car.genome),[0,0,0]);
  assert.deepEqual(F.neuralStep(s.graph,car.brain,car.genome,Array(F.SENSOR_COUNT).fill(.9),true,false),[0,0,0]);
});
