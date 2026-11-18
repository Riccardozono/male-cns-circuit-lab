'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('../model-test.js'),F=require('../simulation.js'),Legacy=require('../legacy-models.js');
const {ActuatorTrial}=require('../../desktop/actuator-training.cjs');
const source=require('../data/connectome.json');
const car=(extra={})=>({id:0,alive:true,laps:0,bestProgress:0,lapTimes:[],reason:'',...extra});
const state=(cars,generation=1)=>({cars,generation,elapsed:90,track:{pixelsPerMeter:2}});
const completed=extra=>car({alive:false,laps:2,reason:'limite 2 giri',lapTimes:[40,42],lastLapStartTime:82,...extra});
const options={population:4,mutation:.16,speedMultiplier:30,limitSeconds:0};

test('Every profile starts from the same explicit settings and seed',()=>{
  assert.deepEqual(T.MODELS,['v2','v3','v4','v5']);const s=T.settings(options);assert.equal(s.seed,7717);assert.equal(s.workerCount,1);assert.ok(Object.isFrozen(s));
});
test('Model comparison without overrides uses the fresh-session mutation default',()=>{
  assert.equal(T.settings().mutation,.32);
});
test('Invalid settings cannot silently change the comparison',()=>{
  for(const extra of [{population:3},{population:101},{population:4.5},{mutation:NaN},{mutation:.36},{speedMultiplier:31},{limitSeconds:-1},{limitSeconds:Infinity}])assert.throws(()=>T.settings({...options,...extra}));
});
test('A failed generation is counted but never treated as two-lap success',()=>{
  const trial=new T.Trial(options,100);trial.observe(state([car({alive:false,reason:'urto'}),car({alive:false,reason:'ferma / senza progresso'})]),200,F.DT);
  assert.equal(trial.status,'running');assert.equal(trial.generations,1);assert.equal(trial.hit,null);
});
test('Two different one-lap cars do not count as two laps of one car',()=>{
  const trial=new T.Trial(options,0);trial.observe(state([car({alive:false,laps:1}),car({id:1,alive:false,laps:1})]),100,F.DT);assert.equal(trial.status,'running');assert.equal(trial.maxLaps,1);
});
test('A successful car is latched before other agents finish, not declared a finished generation',()=>{
  const trial=new T.Trial(options,0);trial.observe(state([completed(),car({id:1})],8),1000,F.DT);
  assert.equal(trial.hit.generation,8);assert.equal(trial.hit.twoLapSimSeconds,82);assert.equal(trial.hit.wallToTwoLapsSeconds,1);assert.equal(trial.status,'running');assert.equal(trial.generations,0);
});
test('The successful generation ends only after all cars naturally become inactive',()=>{
  const trial=new T.Trial(options,0),s=state([completed(),car({id:1})],8);trial.observe(s,1000,F.DT);s.cars[1].alive=false;s.elapsed=91;trial.observe(s,2000,F.DT);
  assert.equal(trial.status,'completed');assert.equal(trial.generations,1);assert.equal(trial.generationSimSeconds,91);assert.equal(trial.snapshot(10000).wallSeconds,2);assert.deepEqual(trial.hit.lapTimes,[40,42]);
});
test('Diagnostic cars and fabricated incomplete lap records cannot satisfy the objective',()=>{
  for(const c of [completed({diagnosticVehicle:true}),completed({reason:'urto'}),completed({lapTimes:[40]}),completed({lapTimes:[40,NaN]}),completed({lapTimes:[40,0]})]){
    const trial=new T.Trial(options,0);trial.observe(state([c]),100,F.DT);assert.equal(trial.hit,null);assert.equal(trial.status,'running');
  }
});
test('Time and generations accumulate independently of the history retention window',()=>{
  const trial=new T.Trial(options,0);for(let i=1;i<=120;i++)trial.observe(state([car({alive:false,bestProgress:100})],i),i*100,F.DT);
  assert.equal(trial.generations,120);assert.equal(trial.bestProgressMeters,50);assert.ok(Math.abs(trial.simSeconds-120*F.DT)<1e-10);
});
test('The exact physical terminal tick is observable before automatic reset',()=>{
  const sim=new F.Simulation(Legacy.buildV2(source),{population:4,learningEnabled:false});const trial=new T.Trial(options,0);
  for(const c of sim.cars){c.alive=false;c.reason='urto';}
  let observed;sim.onTrialTick=s=>{observed=s.generation;trial.observe(s,100,F.DT);};sim.tick();
  assert.equal(observed,1);assert.equal(sim.generation,2);assert.equal(trial.generations,1);assert.equal(trial.status,'running');
});
test('Read-only trial telemetry leaves real seeded physics, rewards, policies and evolution unchanged',()=>{
  const data=Legacy.buildV2(source),a=new F.Simulation(data,{population:4,seed:7717}),b=new F.Simulation(data,{population:4,seed:7717});
  const trial=new T.Trial(options,0);b.onTrialTick=s=>trial.observe(s,0,F.DT);
  for(let i=0;i<900;i++){a.tick();b.tick();}
  for(const key of ['elapsed','generation','history','cars','bestEver','champion','championStats','optimizer'])assert.deepEqual(b[key],a[key],key);
  assert.equal(b.random(),a.random());assert.ok(trial.simSeconds>14.9);
});
test('The real-time budget censors a run, never forces evolution or invents success',()=>{
  const trial=new T.Trial({...options,limitSeconds:2},1000);assert.equal(trial.checkLimit(2999),false);assert.equal(trial.checkLimit(3000),true);assert.equal(trial.status,'limit');assert.equal(trial.generations,0);assert.equal(trial.hit,null);
});
test('A budget reached while waiting for the successful generation remains censored',()=>{
  const trial=new T.Trial({...options,limitSeconds:2},0);trial.observe(state([completed(),car({id:1})]),1000,F.DT);trial.checkLimit(2000);assert.equal(trial.status,'limit');assert.ok(trial.hit);assert.equal(trial.generations,0);
});
test('Zero budget is genuinely unlimited and a terminal snapshot remains immutable',()=>{
  const trial=new T.Trial(options,0);assert.equal(trial.checkLimit(1e12),false);trial.finish('stopped',1000);const before=trial.snapshot(1000);trial.observe(state([completed()]),2000,F.DT);trial.finish('completed',3000);assert.deepEqual(trial.snapshot(9000),before);
});
function adapter(log,modelId,result){return{async begin(){log.push('begin:'+modelId);},read(){return result;},async cancel(){log.push('cancel:'+modelId);return{status:'stopped'};},async dispose(){log.push('dispose:'+modelId);}};}
test('All models are executed sequentially with identical immutable settings',async()=>{
  const log=[],settings=[],suite=new T.Suite({options,version:'5.0.0',create:async(id,s)=>{log.push('create:'+id);settings.push(s);return adapter(log,id,{status:'completed'});}});
  const report=await suite.run();assert.deepEqual(log,T.MODELS.flatMap(id=>['create:'+id,'begin:'+id,'dispose:'+id]));assert.ok(settings.every(s=>s===suite.settings));assert.equal(report.cases.length,4);assert.equal(report.appVersion,'5.0.0');assert.equal(report.execution,'sequential-cold-start');
});
test('Budget/error results are exported honestly and one model error does not skip the rest',async()=>{
  const suite=new T.Suite({options,version:'5.0.0',create:async id=>{if(id==='v3')throw Error('GPU unavailable');return adapter([],id,{status:'limit',maxLaps:0});}});
  const r=await suite.run();assert.deepEqual(r.cases.map(c=>c.status),['limit','error','limit','limit']);assert.equal(r.cases[1].error,'GPU unavailable');assert.ok(r.finishedAt);
});
test('Stop during preparation does not begin training or run pending profiles',async()=>{
  const log=[],suite=new T.Suite({options,version:'5.0.0',create:async id=>{suite.stop();return adapter(log,id,{status:'completed'});}});
  const r=await suite.run();assert.deepEqual(log,['cancel:v2','dispose:v2']);assert.deepEqual(r.cases.map(c=>c.status),['stopped','not-run','not-run','not-run']);assert.equal(suite.active,false);
});
test('Reports are independent snapshots, not live references to test state',async()=>{
  const suite=new T.Suite({options,version:'5.0.0',create:async id=>adapter([],id,{status:'completed'})});await suite.run();const r=suite.report();r.cases[0].status='invented';assert.equal(suite.cases[0].status,'completed');
});

