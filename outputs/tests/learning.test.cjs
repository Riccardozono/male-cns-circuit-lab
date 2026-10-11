'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../simulation.js'),data=require('../data/connectome.json'),catalog=require('../data/circuits.json'),Legacy=require('../legacy-models.js'),Learning=require('../neural-learning.js');
const compact=()=>Legacy.buildV2(data);
test('Policy readout uses real descending neurons, not sensor reconstruction or a driving calibration',()=>{
  for(const model of [compact(),Legacy.tagV3(data)]){
    const sim=new F.Simulation(model,{population:1}),p=sim.graph.learning,inputs=new Set(sim.graph.inputs);
    assert.equal(p.version,3);assert.equal(p.trainingSamples,0);assert.equal(p.nodes.length,64);assert.equal(p.length,202);
    for(const node of p.nodes){assert.equal(inputs.has(node),false);assert.equal(sim.graph.classNames[sim.graph.classCodes[node]],'descending_neuron');}
    assert.equal('fastMotor' in sim.cars[0].genome,false);assert.equal('weights' in p,false);
  }
});
test('Motor decoder has no raw sensor bypass: zero recurrent state means zero actions',()=>{
  const sim=new F.Simulation(compact(),{population:1}),car=sim.cars[0],sensors=Array(F.SENSOR_COUNT).fill(.9);
  car.genome.policyWeights[car.genome.policyWeights.length-2]=.7;car.genome.policyWeights[car.genome.policyWeights.length-1]=.8;
  assert.deepEqual(F.fastNeuralStep(sim.graph,car.brain,car.genome,sensors),[0,0,0]);
  sensors[18]=-.9;sensors[19]=1;
  assert.deepEqual(F.fastNeuralStep(sim.graph,car.brain,car.genome,sensors),[0,0,0]);
  const index=sim.graph.learning.nodes[0];car.brain.activity[index]=.3;
  assert.ok(F.fastNeuralStep(sim.graph,car.brain,car.genome,sensors)[1]>0);
  assert.deepEqual(F.fastNeuralStep(sim.graph,car.brain,car.genome,sensors,false),[0,0,0]);
  assert.deepEqual(F.fastNeuralStep(sim.graph,car.brain,car.genome,sensors,true,false),[0,0,0]);
});
test('Deleting anatomical connections eliminates cold-start policy actions despite action biases',()=>{
  const sim=new F.Simulation(compact(),{population:1}),car=sim.cars[0],sensors=Array(F.SENSOR_COUNT).fill(.8);
  car.genome.policyWeights[car.genome.policyWeights.length-1]=.5;
  sim.graph.weights.fill(0);sim.graph.csrWeights.fill(0);
  for(let n=0;n<20;n++)assert.deepEqual(F.neuralStep(sim.graph,car.brain,car.genome,sensors),[0,0,0]);
});
test('Learned synaptic gains change recurrent activity without adding or replacing edges',()=>{
  const sim=new F.Simulation(compact(),{population:1}),graph=sim.graph,a=F.makeBrain(graph),b=F.makeBrain(graph),ga=F.cloneGenome(sim.cars[0].genome),gb=F.cloneGenome(ga),sensors=Array(F.SENSOR_COUNT).fill(.75),edges=graph.targets.slice();
  for(let g=0;g<16;g++)gb.policyWeights[F.SENSOR_COUNT*2+g]=.6;
  for(let n=0;n<16;n++){F.neuralStep(graph,a,ga,sensors);F.neuralStep(graph,b,gb,sensors);}
  assert.ok(a.activity.some((value,i)=>Math.abs(value-b.activity[i])>.001));
  assert.deepEqual(graph.targets,edges);
});
test('Identical sensory history yields identical actions regardless of circuit coordinates',()=>{
  const a=new F.Simulation(compact(),{population:1,circuits:catalog,circuitId:'monza'}),b=new F.Simulation(compact(),{population:1,circuits:catalog,circuitId:'le-mans'}),sensors=Array(F.SENSOR_COUNT).fill(.4);
  b.cars[0].x=900000;b.cars[0].y=-600000;b.cars[0].progress=5000;
  for(let n=0;n<16;n++)assert.deepEqual(F.neuralStep(a.graph,a.cars[0].brain,a.cars[0].genome,sensors),F.neuralStep(b.graph,b.cars[0].brain,b.cars[0].genome,sensors));
});
test('A badly scored lap cannot bypass the real reward objective during evolution',()=>{
  const sim=new F.Simulation(compact(),{population:4}),completed=sim.cars[0],crashed=sim.cars[1];
  for(const c of sim.cars){c.alive=false;c.reward=100;c.penalty=400;c.fitness=-300;c.bestProgress=100;}
  completed.laps=1;completed.bestLapTime=300;completed.reward=200;completed.penalty=30000;completed.fitness=-29800;completed.bestProgress=sim.track.total;crashed.bestProgress=500;
  for(const c of sim.cars)c.rewardBreakdown.penalties.slip=c.penalty;
  sim.evolve();assert.equal(sim.history[0].laps,0);assert.notDeepEqual(sim.cars[0].genome,completed.genome);assert.equal(sim.championStats.laps,0);
});
test('Optimizer is updated by ranked rollout rewards and changes trainable neural parameters',()=>{
  const sim=new F.Simulation(compact(),{population:8,mutation:.16}),before=sim.optimizer.mean.slice();
  for(const c of sim.cars){c.alive=false;c.bestProgress=(8-c.id)*30;c.reward=c.bestProgress;c.penalty=400;}
  sim.evolve();assert.equal(sim.optimizer.updates,1);assert.equal(sim.optimizer.episodes,8);assert.notDeepEqual(sim.optimizer.mean,before);assert.equal(sim.history[0].learning.warmStart,false);
  assert.ok(new Set(sim.cars.map(c=>JSON.stringify(c.genome.policyWeights))).size>=6);
});
test('RL checkpoints retain policy tensors; assisted 4.3 policies are explicitly rejected',()=>{
  const sim=new F.Simulation(compact(),{population:4}),g=sim.cars[0].genome,copy=F.cloneGenome(g);
  assert.deepEqual(copy.policyWeights,g.policyWeights);assert.notEqual(copy.policyWeights,g.policyWeights);
  const saved={schema:1,rewardRevision:F.Rewards.REVISION,vehicleRevision:F.Vehicle.REVISION,dataset:sim.graph.dataset,graphRevision:sim.graph.revision,nodes:sim.graph.n,edges:sim.graph.edgeCount,circuitId:sim.circuitId,circuitRevision:1,fitness:0,genome:copy};
  assert.equal(F.validCheckpoint(saved,sim,sim.graph.dataset),true);
  assert.equal(F.validCheckpoint({...saved,rewardRevision:undefined},sim,sim.graph.dataset),false);
  assert.equal(F.validCheckpoint({...saved,genome:{...copy,policyWeights:[NaN]}},sim,sim.graph.dataset),false);
  const assisted={...copy,adapterVersion:1,fastMotor:[4.2,2.5,8,26,.18,18,0,0]};
  assert.equal(F.validCheckpoint({...saved,genome:assisted},sim,sim.graph.dataset),false);
  assert.throws(()=>sim.spawn([assisted]),/assistito 4.3/);
  const oldCars=sim.cars,oldMean=sim.optimizer.mean.slice();
  assert.throws(()=>sim.spawn([{...copy,policyWeights:[0]}],true),/Dimensioni/);
  assert.throws(()=>sim.spawn([{...copy,adapterVersion:999}]),/incompatibile/);
  assert.throws(()=>sim.spawn([]),/Popolazione/);
  assert.equal(sim.cars,oldCars);assert.deepEqual(sim.optimizer.mean,oldMean);
  sim.spawn([copy],true);assert.deepEqual(sim.optimizer.mean,copy.policyWeights);
});
test('Zero mutation disables optimizer updates and does not invent learned parameters',()=>{
  const sim=new F.Simulation(compact(),{population:4,mutation:0}),before=sim.cars.map(c=>JSON.stringify(c.genome.policyWeights)).sort();
  sim.evolve();assert.equal(sim.optimizer.updates,0);assert.deepEqual(sim.cars.map(c=>JSON.stringify(c.genome.policyWeights)).sort(),before);
});
