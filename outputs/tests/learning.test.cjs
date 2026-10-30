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
test('Learning can select lap progress while the historical score champion stays score-ranked',()=>{
  const sim=new F.Simulation(compact(),{population:4}),completed=sim.cars[0],crashed=sim.cars[1];
  for(const c of sim.cars){c.alive=false;c.reason='ferma / senza progresso';c.rewardState.finalized=true;c.reward=100;c.penalty=400;c.fitness=-300;c.bestProgress=100;}
  completed.laps=1;completed.bestLapTime=300;completed.reward=200;completed.penalty=30000;completed.fitness=-29800;completed.bestProgress=sim.track.total;crashed.bestProgress=500;
  for(const c of sim.cars)c.rewardBreakdown.penalties.slip=c.penalty;
  sim.evolve();assert.equal(sim.history[0].laps,0);assert.deepEqual(sim.cars[0].genome,completed.genome);assert.equal(sim.championStats.laps,0);
});
test('Safe learning selection advances physical progress before the first lap and optimizes reward afterward',()=>{
  const oneLap={fitness:12000,laps:1,bestLapTime:240,bestProgress:6000};
  const twoSlowLaps={fitness:1000,laps:2,bestLapTime:320,bestProgress:12000};
  const crashedTwoLaps={fitness:50000,laps:2,bestLapTime:180,bestProgress:12000,reason:'urto',rewardBreakdown:{penalties:{collision:900}}};
  assert.ok(F.compareLearningAgents(twoSlowLaps,oneLap)<0,'safe lap completion count must lead when policies completed different numbers of laps');
  assert.ok(F.compareLearningAgents(oneLap,crashedTwoLaps)<0,'unsafe laps must not outrank a safe policy');
  assert.ok(F.compareLearningAgents({...twoSlowLaps,fitness:12000},oneLap)<0,'lap count remains ahead of fitness');
  assert.ok(F.compareLearningAgents({fitness:-5000,laps:0,bestProgress:700},{fitness:0,laps:0,bestProgress:20})<0,'before a lap, farther safe progress must not lose to a near-start rollout on score alone');
  assert.ok(F.compareLearningAgents({fitness:500,laps:1,bestLapTime:230,bestProgress:6000},{fitness:100,laps:1,bestLapTime:240,bestProgress:6000})<0,'after equal lap counts, reward and lap pace remain authoritative');
  assert.ok(F.compareAgents(oneLap,twoSlowLaps)<0,'historical best-score ordering remains unchanged');
});
test('Unsafe optimizer feedback ranks actual collision/invalid penalties after the safe frontier',()=>{
  const safe={fitness:-5000,laps:0,bestProgress:700,reason:'troppo lenta / senza progresso'},
    invalid={fitness:-3372,laps:0,bestProgress:794,reason:'progresso non valido',rewardBreakdown:{penalties:{invalid:1200}}},
    impact={fitness:-3153,laps:0,bestProgress:792,reason:'urto',rewardBreakdown:{penalties:{collision:900}}};
  assert.ok(F.compareLearningAgents(invalid,impact)<0,'the safe-learning progress ranking still compares near-miss distance first');
  assert.ok(F.compareOptimizerAgents(safe,invalid)<0,'unsafe candidates cannot outrank a safe rollout');
  assert.ok(F.compareOptimizerAgents(impact,invalid)<0,'the more heavily penalized invalid result is the negative optimizer sample');
});
test('Optimizer is updated by ranked rollout rewards and changes trainable neural parameters',()=>{
  const sim=new F.Simulation(compact(),{population:8,mutation:.16}),before=sim.optimizer.mean.slice();
  for(const c of sim.cars){c.alive=false;c.reason='ferma / senza progresso';c.rewardState.finalized=true;c.bestProgress=(8-c.id)*30;c.reward=c.bestProgress;c.penalty=400;}
  sim.evolve();assert.equal(sim.optimizer.updates,1);assert.equal(sim.optimizer.episodes,8);assert.notDeepEqual(sim.optimizer.mean,before);assert.equal(sim.history[0].learning.warmStart,false);
  assert.ok(new Set(sim.cars.map(c=>JSON.stringify(c.genome.policyWeights))).size>=6);
});
test('ES updates use direct samples and legacy restore falls back until provenance is reestablished',()=>{
  const sim=new F.Simulation(compact(),{population:40,mutation:.16});
  assert.equal(sim.optimizerSampleIds.size,40,'cold-start policies are draws from the optimizer initial distribution');
  const finishGeneration=()=>{
    for(const c of sim.cars){c.alive=false;c.reason='ferma / senza progresso';c.rewardState.finalized=true;
      c.bestProgress=(sim.population-c.id)*30;c.reward=c.bestProgress;c.penalty=400;c.fitness=c.reward-c.penalty;}
  };
  finishGeneration();sim.evolve();
  const sampledCount=sim.optimizerSampleIds.size,episodesBefore=sim.optimizer.episodes,updatesBefore=sim.optimizer.updates;
  assert.ok(sampledCount>=4,'the next population contains the dedicated ES samples');
  assert.ok(sim.cars.every(car=>!Object.hasOwn(car.genome,'__esSample')),'provenance stays outside the serialized genome schema');
  finishGeneration();sim.evolve();
  assert.equal(sim.optimizer.episodes,episodesBefore+sampledCount,'mutants, crossovers and immigrants do not enter the ES episode count');
  assert.equal(sim.optimizer.updates,updatesBefore+1,'the sampled policies still update the distribution');
  sim.spawn(sim.cars.map(car=>F.cloneGenome(car.genome)));
  assert.equal(sim.optimizerSampleIds,null,'a restored population without serialized provenance uses the compatibility fallback');
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
  for(const c of sim.cars){c.alive=false;c.reason='ferma / senza progresso';c.rewardState.finalized=true;}
  sim.evolve();assert.equal(sim.optimizer.updates,0);assert.deepEqual(sim.cars.map(c=>JSON.stringify(c.genome.policyWeights)).sort(),before);
});