test('A trained V3 episode uses one car and stops on the first terminal result',()=>{
  const trial=new T.Trial({...options,trialProfile:T.IMITATION_PROFILE,circuitId:'le-mans'},0);
  assert.equal(trial.settings.circuitId,'le-mans');
  assert.throws(()=>T.settings({...options,trialProfile:T.IMITATION_PROFILE,circuitId:'lab'}));
  assert.equal(trial.settings.population,1);
  assert.equal(trial.settings.mutation,0);
  trial.observe(state([car({alive:false,reason:'urto'})]),100,F.DT);
  assert.equal(trial.status,'failed');
  assert.equal(trial.snapshot(200).error,'urto');
  assert.equal(trial.generations,1);
  trial.observe(state([completed()]),200,F.DT);
  assert.equal(trial.hit,null);
});

test('The trained V3 is reported separately from the four cold-start models',()=>{
  const suite=new T.Suite({options:{...options,trialProfile:T.IMITATION_PROFILE},version:'5.7.0'});
  assert.deepEqual(suite.cases.map(item=>item.modelId),['v3']);
  assert.equal(suite.report().execution,'pretrained-v3-trial');
  assert.equal(suite.report().settings.trialProfile,T.IMITATION_PROFILE);
});

test('Reward refinement is restricted to a trained V3 with a fixed test population',()=>{
  const suite=new T.Suite({options:{...options,population:100,trialProfile:T.IMITATION_PROFILE,refineActuators:true}});
  assert.deepEqual(suite.cases.map(item=>item.modelId),['v3']);
  assert.equal(suite.settings.population,T.REFINEMENT_POPULATION);
  assert.equal(suite.report().execution,'pretrained-v3-reward-refinement');
  assert.equal(T.settings({...options,refineActuators:true}).refineActuators,undefined);
});

