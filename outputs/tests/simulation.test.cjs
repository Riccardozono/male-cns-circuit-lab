const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const F=require('../simulation.js'),V=require('../vehicle-992.js'),data=require('../data/connectome.json'),manifest=require('../data/provenance.json');
const track=F.makeTrack(),graph=F.compileGraph(data);
const {fixture}=require('./fixtures/reward-rollout.cjs');
const near=(a,b,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
function evaluateGeneration(sim,ticks=3600){
  const generation=sim.generation;
  for(let i=0;i<ticks&&sim.generation===generation;i++)sim.tick();
  if(sim.generation===generation)sim.evolve();
}

test('Official subset: size, unique IDs, integer weights, checksum',()=>{
  assert.equal(data.modelRevision,3);assert.equal(data.nodes.length,manifest.nodeCount);assert.equal(data.edges.length,manifest.edgeCount);
  assert.equal(manifest.nodeCount,7721);assert.equal(manifest.edgeCount,242486);assert.equal(manifest.synapseCount,5018643);
  assert.equal(data.inputIndices.length,manifest.inputCount);assert.equal(manifest.inputCount,1200);assert.ok(manifest.nodeCount>364);assert.ok(manifest.edgeCount>6441);
  // The anatomical export remains unchanged; the 992 runtime appends six
  // telemetry channels rather than rewriting the source dataset metadata.
  assert.equal(manifest.sensorCount,22);assert.equal(F.SENSOR_COUNT,manifest.sensorCount+6);assert.equal(manifest.visualSensorCount,F.VISUAL_SENSOR_COUNT);assert.equal(F.PHYSICS_SENSOR_COUNT,manifest.physicsSensorCount+6);assert.equal(manifest.physicsRelayCount,F.PHYSICS_RELAY_COUNT);
  assert.equal(new Set(data.nodes.map(n=>n.bodyId)).size,data.nodes.length);
  assert.equal(data.nodes.filter(n=>n.position===null).length,22);
  assert.ok(data.nodes.every(n=>n.position===null||(Array.isArray(n.position)&&n.position.length===3&&n.position.every(Number.isInteger))));
  assert.equal(data.edges.reduce((n,e)=>n+e[2],0),manifest.synapseCount);
  assert.ok(data.edges.every(e=>Number.isInteger(e[2])&&e[2]>=5));
  const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../data/connectome.json'))).digest('hex');
  assert.equal(hash,manifest.subsetSha256);
});
test('Fresh sessions use the measured 32% mutation default in engine and UI',()=>{
  const sim=new F.Simulation(data,{population:4});
  assert.equal(sim.mutation,.32);
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.match(html,/id="mutation-output">32% base/);
  assert.match(html,/id="mutation-range"[^>]*value="32"/);
  const desktopRuntime=fs.readFileSync(path.join(__dirname,'../desktop-runtime.js'),'utf8');
  assert.match(desktopRuntime,/this\._mutation = options\.mutation \?\? \.32/);
  const desktopEngine=fs.readFileSync(path.join(__dirname,'../../desktop/engine.cjs'),'utf8');
  assert.match(desktopEngine,/rawOptions\.mutation \?\? \.32/);
});
test('All exported neurons have a real directed path to an output',()=>{
  const reachable=new Set(data.outputIndices);let size;
  do{size=reachable.size;for(const [a,b]of data.edges)if(reachable.has(b))reachable.add(a);}while(reachable.size!==size);
  assert.equal(reachable.size,graph.n);
  assert.ok(data.inputIndices.every(i=>!data.outputIndices.includes(i)));
});
test('Dataset missing or corrupted: fail closed, never use a synthetic fallback',()=>{
  assert.throws(()=>new F.Simulation(null),/Dataset/);
  assert.throws(()=>F.compileGraph({...data,edges:[[0,graph.n,5]]}),/non valida/);
});
test('Uniform fair starting pose and zero initial velocity for every car',()=>{
  const sim=new F.Simulation(data);
  const a=sim.cars[0];for(const c of sim.cars){assert.equal(c.x,a.x);assert.equal(c.y,a.y);assert.equal(c.heading,a.heading);assert.equal(c.speed,0);assert.equal(c.progress,0);}
});
test('Zero motor commands: no movement, no route following',()=>{
  const car=F.makeCar(track),pose=[car.x,car.y,car.heading];
  for(let i=0;i<60;i++)F.drive(track,car,[0,0,0]);
  assert.deepEqual([car.x,car.y,car.heading],pose);assert.ok(car.fitness<0);assert.equal(car.alive,true);
});
test('Throttle and zero steer: strictly straight, then wall collision',()=>{
  const car=F.makeCar(track),x=car.x,y=car.y,h=car.heading;
  for(let i=0;i<1200&&car.alive;i++)F.drive(track,car,[0,0.7,0]);
  near(car.heading,h);near((car.x-x)*Math.sin(h)-(car.y-y)*Math.cos(h),0);
  assert.equal(car.alive,false);assert.equal(car.reason,'urto');assert.ok(car.distance>30);assert.ok(car.penalty>=F.SCORE_RULES.collision);
});
test('Rewards, penalties and lap time are part of the agent score',()=>{
  const forward=F.makeCar(track);for(let i=0;i<30;i++)F.drive(track,forward,[0,.7,0]);
  assert.ok(forward.reward>0);assert.ok(forward.penalty>0);assert.equal(forward.fitness,forward.reward-forward.penalty);
  const stalled=F.makeCar(track);for(let i=0;i<540&&stalled.alive;i++)F.drive(track,stalled,[0,0,0]);
  assert.equal(stalled.reason,'ferma / senza progresso');assert.ok(stalled.penalty>=F.SCORE_RULES.stall);assert.ok(stalled.fitness< -F.SCORE_RULES.stall);
  const slowRun=fixture(),fastRun=fixture();slowRun.move(1000,80);fastRun.move(1000,25);const slow=slowRun.car,fast=fastRun.car;
  assert.equal(slow.laps,1);assert.equal(fast.laps,1);assert.ok(Number.isFinite(slow.lastLapTime)&&Number.isFinite(fast.lastLapTime));
  assert.ok(fast.lastLapTime<slow.lastLapTime);assert.ok(fast.lastLapReward>slow.lastLapReward);assert.ok(slow.reward>slow.lastLapReward);
  assert.ok(slow.lastLapPenalty>0);assert.ok(slow.penalty>fast.penalty);assert.ok(slow.fitness<fast.fitness);
});
test('Generation-end penalties punish no-lap agents and slower previous-generation laps',()=>{
  const noLapSim=new F.Simulation(data,{population:2}),noLapCars=noLapSim.cars.slice();noLapSim.evolve();
  assert.equal(noLapSim.history[0].noLapCount,2);assert.equal(noLapSim.history[0].slowerLapCount,0);
  assert.ok(noLapCars.every(car=>car.noLapPenalty===F.SCORE_RULES.noLapPenalty+F.SCORE_RULES.missingLapPenalty&&car.noLapPenaltyApplied&&car.fitness<=-F.SCORE_RULES.noLapPenalty));
  const comparisonSim=new F.Simulation(data,{population:2});comparisonSim.history.push({bestLapTime:10});
  const slower=comparisonSim.cars[0],faster=comparisonSim.cars[1];slower.laps=1;slower.lapTimes=[12];slower.bestLapTime=12;faster.laps=1;faster.lapTimes=[9];faster.bestLapTime=9;comparisonSim.evolve();
  assert.equal(comparisonSim.history.at(-1).slowerLapCount,1);assert.equal(slower.previousGenerationLapTime,10);assert.equal(slower.lapRegression,2);near(slower.lapRegressionPenalty,.2*F.SCORE_RULES.regressionFactor);assert.equal(faster.lapRegressionPenalty,0);
});
test('Each agent is stopped after two completed laps per generation',()=>{
  const f=fixture();f.move(2000,80);const car=f.car;
  assert.equal(F.SCORE_RULES.maxLapsPerGeneration,2);assert.equal(car.laps,2);assert.equal(car.alive,false);assert.equal(car.reason,'limite 2 giri');assert.equal(car.lapTimes.length,2);
});
test('Opposite steering causes opposite free headings and positions',()=>{
  const left=F.makeCar(track),right=F.makeCar(track),h=left.heading;
  for(let i=0;i<45;i++){F.drive(track,left,[-0.5,0.7,0]);F.drive(track,right,[0.5,0.7,0]);}
  assert.ok(left.heading<h);assert.ok(right.heading>h);assert.notEqual(left.x,right.x);
});
test('Real ray intersection and changed heading/position change sensor distances',()=>{
  const box={walls:[{a:{x:100,y:-100},b:{x:100,y:100}}]};
  near(F.raycast(box,0,0,0),100);near(F.raycast(box,20,0,0),80);
  near(F.raycast(box,0,0,Math.PI),F.SENSOR_MAX);
  const car=F.makeCar(track),before=F.sense(track,car);car.heading+=0.5;
  assert.notDeepEqual(F.sense(track,car),before);assert.ok(before.every(v=>v>0&&v<=1));
});
test('Road sensors measure Porsche body clearance against the collision walls',()=>{
  const t=V.configureTrack(F.makeTrack([[0,0],[0,100],[100,100],[100,0]],5,true), 'lab'),car=F.makeCar(t);
  Object.assign(car,{x:50,y:98,heading:0,footprintSensorsEnabled:true});
  assert.equal(F.onRoad(t,car.x,car.y),true);assert.equal(F.collided(t,car),false);
  const sensors=F.roadSense(t,car),centreForward=F.raycast(t,car.x,car.y,car.heading),frontX=car.x+V.SPEC.lengthM/2,
    frontY=car.y,frontClearance=F.raycast(t,frontX,frontY,car.heading);
  near(sensors[2],frontClearance/F.SENSOR_MAX);assert.ok(sensors[2]<centreForward/F.SENSOR_MAX);
  Object.assign(car,{y:97});
  assert.equal(F.onRoad(t,car.x,car.y),true,'the car centre remains on the road');
  assert.equal(F.collided(t,car),true,'the Porsche footprint crosses the physical wall');
  const edgeSensors=F.roadSense(t,car);
  assert.ok(edgeSensors[0]>.9,'the left/right body-clearance sensor reports the exposed side');
});
test('Footprint-clearance sensory migration is opt-in for V3 until other models are verified',()=>{
  const Legacy=require('../legacy-models.js'),v2=new F.Simulation(Legacy.buildV2(data),{population:1,mutation:0}),
    v3=new F.Simulation(Legacy.tagV3(JSON.parse(JSON.stringify(data))),{population:1,mutation:0});
  assert.equal(v2.cars[0].footprintSensorsEnabled,false);assert.equal(v3.cars[0].footprintSensorsEnabled,true);
});
test('Brakes reduce speed; cannot force reverse',()=>{
  const car=F.makeCar(track);car.speed=100/3.6;F.drive(track,car,[0,0,1]);assert.ok(car.speed<100/3.6);
  for(let i=0;i<360;i++)F.drive(track,car,[0,0,1]);assert.equal(car.speed,0);assert.ok(car.longitudinalVelocity>=0);
});
test('Throttle and brake are mutually exclusive at the physical actuator',()=>{
  const throttle=F.makeCar(track);F.drive(track,throttle,[0,.8,.2]);
  assert.equal(throttle.outputs[0],0);assert.ok(Math.abs(throttle.outputs[1]-.6)<1e-12);assert.equal(throttle.outputs[2],0);assert.ok(throttle.speed>0);
  const brake=F.makeCar(track);brake.speed=90;F.drive(track,brake,[0,.2,.8]);
  assert.equal(brake.outputs[0],0);assert.equal(brake.outputs[1],0);assert.ok(Math.abs(brake.outputs[2]-.6)<1e-12);assert.ok(brake.speed<90);
  const tie=F.makeCar(track);tie.speed=90;F.drive(track,tie,[0,.7,.7]);
  assert.deepEqual(tie.outputs,[0,0,0]);assert.ok(tie.speed<90);
});
test('Neural readout keeps throttle and brake distinct before actuator arbitration',()=>{
  const graph={outputs:Uint32Array.from([0]),full:false},brain={activity:Float64Array.from([1])},genome={readout:[0,.8,.2]};
  const neural=F.neuralOutputsFromBrain(graph,brain,genome),direct=F.normalizeDriveCommands([0,.2,.8]);
  assert.equal(neural[0],0);assert.ok(Math.abs(neural[1]-.39)<1e-12);assert.equal(neural[2],0);
  assert.equal(direct[0],0);assert.equal(direct[1],0);assert.ok(Math.abs(direct[2]-.6)<1e-12);
});
test('Neural motor logits launch a fresh population without overlapping pedals',()=>{
  const graph={outputs:Uint32Array.from([0]),full:false},brain={activity:Float64Array.from([1])};
  const forward=F.neuralOutputsFromBrain(graph,brain,{readout:[0,.2,.1]});
  const reverse=F.neuralOutputsFromBrain(graph,brain,{readout:[0,.1,.9]});
  assert.ok(forward[1]>0&&forward[2]===0);assert.ok(reverse[1]===0&&reverse[2]>0);
  assert.ok(forward[1]>=F.NEURAL_MOTOR_LAUNCH_BIAS);assert.ok(reverse[2]>0);
});
test('Policy readout receives the track launch bias but still needs an active MaleCNS signal',()=>{
  const sim=new F.Simulation(require('../data/connectome.json'),{population:1}),car=sim.cars[0],p=sim.graph.learning;
  const genome=F.cloneGenome(car.genome),brain=F.makeBrain(sim.graph);genome.policyWeights.fill(0);
  const node=p.nodes[0];brain.activity[node]=1;
  const wide=F.neuralOutputsFromBrain(sim.graph,brain,genome,F.NEURAL_MOTOR_LAUNCH_BIAS);
  const narrow=F.neuralOutputsFromBrain(sim.graph,brain,genome,F.MAP_NEURAL_MOTOR_LAUNCH_BIAS);
  assert.deepEqual(wide,[0,F.NEURAL_MOTOR_LAUNCH_BIAS,0]);
  assert.deepEqual(narrow,[0,F.MAP_NEURAL_MOTOR_LAUNCH_BIAS,0]);
  genome.policyWeights[genome.policyWeights.length-1]=-1;
  const neuralBrake=F.neuralOutputsFromBrain(sim.graph,brain,genome,F.NEURAL_MOTOR_LAUNCH_BIAS);
  assert.equal(neuralBrake[1],0);assert.ok(neuralBrake[2]>0);
  brain.activity.fill(0);
  assert.deepEqual(F.neuralOutputsFromBrain(sim.graph,brain,genome,F.NEURAL_MOTOR_LAUNCH_BIAS),[0,0,0]);
});
test('Track launch bias helps a stopped active policy and is removed once it is moving',()=>{
  const sim=new F.Simulation(require('../data/connectome.json'),{population:1,circuitId:'monza',circuits:require('../data/circuits.json')}),p=sim.graph.learning,genome=F.cloneGenome(sim.cars[0].genome);
  genome.policyWeights.fill(0);
  const outputAtSpeed=speedMps=>{const brain=F.makeBrain(sim.graph);brain.activity[p.nodes[0]]=1;return F.neuralStepForTrack(sim.track,sim.graph,brain,genome,[],true,true,speedMps);};
  assert.deepEqual(outputAtSpeed(0),[0,F.MAP_NEURAL_MOTOR_LAUNCH_BIAS,0]);
  assert.deepEqual(outputAtSpeed(2.01),[0,0,0]);
  genome.policyWeights[genome.policyWeights.length-1]=-1;
  const stoppedBrake=outputAtSpeed(0)[2],movingBrake=outputAtSpeed(2.01)[2];
  assert.ok(stoppedBrake>0&&movingBrake>stoppedBrake,'launch bias must not cancel an active brake, especially while moving');
});
test('Imported champion is carried into the next generation',()=>{
  const sim=new F.Simulation(data,{population:3}),champion=F.cloneGenome(sim.cars[1].genome);
  sim.adoptChampion(champion);sim.evolve();
  assert.deepEqual(sim.cars[1].genome,champion);
});
test('Learning ranking puts a safe rollout ahead of a farther, faster-scoring crash',()=>{
  const crash={fitness:1e6,bestProgress:9000,laps:2,bestLapTime:100,reason:'urto'},safe={fitness:-100,bestProgress:900,laps:0,bestLapTime:Infinity,reason:'ferma / senza progresso'};
  assert.ok(F.compareLearningAgents(safe,crash)<0);
  assert.ok(F.compareLearningAgents({fitness:-100,laps:2,bestLapTime:900,bestProgress:2000,reason:'limite 2 giri'},{fitness:100,laps:1,bestLapTime:300,bestProgress:5000,reason:'ferma / senza progresso'})<0,'safe lap completion count leads over fewer laps');
  assert.ok(F.compareLearningAgents({fitness:-5000,laps:0,bestProgress:733},{fitness:0,laps:0,bestProgress:21})<0,'the safe no-lap frontier must not be replaced by a stalled near-start policy');
  assert.ok(F.compareLearningAgents({fitness:100,laps:1,bestLapTime:700,bestProgress:500,reason:'ferma / senza progresso'},{fitness:100,laps:1,bestLapTime:800,bestProgress:1000,reason:'ferma / senza progresso'})<0);
  assert.equal(F.isSafeLearningOutcome({reason:'',rewardBreakdown:{penalties:{collision:1}}}),false);
});
test('A farther collision stays in raw metrics but cannot advance safe learning or parent selection',()=>{
  const sim=new F.Simulation(data,{population:16,mutation:.12});
  const winner=sim.cars[0],progressLeader=sim.cars[2];
  const scored=(car,fitness,bestProgress,reason)=>{
    Object.assign(car.rewardBreakdown.rewards,{progress:5000,checkpoints:500,lap:8000});
    Object.assign(car.rewardBreakdown.penalties,{risk:13500-fitness});
    car.reward=13500;car.penalty=13500-fitness;car.fitness=fitness;car.bestProgress=bestProgress;car.laps=1;
    car.lapTimes=[742.55];car.bestLapTime=742.55;car.rewardState.finalized=true;car.alive=false;car.reason=reason;
  };
  scored(winner,4061.7051939257017,6599.861744225725,'ferma / senza progresso');
  for(let i=1;i<sim.cars.length;i++)if(i!==2)scored(sim.cars[i],i===1||i===3||i===4?3000:2000,1000,'ferma / senza progresso');
  scored(progressLeader,2249.107351357816,6620.4711111128945,'urto');
  sim.safeLearningFrontier={progress:6599.861744225725,laps:1,lapTime:742.55};
  const ranked=sim.cars.slice().sort(F.compareAgents);
  assert.equal(ranked.indexOf(progressLeader),4);
  assert.ok(ranked.slice(0,6).includes(progressLeader),'candidate is inside the broad parent pool');
  assert.ok(!ranked.slice(0,4).includes(progressLeader),'candidate is outside the actual policy mutation elite');
  sim.history.push({bestProgress:6599.861744225725,bestLapTime:742.55});
  sim.evolve();
  assert.equal(sim.history.at(-1).best,4061.7051939257017);
  assert.equal(sim.history.at(-1).bestProgress,6620.4711111128945);
  assert.equal(sim.learningFrontier.progress,6620.4711111128945,'the raw physical maximum remains visible');
  assert.equal(sim.safeLearningFrontier.progress,6599.861744225725,'the crash does not rewrite the clean frontier');
  assert.equal(sim.stagnation,1,'a crash cannot reset the safe-progress stagnation clock');
  assert.deepEqual(sim.cars[0].genome,winner.genome);
  assert.notDeepEqual(sim.champion,progressLeader.genome,'the crash cannot replace the safe champion');
  assert.equal(sim.lastFrontierOffspringCount,0,'unsafe progress is not a mutation lineage');
  assert.ok(!sim.cars.some(car=>JSON.stringify(car.genome)===JSON.stringify(progressLeader.genome)),'the crashed candidate is not carried into the next population');
  near(sim.history.at(-1).meanProgress,(6599.861744225725+6620.4711111128945+14*1000)/16);
});
test('Research V3 risk repair mutates a near-frontier crash seed without retaining or promoting the unsafe genome',()=>{
  const Legacy=require('../legacy-models.js'),v3=Legacy.tagV3(JSON.parse(JSON.stringify(data)));
  const ordinary=new F.Simulation(v3,{population:4}),highDose=new F.Simulation(v3,{population:4,riskRepairEnabled:true,riskRepairOffspringRate:.18});
  assert.equal(ordinary.riskRepairEnabled,false,'risk repair is off in ordinary app sessions');assert.equal(ordinary.riskRepairOffspringRate,.06);
  assert.equal(highDose.riskRepairOffspringRate,.18,'headless experiments can vary only the reserved mutation branch');
  const sim=new F.Simulation(v3,{population:16,mutation:.12,riskRepairEnabled:true}),unsafe=sim.cars[2],unsafeGenome=JSON.stringify(unsafe.genome);
  const scored=(car,fitness,bestProgress,reason)=>{
    car.fitness=fitness;car.reward=fitness;car.penalty=reason==='urto'?100:0;car.bestProgress=bestProgress;car.laps=0;car.bestLapTime=Infinity;
    car.rewardState.finalized=true;car.alive=false;car.reason=reason;
    if(reason==='urto')car.rewardBreakdown.penalties.collision=100;
  };
  scored(sim.cars[0],200,100,'ferma / senza progresso');
  scored(sim.cars[1],190,120,'ferma / senza progresso');
  for(let i=3;i<sim.cars.length;i++)scored(sim.cars[i],50-i,10,'ferma / senza progresso');
  scored(unsafe,150,125,'urto');
  sim.safeLearningFrontier={progress:120,laps:0,lapTime:null};sim.learningFrontier={progress:125,laps:0,lapTime:null};sim.stagnation=6;
  sim.evolve();
  assert.equal(sim.lastRiskRepairOffspringCount,1,'a small branch is reserved for repair offspring');
  assert.equal(sim.lastRiskRepairParentProgress,125);
  assert.equal(sim.safeLearningFrontier.progress,120,'unsafe progress does not move the safe frontier');
  assert.equal(sim.champion&&F.isSafeLearningOutcome(sim.championStats),true,'unsafe policies cannot become champion');
  assert.ok(!sim.cars.some(car=>JSON.stringify(car.genome)===unsafeGenome),'the crashed genome is never copied forward unchanged');
  assert.equal(sim.lastFrontierDiagnostics.riskRepairOffspringCount,1);
});
test('Crash trials reach only the negative optimizer feedback, never safe generation selection',()=>{
  const sim=new F.Simulation(require('../legacy-models.js').buildV2(data),{population:8,mutation:.16}),safe=sim.cars.slice(0,4),crashed=sim.cars.slice(4),observed={all:0,unsafe:0};
  for(const [i,car] of safe.entries()){
    car.alive=false;car.reason='ferma / senza progresso';car.rewardState.finalized=true;car.bestProgress=700+i*100;car.fitness=100+i;
  }
  for(const [i,car] of crashed.entries()){
    car.alive=false;car.reason='urto';car.rewardState.finalized=true;car.rewardBreakdown.penalties.collision=900;car.bestProgress=1100+i*100;car.fitness=1000+i;
  }
  const crashedGenomes=new Set(crashed.map(car=>JSON.stringify(car.genome))),originalUpdate=sim.optimizer.update.bind(sim.optimizer);
  sim.optimizer.update=(ranked,compare)=>{observed.all=ranked.length;observed.unsafe=ranked.filter(car=>!F.isSafeLearningOutcome(car)).length;return originalUpdate(ranked,compare);};
  sim.evolve();
  assert.deepEqual(observed,{all:8,unsafe:4});
  assert.ok(sim.champion&&F.isSafeLearningOutcome(safe.sort(F.compareLearningAgents)[0]),'champion remains from a safe outcome');
  assert.ok(!sim.cars.some(car=>crashedGenomes.has(JSON.stringify(car.genome))),'crashed genomes are never copied as parents');
});
test('A safe physical leader seeds learning even with a slightly lower reward',()=>{
  const sim=new F.Simulation(data,{population:16,mutation:.12}),winner=sim.cars[0],leader=sim.cars[2];
  const scored=(car,fitness,bestProgress)=>{
    car.fitness=fitness;car.baseFitness=fitness;car.reward=fitness;car.penalty=0;car.rewardBreakdown.rewards.progress=fitness;car.bestProgress=bestProgress;car.laps=0;car.bestLapTime=Infinity;
    car.rewardState.finalized=true;car.alive=false;car.reason='ferma / senza progresso';
  };
  scored(winner,100,6599.8617);
  for(let i=1;i<sim.cars.length;i++)if(i!==2)scored(sim.cars[i],i===1||i===3||i===4?80:20,1000);
  scored(leader,50,6600.23);
  assert.ok(leader.bestProgress-winner.bestProgress<1);
  const ranked=sim.cars.slice().sort(F.compareAgents);
  assert.equal(ranked.indexOf(leader),4);
  sim.evolve();
  assert.equal(sim.history.at(-1).best,100,'fitness champion remains authoritative');
  assert.deepEqual(sim.cars[0].genome,leader.genome,'the furthest safe no-lap policy seeds the next learning generation');
  assert.deepEqual(sim.champion,winner.genome,'the best safe-fitness champion remains protected');
});
test('Safe archive preserves progress, lap-count and fastest-lap frontiers outside the fitness top four',()=>{
  const sim=new F.Simulation(data,{population:8,mutation:.12}),genomes=sim.cars.map(car=>JSON.stringify(car.genome));
  const rows=[
    {fitness:1000,progress:100,laps:0,times:[]},
    {fitness:900,progress:200,laps:0,times:[]},
    {fitness:800,progress:300,laps:0,times:[]},
    {fitness:700,progress:400,laps:0,times:[]},
    {fitness:600,progress:1000,laps:0,times:[]},
    {fitness:500,progress:700,laps:2,times:[110,100]},
    {fitness:400,progress:600,laps:1,times:[80]},
    {fitness:300,progress:500,laps:0,times:[]}
  ];
  sim.cars.forEach((car,i)=>{const row=rows[i];car.bestProgress=row.progress;car.laps=row.laps;car.lapTimes=row.times.slice();car.bestLapTime=row.times.length?Math.min(...row.times):Infinity;
    car.fitness=row.fitness;car.reward=row.fitness;car.penalty=0;car.baseFitness=row.fitness;car.rewardBreakdown.rewards.progress=row.fitness;
    car.rewardState.finalized=true;car.alive=false;car.reason=row.laps>=2?'limite 2 giri':'ferma / senza progresso';});
  sim.evolve();
  const archived=sim.hallOfFame.map(entry=>genomes.indexOf(JSON.stringify(entry.genome)));
  assert.equal(sim.hallOfFame.length,4);
  assert.ok(archived.includes(0),'fitness champion remains archived');
  assert.ok(archived.includes(4),'highest safe progress survives even outside the fitness top four');
  assert.ok(archived.includes(5),'maximum completed laps survive in the safe archive');
  assert.ok(archived.includes(6),'fastest safe lap survives in the safe archive');
  assert.deepEqual(sim.safeLearningFrontier,{progress:1000,laps:2,lapTime:80});
});
test('Prolonged stagnation breeds from and preserves the best archived safe-progress lineage',()=>{
  const sim=new F.Simulation(data,{population:16,mutation:.12}),winner=sim.cars[0],liveLeader=sim.cars[2];
  const archivedGenome=F.cloneGenome(sim.cars[15].genome);archivedGenome.encoder[0]+=.01;
  const scored=(car,fitness,bestProgress)=>{
    car.fitness=fitness;car.baseFitness=fitness;car.reward=fitness;car.penalty=0;car.bestProgress=bestProgress;car.laps=0;car.bestLapTime=Infinity;
    car.rewardBreakdown.rewards.progress=fitness;car.rewardState.finalized=true;car.alive=false;car.reason='ferma / senza progresso';
  };
  scored(winner,100,150);
  for(let i=1;i<sim.cars.length;i++)if(i!==2)scored(sim.cars[i],80-i,100+i);
  scored(liveLeader,50,700);liveLeader.speed=0;liveLeader.outputs=[.0206,0,.2541];
  sim.hallOfFame=[{genome:archivedGenome,fitness:10,bestProgress:900,laps:0,bestLapTime:Infinity,progress:900}];
  sim.safeLearningFrontier={progress:900,laps:0,lapTime:null};
  sim.stagnation=F.EVOLUTION_RULES.prolongedStagnationWindow;
  sim.evolve();
  assert.equal(sim.safeLearningFrontier.progress,900,'an unevaluated safe archive lineage remains authoritative frontier evidence');
  assert.equal(sim.lastFrontierDiagnostics.frontierParentSource,'hall-of-fame');
  assert.equal(sim.lastFrontierDiagnostics.frontierParentProgress,900);
  assert.equal(sim.lastFrontierDiagnostics.frontierMutationFocus,'longitudinal','a stopped no-gas leader explores throttle/brake while preserving its steering response');
  assert.ok(sim.lastFrontierOffspringCount>0,'the archived safe controller is explored with mutations');
  assert.ok(sim.cars.some(car=>JSON.stringify(car.genome)===JSON.stringify(archivedGenome)),'the archive controller remains available for future generations');
  assert.deepEqual(sim.cars[0].genome,liveLeader.genome,'the furthest safe no-lap rollout remains the learning seed');
});
test('Replayed archive genomes replace stale progress and unsafe lineages are removed',()=>{
  for(const replaySafe of [true,false]){
    const sim=new F.Simulation(data,{population:16,mutation:.12}),winner=sim.cars[0],leader=sim.cars[2],archivedCar=sim.cars[15];
    const archivedGenome=F.cloneGenome(archivedCar.genome);
    const scored=(car,fitness,bestProgress,reason='ferma / senza progresso')=>{
      car.fitness=fitness;car.baseFitness=fitness;car.reward=fitness;car.penalty=0;car.bestProgress=bestProgress;car.laps=0;car.bestLapTime=Infinity;
      car.rewardBreakdown.rewards.progress=fitness;car.rewardState.finalized=true;car.alive=false;car.reason=reason;
    };
    scored(winner,100,150);scored(leader,80,700);
    for(let i=1;i<sim.cars.length;i++)if(i!==2&&i!==15)scored(sim.cars[i],20-i,100+i);
    scored(archivedCar,replaySafe?95:-100,200,replaySafe?'ferma / senza progresso':'urto');
    sim.hallOfFame=[{genome:archivedGenome,fitness:1000,bestProgress:900,laps:0,bestLapTime:Infinity,progress:900}];
    sim.champion=F.cloneGenome(archivedGenome);sim.championStats={fitness:1000,bestProgress:900,laps:0,bestLapTime:Infinity};sim.bestEver=1000;
    sim.safeLearningFrontier={progress:900,laps:0,lapTime:null};
    sim.stagnation=F.EVOLUTION_RULES.prolongedStagnationWindow;
    sim.evolve();
    const refreshed=sim.hallOfFame.find(entry=>JSON.stringify(entry.genome)===JSON.stringify(archivedGenome));
    if(replaySafe){
      assert.ok(refreshed,'a safe replay remains available in the archive');
      assert.equal(refreshed.bestProgress,200,'current physical progress replaces the stale 900 m record');
    }else assert.equal(refreshed,undefined,'a current collision invalidates the old safe archive entry');
    assert.ok(sim.championStats.fitness<1000,'a re-evaluated champion cannot retain its stale score');
    assert.equal(sim.bestEver,sim.championStats.fitness,'the visible best score follows the re-evaluated safe champion');
    assert.equal(sim.safeLearningFrontier.progress,700,'re-evaluated historical scores are replaced by the current safe population frontier');
    assert.deepEqual(sim.safeLearningFrontier,{progress:700,laps:0,lapTime:null});
    assert.equal(sim.stagnation,F.EVOLUTION_RULES.prolongedStagnationWindow+1,'no progress against the real historical record remains stagnant');
    assert.notEqual(sim.lastFrontierDiagnostics.frontierParentSource,'hall-of-fame','an evaluated stale genome cannot become the special parent');
  }
});
test('Evolution preserves a live practice snapshot and never fabricates one from a stopped car',()=>{
  const sim=new F.Simulation(data,{population:8,mutation:0}),cars=sim.cars.slice();
  cars.forEach((car,index)=>{
    car.bestProgress=550+index*10;car.laps=0;car.bestLapTime=Infinity;car.fitness=car.baseFitness=car.reward=car.bestProgress;car.penalty=0;
    car.rewardBreakdown.rewards.progress=car.bestProgress;car.rewardState.finalized=true;car.alive=false;car.reason='ferma / senza progresso';
  });
  sim.safeLearningFrontier={progress:900,laps:0,lapTime:null};sim.stagnation=12;
  const actualElite=cars.slice().sort(F.compareLearningAgents)[0];
  const movingSpeed=2.5*(actualElite.pixelsPerMeter||1);
  actualElite.speed=movingSpeed;actualElite.vehicle.u=movingSpeed;actualElite.brain.activity.fill(.17);
  const liveSnapshot=F.capturePracticeState(actualElite);liveSnapshot.bestProgress=actualElite.bestProgress;actualElite.practiceState=liveSnapshot;
  V.stop(actualElite);
  sim.evolve();
  assert.strictEqual(actualElite.practiceState,liveSnapshot,'generation completion preserves the last observed moving state');
  assert.ok(actualElite.practiceState.activity instanceof Float64Array);
  assert.equal(actualElite.practiceState.speed,movingSpeed,'practice retains the observed speed from before parking');
  assert.equal(actualElite.speed,0,'the completed episode remains physically parked');
  assert.ok(cars.filter(car=>car!==actualElite).every(car=>!car.practiceState),'terminal cars without a live sample do not receive a fabricated practice state');
});
test('An all-crash generation cannot advance safe progress or create a crash-parent branch',()=>{
  const sim=new F.Simulation(data,{population:16,mutation:.12}),winner=sim.cars[0],leader=sim.cars[2];
  const scored=(car,fitness,bestProgress)=>{
    car.fitness=fitness;car.reward=fitness;car.penalty=0;car.bestProgress=bestProgress;car.laps=0;car.bestLapTime=Infinity;
    car.rewardState.finalized=true;car.alive=false;car.reason='urto';
  };
  scored(winner,100,100);
  for(let i=1;i<sim.cars.length;i++)if(i!==2)scored(sim.cars[i],i===1||i===3||i===4?80:20,10);
  scored(leader,50,120);
  sim.learningFrontier={progress:120,laps:0,lapTime:null};sim.stagnation=F.EVOLUTION_RULES.stagnationWindow;
  sim.safeLearningFrontier={progress:120,laps:0,lapTime:null};
  sim.evolve();
  assert.equal(sim.history.at(-1).best,100,'the fitness champion remains separately reported');
  assert.equal(sim.safeLearningFrontier.progress,120,'unsafe progress does not replace the clean frontier');
  assert.equal(sim.stagnation,F.EVOLUTION_RULES.stagnationWindow+1,'all-crash generations count as stagnant');
  assert.equal(sim.lastFrontierOffspringCount,0,'all-crash batches restart exploration without selecting a crash parent');
  assert.ok(!sim.cars.some(car=>JSON.stringify(car.genome)===JSON.stringify(leader.genome)));
  assert.equal(F.EVOLUTION_RULES.frontierOffspringRate,.25);
  assert.equal(F.EVOLUTION_RULES.stagnantFrontierOffspringRate,.25);
});
test('An all-crash generation preserves the clean checkpoint and restarts mutated candidates',()=>{
  const sim=new F.Simulation(data,{population:16,mutation:.12}),winner=sim.cars[0];
  const scored=(car,fitness,bestProgress)=>{
    car.fitness=fitness;car.reward=fitness;car.penalty=0;car.bestProgress=bestProgress;car.laps=0;car.bestLapTime=Infinity;
    car.rewardState.finalized=true;car.alive=false;car.reason='urto';
  };
  scored(winner,100,120);
  for(let i=1;i<sim.cars.length;i++)scored(sim.cars[i],80-i,10);
  sim.learningFrontier={progress:120,laps:0,lapTime:null};sim.stagnation=F.EVOLUTION_RULES.stagnationWindow;
  sim.safeLearningFrontier={progress:120,laps:0,lapTime:null};
  sim.evolve();
  assert.equal(sim.history.at(-1).best,100,'the current fitness champion remains protected');
  assert.equal(sim.lastFrontierOffspringCount,0,'the crashed leader does not become a special offspring branch');
  assert.equal(sim.safeLearningFrontier.progress,120);
  assert.ok(!sim.cars.some(car=>JSON.stringify(car.genome)===JSON.stringify(winner.genome)),'no crash policy is copied forward');
});
test('A 16-car learning generation evaluates a mirrored ES pair and updates from its ranking',()=>{
  const sim=new F.Simulation(data,{population:16,mutation:.12,seed:7717});
  const finish=(score)=>{for(const [i,car] of sim.cars.entries()){
    car.alive=false;car.reason='ferma / senza progresso';car.laps=0;car.bestLapTime=Infinity;car.bestProgress=score(i);
    car.fitness=car.reward=car.baseFitness=car.bestProgress;car.penalty=0;car.rewardState.finalized=true;
  }};
  finish(i=>120-i);sim.evolve();
  const ids=[...sim.optimizerSampleIds];
  assert.equal(sim.lastOptimizerSampleCount,2,'16 agents reserve two comparable ES samples');
  assert.ok(ids.length>=2);
  const center=sim.optimizer.mean.slice(),left=sim.cars[ids[0]].genome.policyWeights,right=sim.cars[ids[1]].genome.policyWeights;
  const symmetric=[];
  for(let j=0;j<center.length;j++)if(Math.abs(left[j])<8-1e-9&&Math.abs(right[j])<8-1e-9)symmetric.push(Math.abs(left[j]+right[j]-2*center[j]));
  assert.ok(symmetric.length>0,'the first two ES candidates form a mirrored pair around the current mean');
  assert.ok(Math.max(...symmetric)<1e-9);
  const updates=sim.optimizer.updates;
  finish(i=>{const rank=ids.indexOf(i);return rank>=0?1000-rank*100:100+i;});sim.evolve();
  assert.equal(sim.optimizer.updates,updates+1,'the pair provides a comparative signal to EvolutionStrategy.update');
});
test('A sub-coarse-threshold safe gain advances the frontier and resets stagnation',()=>{
  const legacy=require('../legacy-models.js'),circuits=require('../data/circuits.json');
  const sim=new F.Simulation(legacy.tagV3(data),{population:16,mutation:.12,circuits,circuitId:'monza',seed:7717});
  const oldTolerance=Math.max(sim.track.pixelsPerMeter||1,sim.track.total*.0005);
  const safeTolerance=Math.max(.5*(sim.track.pixelsPerMeter||1),sim.track.total*.0001);
  assert.ok(safeTolerance<oldTolerance,'the measured frontier tolerance is finer than the previous gate');
  const gain=(safeTolerance+oldTolerance)/2;
  sim.safeLearningFrontier={progress:100,laps:0,lapTime:null};sim.stagnation=4;
  for(const [index,car] of sim.cars.entries()){
    car.alive=false;car.reason='ferma / senza progresso';car.laps=0;car.bestLapTime=Infinity;
    car.bestProgress=100+(index===0?gain:0);car.fitness=car.reward=car.baseFitness=car.bestProgress;
    car.penalty=0;car.rewardState.finalized=true;
  }
  sim.evolve();
  assert.equal(sim.safeLearningFrontier.progress,100+gain,'the incremental safe gain is recorded');
  assert.equal(sim.stagnation,0,'accepted safe progress resets the stagnation counter');
});
test('Prolonged stagnation widens mutation and assigns half the population to the physical frontier',()=>{
  const legacy=require('../legacy-models.js');
  for(const modelData of [legacy.buildV2(data),data]){
    const sim=new F.Simulation(modelData,{population:16,mutation:.12}),winner=sim.cars[0];
    const scored=(car,fitness,bestProgress)=>{
      car.fitness=fitness;car.reward=fitness;car.penalty=0;car.bestProgress=bestProgress;car.laps=0;car.bestLapTime=Infinity;
      car.rewardState.finalized=true;car.alive=false;car.reason='ferma / senza progresso';
    };
    scored(winner,100,120);
    for(let i=1;i<sim.cars.length;i++)scored(sim.cars[i],80-i,10);
    sim.learningFrontier={progress:120,laps:0,lapTime:null};sim.safeLearningFrontier={progress:120,laps:0,lapTime:null};sim.stagnation=F.EVOLUTION_RULES.prolongedStagnationWindow-1;
    sim.evolve();
    assert.equal(sim.history.at(-1).stagnation,F.EVOLUTION_RULES.prolongedStagnationWindow,sim.modelId);
    near(sim.history.at(-1).mutationAmount,.24);
    assert.equal(sim.lastFrontierOffspringCount,8,`${sim.modelId}: half of a 16-car population explores the measured frontier after six stagnant generations`);
    assert.deepEqual(sim.cars[0].genome,winner.genome,`${sim.modelId}: the fitness champion remains protected`);
  }
});
test('Genome crossover preserves valid adapter shapes',()=>{
  const a={encoder:[1,2,3],readout:[4,5,6],gain:1},b={encoder:[7,8,9],readout:[10,11,12],gain:2};
  const child=F.crossoverGenome(a,b,F.rng(13));
  assert.equal(child.encoder.length,3);assert.equal(child.readout.length,3);assert.ok(child.gain===1||child.gain===2);
  assert.ok(child.encoder.every(value=>a.encoder.includes(value)||b.encoder.includes(value)));
  assert.ok(child.readout.every(value=>a.readout.includes(value)||b.readout.includes(value)));
});
test('Functional policy crossover keeps each sensor and action block intact',()=>{
  const sim=new F.Simulation(data,{population:4}),a=F.cloneGenome(sim.cars[0].genome),b=F.cloneGenome(sim.cars[1].genome),policy=sim.graph.learning;
  a.policyWeights.fill(1);b.policyWeights.fill(-1);
  const draws=[.1,.9,.1,.9,.1],child=F.crossoverPolicyBlocks(sim.graph,a,b,()=>draws.shift());
  assert.equal(F.EVOLUTION_RULES.functionalCrossoverRate,.5);
  assert.equal(child.policyWeights.length,policy.length);
  assert.ok(child.policyWeights.every(value=>Number.isFinite(value)&&Math.abs(value)<=8));
  assert.ok(child.policyWeights.slice(0,F.SENSOR_COUNT).every(value=>value===1),'sensor gains come from one parent as a complete block');
  assert.ok(child.policyWeights.slice(F.SENSOR_COUNT,F.SENSOR_COUNT*2).every(value=>value===-1),'sensor biases come from one parent as a complete block');
  assert.ok(child.policyWeights.slice(F.SENSOR_COUNT*2,policy.readoutOffset).every(value=>value===1),'synaptic gains come from one parent as a complete block');
  for(let j=0;j<policy.nodes.length;j++){
    assert.equal(child.policyWeights[policy.readoutOffset+j*2],-1,'steering weights stay grouped');
    assert.equal(child.policyWeights[policy.readoutOffset+j*2+1],1,'longitudinal weights stay grouped');
  }
  assert.equal(child.policyWeights.at(-2),-1,'steering bias stays with steering weights');
  assert.equal(child.policyWeights.at(-1),1,'longitudinal bias stays with longitudinal weights');
  assert.deepEqual(draws,[],'each functional block makes exactly one parent choice');
});
test('Dynamic vehicle physics exposes inertia, slip and G forces',()=>{
  const car=F.makeCar(track);for(let i=0;i<60;i++)F.drive(track,car,[0,.8,0]);
  assert.ok(car.speed>0);assert.ok(Math.abs(car.longitudinalVelocity)>0);assert.equal(car.lateralVelocity,0);assert.ok(car.longitudinalG>0);
  const heading=car.heading;for(let i=0;i<30;i++)F.drive(track,car,[.8,.8,0]);
  assert.notEqual(car.heading,heading);assert.ok(Math.abs(car.yawRate)>0);assert.ok(Math.abs(car.lateralVelocity)>0);assert.ok(car.totalG>0);assert.ok(Number.isFinite(car.slipAngle));
  assert.ok(Math.abs(F.PHYSICS.gravity-9.80665)<1e-9);assert.ok(car.totalG<5);
});
test('Physics, real-wall and powertrain telemetry add seventeen channels without removing visual rays',()=>{
  const graph=F.compileGraph(data),genome=F.makeGenome(F.rng(91),graph.outputs.length);
  assert.equal(F.VISUAL_SENSOR_COUNT,11);assert.equal(F.PHYSICS_SENSOR_COUNT,17);assert.equal(F.SENSOR_COUNT,28);assert.equal(genome.encoder.length,F.SENSOR_COUNT*2);assert.equal(graph.inputChannels.length,graph.inputs.length);assert.equal(graph.visualInputCount,1200);assert.equal(graph.physicsRelayStart,1088);assert.equal(graph.physicsRelayCount,F.PHYSICS_RELAY_COUNT);assert.equal(graph.roadRelayCount,F.ROAD_RELAY_COUNT);
  assert.ok(Array.from(graph.inputChannels).every(channel=>channel<F.VISUAL_SENSOR_COUNT));
  assert.ok(new Set(Array.from(graph.physicsChannels.slice(graph.physicsRelayStart))).size===F.VEHICLE_PHYSICS_SENSOR_COUNT);
  const visualOnly=Array(F.SENSOR_COUNT).fill(0),physicsOnly=visualOnly.slice();physicsOnly[11]=.8;physicsOnly[12]=-.4;physicsOnly[18]=.6;
  const visualBrain=F.makeBrain(graph),physicsBrain=F.makeBrain(graph);for(let i=0;i<20;i++){F.neuralStep(graph,visualBrain,genome,visualOnly);F.neuralStep(graph,physicsBrain,genome,physicsOnly);}
  assert.ok(physicsBrain.activity.some((value,index)=>Math.abs(value-visualBrain.activity[index])>1e-6));
  assert.ok(new Set(Array.from(graph.roadChannels.slice(graph.physicsRelayStart))).size===4);
});

test('Road relay telemetry changes with the real circuit walls',()=>{
  const circuits=require('../data/circuits.json'),sim=new F.Simulation(data,{circuits,circuitId:'monza',population:1}),car=sim.cars[0],initial=F.physicsSense(car,sim.track);
  car.x+=4;car.inputs=F.sense(sim.track,car);const shifted=F.physicsSense(car,sim.track);
  assert.equal(initial.length,F.PHYSICS_SENSOR_COUNT);assert.equal(shifted.length,F.PHYSICS_SENSOR_COUNT);
  assert.ok(initial.slice(7).every(Number.isFinite)&&shifted.slice(7).every(Number.isFinite));
  assert.ok(initial.slice(7).some((value,index)=>Math.abs(value-shifted[7+index])>1e-6));
});
test('Learned policies use the compiled visual and physical relay map without changing legacy saves',()=>{
  const sim=new F.Simulation(data,{population:1,circuitId:'monza',circuits:require('../data/circuits.json')}),graph=sim.graph,
    mapped=F.cloneGenome(sim.cars[0].genome),legacy=F.cloneGenome(mapped),k=graph.physicsRelayStart,
    visual=graph.inputChannels[k],physics=graph.physicsChannels[k],road=graph.roadChannels[k],oldChannel=k%28,
    sensors=Array(F.SENSOR_COUNT).fill(0);
  assert.equal(mapped.sensorMappingVersion,2);assert.deepEqual([visual,physics,road,oldChannel],[0,11,18,24]);
  mapped.policyWeights.fill(0);mapped.policyWeights[visual]=1;mapped.policyWeights[physics]=2;mapped.policyWeights[road]=3;
  sensors[visual]=.75;sensors[physics]=.4;sensors[road]=.2;
  near(F.sensorDrive(graph,mapped,sensors,k,F.MAP_PHYSICS_ADAPTER_GAIN),1.134);
  legacy.sensorMappingVersion=1;legacy.policyWeights.fill(0);legacy.policyWeights[oldChannel]=1;sensors[oldChannel]=.3;
  near(F.sensorDrive(graph,legacy,sensors,k,F.MAP_PHYSICS_ADAPTER_GAIN),.21);
  const normalizedOld=F.normalizeGenome({...legacy,sensorMappingVersion:undefined},graph.outputs.length);
  assert.equal(normalizedOld.sensorMappingVersion,1,'old checkpoints without an explicit mapping stay modulo-28');
  assert.throws(()=>F.normalizeGenome({...mapped,sensorMappingVersion:99},graph.outputs.length),/incompatibile/);
  assert.throws(()=>F.crossoverGenome(mapped,legacy,F.rng(19)),/mappature sensoriali diverse/);
});
test('Expanded ray and road adapter preserve previous checkpoints',()=>{
  const graph=F.compileGraph(data),modern=F.makeGenome(F.rng(7),graph.outputs.length),previous={encoder:Array.from({length:28},(_,i)=>i+1),readout:Array(graph.outputs.length*3).fill(.2),gain:1.5},legacy={encoder:Array.from({length:14},(_,i)=>i+1),readout:Array(graph.outputs.length*3).fill(.2),gain:1.5};
  assert.equal(F.normalizeGenome(modern,graph.outputs.length).encoder.length,56);
  const normalizedPrevious=F.normalizeGenome(previous,graph.outputs.length),normalizedLegacy=F.normalizeGenome(legacy,graph.outputs.length);
  assert.deepEqual(normalizedPrevious.encoder.slice(0,14),previous.encoder.slice(0,14));
  assert.deepEqual(normalizedLegacy.encoder.slice(0,7),legacy.encoder.slice(0,7));
  assert.equal(normalizedPrevious.encoder.slice(18).filter(value=>value!==0).length,14);
  assert.equal(normalizedLegacy.encoder.slice(18).filter(value=>value!==0).length,7);
  assert.equal(F.MAX_POPULATION,100);
});
test('Cars are ghosted to each other: overlapping bodies do not collide',()=>{
  const a=F.makeCar(track),b=F.makeCar(track);
  for(let i=0;i<20;i++){F.drive(track,a,[0,.5,0]);F.drive(track,b,[0,.5,0]);}
  assert.equal(a.alive,true);assert.equal(b.alive,true);assert.equal(a.x,b.x);assert.equal(a.y,b.y);assert.equal(a.reason,'');assert.equal(b.reason,'');
});
test('Real graph participates: removing ALL connections eliminates motor outputs',()=>{
  const genome=F.makeGenome(F.rng(77),graph.outputs.length),a=F.makeBrain(graph),b=F.makeBrain(graph),rays=[.2,.3,.5,1,.6,.4,.25];
  let connected,disconnected;
  for(let i=0;i<30;i++){connected=F.neuralStep(graph,a,genome,rays);disconnected=F.neuralStep(graph,b,genome,rays,true,false);}
  assert.ok(connected.some(v=>Math.abs(v)>0.1));assert.deepEqual(disconnected,[0,0,0]);
  assert.ok(graph.outputs.every(i=>b.activity[i]===0));
});
test('Neural outputs depend on sensed obstacles, not a constant route command',()=>{
  const genome=F.makeGenome(F.rng(77),graph.outputs.length),a=F.makeBrain(graph),b=F.makeBrain(graph);
  let left,right;
  for(let i=0;i<30;i++){left=F.neuralStep(graph,a,genome,[.1,.1,.2,.4,1,1,1]);right=F.neuralStep(graph,b,genome,[1,1,1,.4,.2,.1,.1]);}
  assert.ok(left.some((v,i)=>Math.abs(v-right[i])>0.01));
});
test('Brain off is an exact zero-command ablation, including warm neural state',()=>{
  const genome=F.makeGenome(F.rng(2),graph.outputs.length),brain=F.makeBrain(graph);
  F.neuralStep(graph,brain,genome,Array(7).fill(1));
  assert.deepEqual(F.neuralStep(graph,brain,genome,Array(7).fill(1),false),[0,0,0]);
  assert.ok(brain.activity.every(v=>v===0));
  const sim=new F.Simulation(data);sim.mode='off';sim.advance(9);
  assert.equal(sim.running,false);assert.ok(sim.cars.every(c=>c.distance===0));
});
test('0% mutation makes exact independent genome copies',()=>{
  const g=F.makeGenome(F.rng(1),4),copy=F.mutateGenome(g,F.rng(2),0);
  assert.deepEqual(g,copy);assert.notEqual(g.encoder,copy.encoder);assert.notEqual(g.readout,copy.readout);
});
test('Fixed-step speed multiplier: 1x and 4x produce identical simulated states',()=>{
  const a=new F.Simulation(data),b=new F.Simulation(data);b.speedMultiplier=4;
  for(let i=0;i<120;i++)a.advance(1/60);for(let i=0;i<30;i++)b.advance(1/60);
  near(a.elapsed,b.elapsed);assert.deepEqual(a.cars.map(c=>[c.x,c.y,c.heading,c.speed]),b.cars.map(c=>[c.x,c.y,c.heading,c.speed]));
});
test('30x speed uses the same fixed-step simulation',()=>{
  const a=new F.Simulation(data),b=new F.Simulation(data);b.speedMultiplier=30;
  for(let i=0;i<120;i++)a.advance(1/60);for(let i=0;i<4;i++)b.advance(1/60);
  near(a.elapsed,b.elapsed);assert.deepEqual(a.cars.map(c=>[c.x,c.y,c.heading,c.speed]),b.cars.map(c=>[c.x,c.y,c.heading,c.speed]));
});
test('Frame partitions cannot alter deterministic outcomes',()=>{
  const a=new F.Simulation(data),b=new F.Simulation(data);
  for(let i=0;i<120;i++)a.advance(1/60);for(let i=0;i<60;i++)b.advance(1/30);
  assert.deepEqual(a.cars.map(c=>[c.x,c.y,c.speed]),b.cars.map(c=>[c.x,c.y,c.speed]));
});
test('Pause freezes time, cars and neural state; reset restores seed',()=>{
  const a=new F.Simulation(data);a.advance(1);a.running=false;
  const snapshot=JSON.stringify(a.cars);a.advance(40);assert.equal(JSON.stringify(a.cars),snapshot);near(a.elapsed,1);
  a.reset();assert.equal(a.generation,1);assert.equal(a.elapsed,0);assert.equal(a.history.length,0);
  assert.deepEqual(a.cars.map(c=>c.genome),new F.Simulation(data).cars.map(c=>c.genome));
});
test('Generations have no automatic simulation-time limit',()=>{
  const catalog={circuits:[{id:'wide-test',name:'Wide test',description:'',points:[[0,0],[1000000,0],[1000000,1000000],[0,1000000]],halfWidth:1000000,revision:1}]};
  const sim=new F.Simulation(data,{circuits:catalog,circuitId:'wide-test',population:1});sim.mode='straight';
  for(let i=0;i<4000;i++)sim.tick();
  assert.equal('maxSeconds' in sim,false);assert.equal(sim.generation,1);assert.ok(sim.elapsed>60);assert.equal(sim.cars[0].alive,true);
});
test('Reward-trained recurrent V2 learns from a cold start without modifying anatomical topology',()=>{
  const compact=require('../legacy-models.js').buildV2(data),original=JSON.stringify(compact.edges),sim=new F.Simulation(compact,{population:32,mutation:.32});
  let practiceEpisodes=0;const safeProgressByGeneration=[],evolve=sim.evolve.bind(sim);
  sim.evolve=function(){const safe=this.cars.filter(F.isSafeLearningOutcome);safeProgressByGeneration.push(Math.max(0,...safe.map(car=>car.bestProgress)));return evolve();};
  for(let i=0;i<12;i++){const generation=sim.generation;let ticks=0;while(sim.generation===generation&&ticks++<14000)sim.tick();assert.ok(sim.generation>generation,'natural generation must finish');practiceEpisodes+=sim.practiceEvaluations||0;assert.ok((sim.practiceEvaluations||0)<=32);}
  assert.equal(sim.history.length,12);
  assert.equal(sim.history[0].laps,0);
  console.log('RL_TEST_BENCHMARK',JSON.stringify({model:'v2',seed:sim.seed,mutation:sim.mutation,generation1RawProgress:sim.history[0].bestProgress,generation12RawProgress:sim.history.at(-1).bestProgress,generation1SafeProgress:safeProgressByGeneration[0],generation12SafeProgress:safeProgressByGeneration.at(-1),episodes:sim.optimizer.episodes,warmStart:false}));
  assert.ok(safeProgressByGeneration.at(-1)>safeProgressByGeneration[0]*2,
    `safe progress did not double: seed=${sim.seed}, first=${safeProgressByGeneration[0]}, final=${safeProgressByGeneration.at(-1)}`);
  assert.equal(sim.optimizer.updates,12);assert.ok(sim.optimizer.episodes>=24+practiceEpisodes);assert.ok(sim.optimizer.episodes<=384+practiceEpisodes,'ranked generation outcomes and bounded practice episodes feed the optimizer; only safe rollouts can be selected as parents');
  assert.equal(JSON.stringify(compact.edges),original);
});
