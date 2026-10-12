'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const F=require('../simulation.js'),P=require('../progress-save.js'),Profiles=require('../model-profiles.js'),Learning=require('../neural-learning.js'),metadata=require('../data/connectome-full.json'),catalog=require('../data/circuits.json');
const bytes=fs.readFileSync(path.join(__dirname,'../data',metadata.binary)),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),types={float64:Float64Array,float32:Float32Array,int32:Int32Array,uint32:Uint32Array,uint8:Uint8Array,int8:Int8Array};
const original={...metadata,compact:true};for(const [name,d]of Object.entries(metadata.arrays))original[name]=new types[d.dtype](buffer,d.offset,d.length);
const v5=options=>new F.Simulation(Profiles.buildV5(original),{population:4,circuits:catalog,...options});
test('V5 reuses verified real anatomy without modifying V4 or inventing neurons/edges',()=>{
  const before=JSON.stringify(metadata),extended=Profiles.buildV5(original);
  assert.equal(extended.nodeCount,166700);assert.equal(extended.edgeCount,6242118);assert.equal(extended.binarySha256,metadata.binarySha256);
  for(const key of ['bodyIds','targets','weights','coreMask','rowOffsets','positions'])assert.equal(extended[key],original[key]);
  assert.equal(JSON.stringify(metadata),before);assert.equal(metadata.solver.activeNeuronBudget,8192);assert.equal(extended.solver.activeNeuronBudget,32768);
  extended.solver.activeNeuronBudget=1;assert.equal(metadata.solver.activeNeuronBudget,8192);assert.equal(Profiles.V5.solver.activeNeuronBudget,32768);
  assert.throws(()=>Profiles.buildV5({...original,nodeCount:166701}),/verificato/);
});
test('V5 actually reads 128 reachable descending neurons including 64 beyond the V4 core',()=>{
  const old=F.compileGraph(original),baseline=F.ensureLearning(old),sim=v5({population:1}),g=sim.graph,p=g.learning;
  assert.equal(p.version,5);assert.equal(p.length,346);assert.equal(p.gainGroups,32);assert.equal(p.nodes.length,128);assert.equal(new Set(p.nodes).size,128);
  assert.deepEqual(p.nodes.subarray(0,64),baseline.nodes);assert.equal(Array.from(p.nodes).filter(i=>!g.coreMask[i]).length,64);
  for(const node of p.nodes){assert.equal(g.classNames[g.classCodes[node]],'descending_neuron');assert.ok(!g.inputs.includes(node));assert.equal(g.outputMask[node],1);}
  assert.equal(baseline.version,3);assert.equal(baseline.length,202);assert.equal(baseline.gainGroups,16);assert.equal(baseline.nodes.length,64);
});
test('V5 recurrent processing uses more than 8192 real cells, respects 32768 cap and produces mutually exclusive pedals',()=>{
  const sim=v5({population:1}),car=sim.cars[0],sensors=Array(F.SENSOR_COUNT).fill(.8);let commands;
  for(let n=0;n<16;n++)commands=F.neuralStep(sim.graph,car.brain,car.genome,sensors);
  assert.ok(car.brain.activeCount>8192);assert.ok(car.brain.activeCount<=32768);assert.equal(sim.graph.solver.iterationsPerControlTick,4);
  assert.equal(F.synapticGains(sim.graph,car.genome).length,32);assert.ok(car.brain.activity.every(Number.isFinite));
  assert.ok(commands.some(v=>Math.abs(v)>1e-5));assert.equal(Math.min(commands[1],commands[2]),0);
});
test('V5 has no route/sensor motor bypass; absent real recurrence means zero actions even with biases',()=>{
  const sim=v5({population:1}),car=sim.cars[0];car.genome.policyWeights[345]=.8;car.genome.policyWeights[344]=.6;
  assert.deepEqual(F.fastNeuralStep(sim.graph,car.brain,car.genome,Array(28).fill(.9)),[0,0,0]);
  // Copy weights locally: never alter the shared anatomical bundle.
  sim.graph.csrWeights=new Float32Array(sim.graph.edgeCount);
  for(let n=0;n<8;n++)assert.deepEqual(F.neuralStep(sim.graph,car.brain,car.genome,Array(28).fill(.9)),[0,0,0]);
});
test('All 32 V5 synaptic gain groups are used on existing anatomical nodes',()=>{
  const sim=v5({population:1}),g=sim.graph,genome=F.cloneGenome(sim.cars[0].genome);
  assert.equal(new Set(g.learning.groups).size,32);
  for(let j=0;j<32;j++)genome.policyWeights[56+j]=j/64;
  assert.deepEqual(Array.from(F.synapticGains(g,genome)),Array.from({length:32},(_,j)=>Math.fround(Math.exp(j/64))));
});
test('V5 rewards train 346 parameters, preserving optimizer/history and exact-version share files',async()=>{
  const sim=v5(),before=sim.optimizer.mean.slice();
  for(const car of sim.cars)car.rewardBreakdown.rewards.progress=car.reward=100*(car.id+1);
  sim.evolve();
  assert.equal(sim.optimizer.episodes,4);assert.equal(sim.optimizer.updates,1);assert.notDeepEqual(sim.optimizer.mean,before);
  assert.equal(sim.history[0].learning.version,5);assert.equal(sim.history[0].learning.parameters,346);assert.equal(sim.history[0].rewardRevision,F.Rewards.REVISION);
  const payload=P.fromSimulation(sim),file=await P.decode(await P.encode(payload,'5.0.0'),'5.0.0');
  P.validatePayload(file.payload,{graph:sim.graph,circuits:sim.circuits});const restored=v5();P.restore(restored,file.payload.workers[0].state);
  assert.equal(restored.running,false);assert.deepEqual(P.capture(restored),P.capture(sim));
  assert.equal(file.payload.graph.solver.activeNeuronBudget,32768);assert.equal(file.payload.graph.readoutNodes.length,128);
  await assert.rejects(P.decode(await P.encode(payload,'4.8.0'),'5.0.0'),/esattamente/);
  const tampered=structuredClone(payload);tampered.graph.solver.iterationsPerControlTick=2;
  assert.throws(()=>P.validatePayload(tampered,{graph:sim.graph,circuits:sim.circuits}),/incompatibili/);
});
test('V4/V5 genome, checkpoint and progress compatibility is isolated despite shared anatomy',()=>{
  const old=new F.Simulation(original,{population:4}),sim=v5(),oldCars=sim.cars;
  assert.throws(()=>sim.spawn(old.cars.map(c=>c.genome)),/incompatibili/);assert.equal(sim.cars,oldCars);
  assert.throws(()=>sim.adoptChampion(old.cars[0].genome),/incompatibile/);assert.equal(sim.externalChampion,null);
  assert.throws(()=>old.spawn(sim.cars.map(c=>c.genome)),/incompatibili/);
  const payload=P.fromSimulation(sim);assert.throws(()=>P.validatePayload(payload,{graph:old.graph,circuits:old.circuits}),/incompatibile/);
  const saved={schema:1,rewardRevision:F.Rewards.REVISION,vehicleRevision:F.Vehicle.REVISION,dataset:sim.graph.dataset,graphRevision:5,nodes:166700,edges:6242118,circuitId:'lab',circuitRevision:1,fitness:0,genome:F.cloneGenome(sim.cars[0].genome)};
  assert.equal(F.validCheckpoint(saved,sim,sim.graph.dataset),true);assert.equal(F.validCheckpoint(saved,old,old.graph.dataset),false);
  saved.genome.adapterVersion=3;assert.equal(F.validCheckpoint(saved,sim,sim.graph.dataset),false);
  assert.throws(()=>F.fastNeuralStep(sim.graph,sim.cars[0].brain,saved.genome,Array(28).fill(.8)),/incompatibile/);
  delete saved.genome.adapterVersion;delete saved.genome.policyWeights;assert.equal(F.validCheckpoint(saved,sim,sim.graph.dataset),false);
});
test('V5 engine reuses one validated binary buffer while keeping separate profiles and cached descriptors',async()=>{
  const {DesktopEngine}=require('../../desktop/engine.cjs'),engine=new DesktopEngine(path.resolve(__dirname,'..'),()=>{},()=>{});
  const extended=await engine.loadBundle('v5'),old=await engine.loadBundle('v4');
  assert.equal(extended.shared,old.shared);assert.notEqual(extended.metadata,old.metadata);
  const g5=await engine.progressGraph('v5'),g4=await engine.progressGraph('v4');
  assert.equal(g5.learning.length,346);assert.equal(g4.learning.length,202);assert.equal(g5.solver.activeNeuronBudget,32768);assert.equal(g4.solver.activeNeuronBudget,8192);
  const sim=v5(),p=P.fromSimulation(sim);await engine.validateProgress(p);p.workers[0].state.genomes[0].adapterVersion=3;await assert.rejects(engine.validateProgress(p),/Policy/);
});
