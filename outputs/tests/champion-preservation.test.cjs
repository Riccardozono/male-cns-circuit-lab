'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../simulation.js'),P=require('../progress-save.js'),Legacy=require('../legacy-models.js'),data=require('../data/connectome.json');
const {DesktopEngine}=require('../../desktop/engine.cjs');

test('Same-generation reports from a restored worker cannot rebroadcast a champion',()=>{
  const engine=new DesktopEngine('',()=>{},()=>{}),messages=[];
  engine.options={running:true};engine.seenGenerations=[80,65];engine.workers=[{postMessage:m=>messages.push(m)},{postMessage:m=>messages.push(m)}];
  const champion={marker:'genome'},state={generation:80,bestEver:100,champion,championStats:{fitness:100}};
  engine.considerChampion(0,state);assert.equal(engine.globalChampion,null);assert.deepEqual(messages,[]);
  engine.considerChampion(0,{...state,generation:81});
  assert.deepEqual(engine.globalChampion,champion);assert.equal(messages.filter(m=>m.type==='adoptChampion').length,2,
    'only a generation newer than the restored checkpoint may update the record');
});

test('A restored global champion is provisional until a fresh worker result replaces it',async()=>{
  const engine=new DesktopEngine('',()=>{},()=>{}),messages=[];
  engine.validateProgress=async()=>{};
  engine.start=async()=>{
    engine.options={running:false};engine.seenGenerations=[64];
    engine.workers=[{postMessage:m=>messages.push(m)}];
    return engine.info();
  };
  const savedGenome={policyWeights:[1]},freshGenome={policyWeights:[2]};
  await engine.restoreProgress({
    modelId:'v3',circuitId:'monza',workers:[{index:0,state:{generation:64,population:40,mutation:.32,speedMultiplier:1,circuitId:'monza'}}],
    globalChampion:{genome:savedGenome,stats:{fitness:1000,bestProgress:795.68,laps:0,bestLapTime:null},workerIndex:1}
  });
  assert.equal(engine.globalChampionNeedsRevalidation,true);
  engine.considerChampion(0,{generation:64,bestEver:5,champion:{policyWeights:[9]},championStats:{fitness:5,bestProgress:900,laps:0}});
  assert.deepEqual(engine.globalChampion,savedGenome,'the saved generation report is not a fresh result');
  engine.options.running=true;
  engine.considerChampion(0,{generation:65,bestEver:-20,champion:freshGenome,championStats:{fitness:-20,bestProgress:732.7,laps:0}});
  assert.deepEqual(engine.globalChampion,freshGenome,'the first genuinely fresh result replaces the unverified save even with lower progress and fitness');
  assert.equal(engine.globalChampionNeedsRevalidation,false);
  assert.equal(messages.filter(m=>m.type==='adoptChampion').length,1);
});

test('Verified learned champions rank by no-lap progress while legacy champions retain fitness ranking',()=>{
  const engine=new DesktopEngine('',()=>{},()=>{}),messages=[];
  engine.options={running:true};engine.seenGenerations=[0];engine.workers=[{postMessage:m=>messages.push(m)}];
  engine.globalChampion={policyWeights:[1]};
  engine.globalChampionStats={fitness:100,bestProgress:300,laps:0};
  engine.considerChampion(0,{generation:1,bestEver:90,champion:{policyWeights:[2]},championStats:{fitness:90,bestProgress:400,laps:0}});
  assert.deepEqual(engine.globalChampion,{policyWeights:[2]},'higher safe no-lap progress wins despite lower fitness');

  engine.seenGenerations[0]=1;engine.globalChampion={marker:'legacy'};
  engine.globalChampionStats={fitness:100,bestProgress:300,laps:0};
  engine.considerChampion(0,{generation:2,bestEver:90,champion:{marker:'legacy-candidate'},championStats:{fitness:90,bestProgress:400,laps:0}});
  assert.deepEqual(engine.globalChampion,{marker:'legacy'},'legacy policies retain the historical fitness objective');
});

test('Resuming a restored global champion broadcasts it to the workers',async()=>{
  const engine=new DesktopEngine('',()=>{},()=>{}),messages=[];
  engine.options={running:false};engine.workers=[{postMessage:m=>messages.push(m)},{postMessage:m=>messages.push(m)}];
  engine.globalChampion={marker:'genome'};
  await engine.command({type:'pause',value:true});
  assert.deepEqual(messages.map(m=>m.type),['pause','pause','adoptChampion','adoptChampion']);
  assert.equal(engine.options.running,true);
});

test('A new shared champion waits for the previously saved champion to be evaluated',()=>{
  const make=()=>new F.Simulation(Legacy.buildV2(data),{population:4,seed:7717});
  const sim=make(),first=F.cloneGenome(sim.cars[1].genome),second=F.cloneGenome(sim.cars[2].genome);
  assert.notDeepEqual(first,second);
  sim.adoptChampion(first);sim.adoptChampion(second);
  assert.deepEqual(sim.externalChampion,first);assert.deepEqual(sim.pendingExternalChampion,second);
  const saved=P.capture(sim);assert.deepEqual(saved.externalChampion,first);
  assert.equal(JSON.stringify(saved).includes('pendingExternalChampion'),false,'transient queue must not change the save schema');
  const restored=make();P.restore(restored,saved);assert.equal(restored.pendingExternalChampion,null);
  restored.adoptChampion(second);restored.evolve();
  assert.ok(restored.cars.some(car=>JSON.stringify(car.genome)===JSON.stringify(first)),'first champion must reach the next population');
  assert.deepEqual(restored.externalChampion,second,'the latest shared champion is queued for the following generation');
  assert.equal(restored.pendingExternalChampion,null);
  restored.evolve();assert.ok(restored.cars.some(car=>JSON.stringify(car.genome)===JSON.stringify(second)),'second champion must also reach a population');
});