test('Reward refinement advances a safe elite and rejects unsafe finalists',()=>{
  const genome={};
  const bundle={genome,actor:{featureLayout:{descending:0,inputGroupMeans:0,adjacentDifference:0},layers:[]}};
  const collision={rewardBreakdown:{penalties:{collision:1}}};
  const sim={
    ...state([completed({fitness:100}),completed({id:1,fitness:110}),completed({id:2,fitness:999,...collision})]),
    graph:{inputs:[],learning:{nodes:[]}},
    spawn(genomes){
      assert.deepEqual(genomes,Array(T.REFINEMENT_POPULATION).fill(genome));
      this.cars=genomes.map((_,id)=>car({id}));
    },
  };
  const trial=new ActuatorTrial({...options,trialProfile:T.IMITATION_PROFILE,refineActuators:true},0,bundle,sim);
  trial.observe(sim,1000,F.DT);
  const first=trial.snapshot(1000).rewardTraining.rounds[0];
  assert.equal(first.selected,1);
  assert.equal(first.candidates[2].completed,false);
  assert.deepEqual(trial.parameters[0],first.candidates[1].parameters);
  assert.equal(sim.generation,2);
  assert.ok(sim.cars.every(candidate=>candidate.previousGenerationLapTime===40));
  sim.cars=sim.cars.map(candidate=>completed({id:candidate.id,fitness:999,...collision}));
  trial.observe(sim,2000,F.DT);
  assert.equal(trial.status,'failed');
  assert.equal(trial.snapshot(2000).rewardTraining.selected,null);
  assert.equal(trial.hit,null);
});
