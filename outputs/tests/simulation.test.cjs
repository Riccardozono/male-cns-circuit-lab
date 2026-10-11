const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const F=require('../simulation.js'),data=require('../data/connectome.json'),manifest=require('../data/provenance.json');
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
test('Imported champion is carried into the next generation',()=>{
  const sim=new F.Simulation(data,{population:3}),champion=F.cloneGenome(sim.cars[1].genome);
  sim.adoptChampion(champion);sim.evolve();
  assert.deepEqual(sim.cars[1].genome,champion);
});
test('Raw progress remains observable but does not override penalized fitness elites',()=>{
  const sim=new F.Simulation(data,{population:4,mutation:.12});
  const winner=sim.cars[0],progressLeader=sim.cars[2];
  for(const car of sim.cars) {car.reward=0;car.penalty=900;car.fitness=-900;car.bestProgress=0;car.alive=false;car.reason='test';car.laps=1;}
  winner.reward=300;winner.penalty=100;winner.fitness=200;winner.bestProgress=40;
  sim.cars[1].reward=100;sim.cars[1].penalty=100;sim.cars[1].fitness=0;
  progressLeader.reward=80;progressLeader.penalty=900;progressLeader.fitness=-820;progressLeader.bestProgress=420;
  sim.history.push({bestProgress:420,bestLapTime:null});sim.stagnation=1;
  sim.evolve();
  assert.equal(sim.history.at(-1).best,200);
  assert.equal(sim.history.at(-1).bestProgress,420);
  assert.deepEqual(sim.cars[0].genome,winner.genome);
  assert.notDeepEqual(sim.cars[1].genome,progressLeader.genome);
  assert.equal(sim.history.at(-1).meanProgress,(40+420+0+0)/4);
});
test('Genome crossover preserves valid adapter shapes',()=>{
  const a={encoder:[1,2,3],readout:[4,5,6],gain:1},b={encoder:[7,8,9],readout:[10,11,12],gain:2};
  const child=F.crossoverGenome(a,b,F.rng(13));
  assert.equal(child.encoder.length,3);assert.equal(child.readout.length,3);assert.ok(child.gain===1||child.gain===2);
  assert.ok(child.encoder.every(value=>a.encoder.includes(value)||b.encoder.includes(value)));
  assert.ok(child.readout.every(value=>a.readout.includes(value)||b.readout.includes(value)));
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
  const compact=require('../legacy-models.js').buildV2(data),original=JSON.stringify(compact.edges),sim=new F.Simulation(compact,{population:32,mutation:.16});
  for(let i=0;i<12;i++){const generation=sim.generation;let ticks=0;while(sim.generation===generation&&ticks++<14000)sim.tick();assert.ok(sim.generation>generation,'natural generation must finish');}
  assert.equal(sim.history.length,12);
  assert.equal(sim.history[0].laps,0);
  assert.ok(sim.history.at(-1).bestProgress>sim.history[0].bestProgress*2);
  assert.equal(sim.optimizer.updates,12);assert.equal(sim.optimizer.episodes,384);
  assert.equal(JSON.stringify(compact.edges),original);
  console.log('RL_TEST_BENCHMARK',JSON.stringify({model:'v2',seed:sim.seed,generation1Progress:sim.history[0].bestProgress,generation12Progress:sim.history.at(-1).bestProgress,episodes:sim.optimizer.episodes,warmStart:false}));
});
