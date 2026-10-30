'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../rewards.js'),F=require('../simulation.js'),P=require('../progress-save.js'),Legacy=require('../legacy-models.js'),data=require('../data/connectome.json'),catalog=require('../data/circuits.json');
const {fixture}=require('./fixtures/reward-rollout.cjs');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),sum=o=>Object.values(o).reduce((a,b)=>a+b,0);

test('Only new high-water road earns dense progress; reverse/retrace cannot farm rewards',()=>{
  const f=fixture();f.move(100,4);const before=f.car.reward;f.move(-50,2);f.move(50,2);
  near(f.car.reward,before);near(f.car.bestProgress,100);assert.ok(f.car.rewardBreakdown.penalties.reverse>0);assert.ok(f.car.fitness<before);
});
test('Progress reward is dense before the first checkpoint, with no speed/survival bonus',()=>{
  const a=fixture(),b=fixture();a.move(2,.2);b.move(0,.2);assert.ok(a.car.reward>0);assert.equal(a.car.rewardBreakdown.rewards.checkpoints,0);assert.equal(b.car.reward,0);assert.ok(b.car.fitness<0);
});
test('Finish line at spawn, a reverse crossing and a partial lap cannot earn a lap',()=>{
  const f=fixture();f.move(-5,1);f.move(5,1);f.move(600,24);assert.equal(f.car.laps,0);assert.equal(f.car.rewardBreakdown.rewards.lap,0);assert.equal(f.car.rewardState.nextCheckpoint,20);
});
test('All 32 ordered gates and a continuous finish crossing are needed for a timed lap',()=>{
  const f=fixture();f.move(999,39.96);assert.equal(f.car.laps,0);assert.equal(f.car.rewardState.nextCheckpoint,32);f.move(1,.04);
  assert.equal(f.car.laps,1);near(f.car.lastLapTime,40);near(f.car.rewardBreakdown.rewards.progress,5000);near(f.car.rewardBreakdown.rewards.checkpoints,500);near(f.car.rewardBreakdown.rewards.lap,8000);
});
test('Two actual ordered laps terminate the episode; later steps cannot create more points',()=>{
  const f=fixture();f.move(2000,80);assert.equal(f.car.laps,2);assert.equal(f.car.alive,false);assert.equal(f.car.reason,'limite 2 giri');assert.equal(f.car.lapTimes.length,2);near(f.car.rewardBreakdown.rewards.checkpoints,1000);
  const before=JSON.stringify(f.car);f.move(2000,80);assert.equal(JSON.stringify(f.car),before);
});
test('Teleport and projection jumps do not produce progress, gates or lap rewards',()=>{
  const f=fixture();for(let i=0;i<3;i++){f.car.x+=100;f.car.lifetime+=1/60;R.step(f.track,f.car,{along:500,dt:1/60});}
  assert.equal(f.car.bestProgress,0);assert.equal(f.car.reward,0);assert.equal(f.car.laps,0);assert.equal(f.car.reason,'progresso non valido');assert.equal(f.car.rewardBreakdown.penalties.invalid,1200);
});
test('Changing to a nearby hairpin segment without corresponding motion is rejected',()=>{
  const f=fixture();f.car.x=.01;f.car.lifetime=1/60;R.step(f.track,f.car,{along:400,dt:1/60});assert.equal(f.car.reward,0);assert.equal(f.car.rewardState.along,0);assert.equal(f.car.lastAlong,0);
});
test('A rejected chainage projection does not poison the next physically continuous step',()=>{
  const f=fixture();f.car.x=.01;f.car.lifetime=1/60;R.step(f.track,f.car,{along:400,dt:1/60});
  assert.equal(f.car.reward,0);assert.equal(f.car.rewardState.invalidSteps,1);assert.equal(f.car.rewardState.along,0);
  f.car.x=.11;f.car.lifetime+=1/60;f.car.vehicle.speedMps=.1;R.step(f.track,f.car,{along:400.1,dt:1/60});
  assert.equal(f.car.alive,true);assert.equal(f.car.reason,'');assert.equal(f.car.rewardState.invalidSteps,0);near(f.car.bestProgress,.1);near(f.car.reward,.5);
});
test('A single bad projection can recover without new fake progress',()=>{
  const f=fixture();f.car.lifetime=1/60;R.step(f.track,f.car,{along:500,dt:1/60});f.move(1,.1);assert.equal(f.car.rewardState.invalidSteps,0);assert.ok(f.car.bestProgress>0&&f.car.bestProgress<1);assert.equal(f.car.alive,true);
});
test('Collision and off-road steps cannot earn even a last-moment finish bonus',()=>{
  for(const extra of [{collision:true},{onRoad:false}]){const f=fixture();f.move(999,39.96);f.move(1,.04,extra);assert.equal(f.car.laps,0);assert.ok(f.car.noLapPenalty>=2000);assert.equal(f.car.rewardBreakdown.rewards.lap,0);}
});
test('Terminal failure/no-lap costs apply immediately and exactly once',()=>{
  const f=fixture();f.move(0,9);assert.equal(f.car.reason,'ferma / senza progresso');assert.equal(f.car.noLapPenalty,3000);assert.equal(f.car.rewardBreakdown.penalties.stall,1400);
  const total=f.car.penalty;for(let i=0;i<10;i++)f.end();near(f.car.penalty,total);near(f.car.fitness,f.car.reward-f.car.penalty);
});
test('Missing-lap cost is strict but graded by genuine progress, not manually assigned bestProgress',()=>{
  const a=fixture(),b=fixture(),c=fixture();a.end();b.move(900,36);b.end();c.car.bestProgress=999;c.end();near(a.car.noLapPenalty,3000);near(b.car.noLapPenalty,2100);near(c.car.noLapPenalty,3000);
});
test('The new reward charges a proportional penalty for an unfinished second lap while older revisions remain unchanged',()=>{
  const justOne=fixture();justOne.move(1000,40);justOne.end();near(justOne.car.noLapPenalty,R.RULES.missingLapPenalty);assert.equal(justOne.car.noLapPenaltyApplied,true);
  const halfway=fixture();halfway.move(1500,60);halfway.end();near(halfway.car.noLapPenalty,R.RULES.missingLapPenalty*.5);
  const almost=fixture();almost.move(1900,76);almost.end();near(almost.car.noLapPenalty,R.RULES.missingLapPenalty*.1);
  const completed=fixture();completed.move(2000,80);assert.equal(completed.car.laps,2);assert.equal(completed.car.noLapPenalty,0);
  const progress6=fixture();progress6.car.rewardRevision=R.MISSING_LAP_REVISION;progress6.move(1000,40);progress6.end();near(progress6.car.noLapPenalty,R.RULES.missingLapPenalty);
  const savedRules=fixture();savedRules.car.rewardRevision=R.BRAKE_LOCK_REVISION;savedRules.move(1000,40);savedRules.end();assert.equal(savedRules.car.noLapPenalty,0);
  assert.ok(F.compareAgents(savedRules.car,justOne.car)<0,'the added missing-lap penalty participates in actual agent ranking');
  for(const car of [justOne.car,halfway.car,almost.car])near(car.fitness,car.reward-car.penalty);
});
test('A crawling agent is stopped by recent ineffective pace, not a global episode time cap',()=>{
  const slow=fixture();slow.move(40,100);assert.equal(slow.car.reason,'troppo lenta / senza progresso');assert.ok(slow.car.rewardBreakdown.penalties.slowProgress>0);assert.ok(slow.car.lifetime<25);
  const long=fixture({total:10000,referenceMps:25});long.move(2000,100);assert.equal(long.car.alive,true);assert.ok(long.car.lifetime>99);assert.equal(long.car.rewardBreakdown.penalties.slowProgress,0);
});
test('A slow-window penalty does not prematurely stop a clearly recovering car in the new revision',()=>{
  for(const ppm of [1,10]){
    const f=fixture({ppm});f.move(1.4,7);f.move(3.2,8);f.move(6,1.5);
    assert.equal(f.car.alive,true);assert.equal(f.car.rewardBreakdown.penalties.slowProgress,1400);
    assert.equal(f.car.noLapPenaltyApplied,undefined);assert.ok(f.car.bestProgress>8*ppm);
    f.move(0,9);assert.ok(['ferma / senza progresso','troppo lenta / senza progresso'].includes(f.car.reason));
    assert.ok(f.car.rewardBreakdown.penalties.stall===1400||f.car.rewardBreakdown.penalties.slowProgress===2800);
    assert.ok(f.car.noLapPenalty>=2000);
    const penalty=f.car.penalty;f.end();near(f.car.penalty,penalty);
  }
});
test('The current pace rule stops a borderline crawler while progress-7 retains its former recovery threshold',()=>{
  for(const ppm of [1,10]){
    const current=fixture({ppm});current.move(1.4,7);current.move(3.2,8);current.move(3,1.5);
    assert.equal(current.car.reason,'troppo lenta / senza progresso');assert.equal(current.car.rewardBreakdown.penalties.slowProgress,1400);
    const historical=fixture({ppm});historical.car.rewardRevision=R.PREVIOUS_PACE_REVISION;historical.move(1.4,7);historical.move(3.2,8);historical.move(3,1.5);
    assert.equal(historical.car.alive,true);assert.equal(historical.car.rewardBreakdown.penalties.slowProgress,1400);
  }
});
test('Historical reward revisions retain their original slow-stop behavior',()=>{
  for(const revision of [R.LEGACY_REVISION,R.PREVIOUS_REVISION,R.BRAKE_LOCK_REVISION,R.MISSING_LAP_REVISION]){
    const f=fixture();f.car.rewardRevision=revision;f.move(1.4,7);f.move(3.2,8);f.move(4.5,1.5);
    assert.equal(f.car.reason,'troppo lenta / senza progresso',revision);
    assert.equal(f.car.rewardBreakdown.penalties.slowProgress,1400);assert.ok(f.car.noLapPenalty>=2000);
  }
});
test('Backward motion does not defer a slow stop and a collision still terminates',()=>{
  const reverse=fixture();reverse.move(1.4,7);reverse.move(3.2,8);reverse.move(-4.5,1.5);
  assert.equal(reverse.car.reason,'troppo lenta / senza progresso');assert.equal(reverse.car.rewardBreakdown.penalties.slowProgress,1400);
  const crash=fixture();crash.move(1.4,7);crash.move(3.2,8);crash.move(4.5,1.5,{collision:true});
  assert.equal(crash.car.reason,'urto');assert.ok(crash.car.rewardBreakdown.penalties.collision>=900);
});
test('New reward progressively penalizes a learned brake lock after real motion, grace, and near-zero progress',()=>{
  const f=fixture();f.car.outputs=[0,0,.8];f.move(25,1);f.move(0,1.5);near(f.car.rewardBreakdown.penalties.stall,0);
  f.move(0,2);assert.ok(f.car.rewardBreakdown.penalties.stall>0);assert.equal(f.car.alive,true);
  const charged=f.car.rewardBreakdown.penalties.stall;f.car.outputs=[0,0,0];f.move(0,1);near(f.car.rewardBreakdown.penalties.stall,charged);near(f.car.rewardState.brakeLockSeconds,0);
});
test('New reward detects a light brake held at a standstill after the grace period',()=>{
  const f=fixture();f.car.outputs=[0,0,.08];f.move(25,1);f.move(0,1.5);near(f.car.rewardBreakdown.penalties.stall,0);
  f.move(0,2);assert.ok(f.car.rewardBreakdown.penalties.stall>0,'a persistent 8% brake command while stopped is costly');
  const savedR5=fixture();savedR5.car.rewardRevision=R.BRAKE_LOCK_REVISION;savedR5.car.outputs=[0,0,.08];savedR5.move(25,1);savedR5.move(0,1.5);savedR5.move(0,2);
  assert.ok(savedR5.car.rewardBreakdown.penalties.stall>0,'the prior brake-lock rule remains active in progress-5 saves');
});
test('Ordinary corner braking and historical progress-3/progress-4 rewards keep their original scoring',()=>{
  const corner=fixture();corner.car.outputs=[0,0,1];corner.move(30,2);near(corner.car.rewardBreakdown.penalties.stall,0);
  for(const revision of [R.LEGACY_REVISION,R.PREVIOUS_REVISION]){const old=fixture();old.car.rewardRevision=revision;old.car.outputs=[0,0,.08];old.move(25,1);old.move(0,5);near(old.car.rewardBreakdown.penalties.stall,0);}
});
test('Waiting/moving slowly is worse than early useful motion; an early crash is not a clean lap',()=>{
  const stopped=fixture(),crashed=fixture(),lap=fixture();stopped.move(0,9);crashed.move(100,4);crashed.move(1,.04,{collision:true});lap.move(1000,40);lap.end();
  assert.ok(crashed.car.fitness>stopped.car.fitness);assert.ok(lap.car.fitness>crashed.car.fitness);assert.ok(F.compareAgents(lap.car,crashed.car)<0);
});
test('Faster laps improve score; slow-lap costs are relative and bounded, never an unlimited bonus',()=>{
  const fast=fixture(),normal=fixture(),slow=fixture(),verySlow=fixture();fast.move(1000,25);normal.move(1000,40);slow.move(1000,80);verySlow.move(1000,160);
  assert.ok(fast.car.fitness>normal.car.fitness&&normal.car.fitness>slow.car.fitness&&slow.car.fitness>verySlow.car.fitness);
  near(slow.car.rewardBreakdown.penalties.slowLap,4000);near(verySlow.car.rewardBreakdown.penalties.slowLap,8000);assert.ok(fast.car.rewardBreakdown.rewards.pace<=2000);
});
test('Every slow lap is compared to the last-generation lap, including a slow second lap',()=>{
  const f=fixture({previousLap:40});f.move(1000,40);f.move(1000,60);near(f.car.lapRegressionPenalty,2000);near(f.car.lapRegression,20);near(f.car.baseFitness-f.car.fitness,2000);
  const total=f.car.penalty;R.comparisonPenalty(f.car);near(f.car.penalty,total);R.comparisonPenalty(f.car,20);near(f.car.lapRegressionPenalty,6000);R.comparisonPenalty(f.car,40);near(f.car.penalty,total);
});
test('Slower-generation penalty affects actual rank, not merely the UI',()=>{
  const a=fixture({previousLap:40}),b=fixture({previousLap:40});a.move(1000,60);b.move(1000,40);a.end();b.end();assert.ok(F.compareAgents(b.car,a.car)<0);assert.ok(a.car.lapRegressionPenalty>0);
});
test('Historical records exclude only the changing comparison cost and retain all intrinsic failures',()=>{
  const a=fixture({previousLap:30});a.move(1000,40);a.end();const before=R.recordStats(a.car);R.comparisonPenalty(a.car,20);assert.deepEqual(R.recordStats(a.car),before);
  const crashed=fixture();crashed.move(100,4);crashed.move(1,.04,{collision:true});near(R.recordStats(crashed.car).fitness,crashed.car.fitness);assert.ok(crashed.car.rewardBreakdown.penalties.collision>0);
});
test('Relative progress and pace have the same weight on short/long tracks and coordinate scales',()=>{
  const a=fixture(),b=fixture({total:3000,referenceMps:75}),c=fixture({ppm:2.5});a.move(1000,40);b.move(3000,40);c.move(1000,40);
  for(const x of [b.car,c.car]){near(a.car.reward,x.reward);near(a.car.penalty,x.penalty);near(a.car.fitness,x.fitness);}
});
test('Time/reverse/risk/slip costs use simulated seconds, not render frames',()=>{
  const a=fixture(),b=fixture();a.car.slipAngle=b.car.slipAngle=.5;a.move(30,1,{forwardClearance:1});for(let i=0;i<10;i++)b.move(3,.1,{forwardClearance:1});near(a.car.fitness,b.car.fitness);assert.ok(a.car.rewardBreakdown.penalties.slip>0);assert.ok(a.car.rewardBreakdown.penalties.risk>0);
});
test('G forces and valid braking are not automatically punished',()=>{
  const f=fixture();f.car.totalG=3;f.car.longitudinalG=-2;f.car.outputs=[.8,0,1];f.move(10,1);assert.equal(f.car.rewardBreakdown.penalties.slip,0);assert.equal(f.car.rewardBreakdown.penalties.risk,0);
});
test('High-speed impacts are penalized more, with bounded severity',()=>{
  const a=fixture(),b=fixture();a.move(.1,.1,{collision:true});b.move(1,1/100,{collision:true});assert.ok(b.car.rewardBreakdown.penalties.collision>a.car.rewardBreakdown.penalties.collision);assert.ok(b.car.rewardBreakdown.penalties.collision<=1800);
});
test('All category totals exactly reconcile to selection score and stable score',()=>{
  const f=fixture({previousLap:20});f.move(1000,40);f.move(1,.04,{collision:true});near(sum(f.car.rewardBreakdown.rewards),f.car.reward);near(sum(f.car.rewardBreakdown.penalties),f.car.penalty);near(f.car.fitness,f.car.reward-f.car.penalty);near(f.car.baseFitness,f.car.fitness+f.car.lapRegressionPenalty);
});
test('Fitness outranks artificial laps/progress overrides and non-finite scores',()=>{
  const valid={fitness:100,laps:0,bestProgress:200},bad={fitness:-10000,laps:2,bestLapTime:1,bestProgress:20000};assert.ok(F.compareAgents(valid,bad)<0);assert.ok(F.compareAgents(valid,{fitness:NaN,laps:2})<0);assert.equal(F.compareAgents({fitness:NaN},{fitness:Infinity}),0);
});
test('1x/30x neural rollouts have identical rewards, ledger, physics and history',()=>{
  const opts={population:4,seed:8871,circuits:catalog,circuitId:'monza'},a=new F.Simulation(Legacy.buildV2(data),opts),b=new F.Simulation(Legacy.buildV2(data),opts);b.speedMultiplier=30;
  for(let i=0;i<600;i++)a.advance(1/60);for(let i=0;i<20;i++)b.advance(1/60);
  assert.deepEqual(a.history,b.history);assert.deepEqual(a.cars,b.cars);assert.deepEqual(a.optimizer,b.optimizer);
});
test('Changing reward observers cannot change identical sensor-to-brain motor outputs',()=>{
  const s=new F.Simulation(Legacy.buildV2(data),{population:2}),a=s.cars[0],b=s.cars[1];b.genome=F.cloneGenome(a.genome);a.reward=99999;a.fitness=-99999;a.laps=2;a.bestProgress=100000;
  for(let i=0;i<10;i++)assert.deepEqual(F.neuralStep(s.graph,a.brain,a.genome,Array(F.SENSOR_COUNT).fill(.5)),F.neuralStep(s.graph,b.brain,b.genome,Array(F.SENSOR_COUNT).fill(.5)));
});
test('Manual interrupted generations are finalized, penalized and update optimizer once',()=>{
  const s=new F.Simulation(Legacy.buildV2(data),{population:4});s.advance(.2);const cars=s.cars;s.evolve();assert.equal(s.optimizer.updates,1);assert.ok(cars.every(c=>!c.alive&&c.noLapPenaltyApplied));assert.equal(s.history[0].rewardRevision,R.REVISION);
});
test('Saved training retains reward revision/history/reference; wrong or tampered scoring is rejected',()=>{
  const s=new F.Simulation(Legacy.buildV2(data),{population:4});s.advance(.2);s.evolve();const saved=P.capture(s),restored=new F.Simulation(Legacy.buildV2(data),{population:4});P.restore(restored,saved);assert.deepEqual(P.capture(restored),{...saved,elapsedAtSave:0});
  for(const mutate of [x=>x.rewardRevision='old',x=>x.history[0].rewardBreakdown.rewards.progress++,x=>delete x.history[0].baseBest,x=>x.history[0].previousBestLapTime=-1]){const bad=structuredClone(saved);mutate(bad);assert.throws(()=>P.restore(restored,bad));}
});
