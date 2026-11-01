'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const F=require('../simulation.js'),P=require('../progress-save.js'),Legacy=require('../legacy-models.js'),data=require('../data/connectome.json'),catalog=require('../data/circuits.json');
const {DesktopEngine}=require('../../desktop/engine.cjs');
const VERSION=require('../../package.json').version,clone=x=>JSON.parse(JSON.stringify(x));
function simulation(options={}){return new F.Simulation(Legacy.buildV2(data),{population:4,circuits:catalog,circuitId:'monza',...options});}
function learned(){const s=simulation();for(let i=0;i<3;i++){s.advance(.2);for(const car of s.cars){car.alive=false;car.reason='ferma / senza progresso';car.rewardState.finalized=true;}s.evolve();}s.running=false;return s;}
function validate(p,s){return P.validatePayload(p,{graph:s.graph,circuits:s.circuits});}
test('File round-trip preserves exact app version, format, model and checksum',async()=>{
  const s=learned(),p=P.fromSimulation(s),text=await P.encode(p,VERSION),file=await P.decode(text,VERSION);
  assert.equal(file.appVersion,VERSION);assert.equal(file.format,P.FORMAT);assert.equal(file.schema,1);assert.equal(file.checksum.value.length,64);assert.deepEqual(file.payload,p);validate(file.payload,s);
  assert.equal('safeLearningFrontier' in p.workers[0].state,false,'the derived frontier stays outside the shareable save schema');
  assert.match(P.filename(p,VERSION),new RegExp(VERSION.replaceAll('.','\\.')+'.*v2.*monza.*gen4\\.malecns-save$'));
});
const [major,minor,patch]=VERSION.split('.').map(Number);
for(const version of [`${major}.${minor}.${patch-1}`,`${major}.${minor}.${patch+1}`,`${major}.${minor+1}.0`,VERSION+'-beta'])test('Reject exact-version mismatch: '+version,async()=>{
  const file=await P.encode(P.fromSimulation(simulation()),version);await assert.rejects(P.decode(file,VERSION),/richiede esattamente/);
});
test('Checksum covers header and training content; whitespace is harmless',async()=>{
  const text=await P.encode(P.fromSimulation(simulation()),VERSION),file=JSON.parse(text);
  assert.equal((await P.decode(JSON.stringify(file),VERSION)).checksum.value,file.checksum.value);
  file.payload.workers[0].state.generation++;await assert.rejects(P.decode(JSON.stringify(file),VERSION),/checksum/);
  const header=JSON.parse(text);header.savedAt='2026-09-30T12:00:00.000Z';if(header.savedAt===JSON.parse(text).savedAt)header.savedAt='2026-09-29T12:00:00.000Z';await assert.rejects(P.decode(JSON.stringify(header),VERSION),/checksum/);
});
test('Malformed, oversized, unknown-schema and hostile-key files are rejected',async()=>{
  await assert.rejects(P.decode('{broken',VERSION),/non leggibile/);
  await assert.rejects(P.decode(' '.repeat(P.MAX_BYTES+1),VERSION),/troppo grande/);
  const file=JSON.parse(await P.encode(P.fromSimulation(simulation()),VERSION));file.schema=99;await assert.rejects(P.decode(JSON.stringify(file),VERSION),/Formato/);
  file.schema=1;file.extra='not allowed';await assert.rejects(P.decode(JSON.stringify(file),VERSION),/File non valido/);
  await assert.rejects(P.decode('[1,2]',VERSION),/File non valido/);
});
test('Capture observes state without RNG, brain, optimizer or car mutations',()=>{
  const s=learned();s.running=true;s.advance(.12);
  const rng=s.random.getState(),cars=clone(s.cars),optimizer=clone(s.optimizer),history=clone(s.history);
  const captured=P.capture(s);assert.equal(s.random.getState(),rng);assert.deepEqual(clone(s.cars),cars);assert.deepEqual(clone(s.optimizer),optimizer);assert.deepEqual(clone(s.history),history);
  captured.genomes[0].encoder[0]=8;assert.notEqual(captured.genomes[0].encoder[0],s.cars[0].genome.encoder[0]);
});
test('Restore keeps optimizer, all genomes, archive, champion, history and settings',()=>{
  const source=learned();source.mutation=.23;source.speedMultiplier=7.5;source.running=true;source.advance(.3);
  const state=P.capture(source),target=simulation({circuitId:'le-mans',population:8});P.restore(target,state);
  const after=P.capture(target);assert.deepEqual({...after,elapsedAtSave:state.elapsedAtSave},state);
  assert.equal(target.mutation,.23,'restoring an existing session keeps its saved mutation instead of adopting the fresh-session default');
  assert.ok(target.optimizerSampleIds instanceof Set);assert.equal(target.optimizerSampleIds.size,0,'saved genomes have no serialized ES sample provenance');
  assert.equal(target.running,false);assert.equal(target.mode,'connectome');assert.equal(target.elapsed,0);assert.equal(target.ticks,0);assert.equal(target.accumulator,0);assert.ok(state.elapsedAtSave>0);
  assert.deepEqual(target.safeLearningFrontier,{progress:0,laps:0,lapTime:null},'saved archive scores must be revalidated by live episodes before advancing the safe frontier');
  assert.equal(target.archiveRevalidationPending,true,'the imported champion score is not trusted until its genome is re-evaluated');
  assert.equal(target.optimizer.updates,source.optimizer.updates);assert.equal(target.history.length,3);assert.equal(target.cars.length,4);assert.equal(target.circuitId,'monza');
  const start=F.makeCar(target.track,0);assert.equal(target.cars[0].x,start.x);assert.equal(target.cars[0].y,start.y);assert.equal(target.cars[0].vehicle.speedMps,0);
  assert.equal(target.championStats.bestLapTime,Infinity);assert.equal(target.hallOfFame[0].bestLapTime,Infinity);
  for(let i=0;i<1000;i++)assert.equal(source.random(),target.random());
});
test('Safe progress metrics are validated, round-trip, and remain optional for older history',()=>{
  const s=simulation();s.evolve();const entry=s.history.at(-1),state=P.capture(s);
  assert.ok(Number.isFinite(entry.bestSafeProgress));assert.ok(Number.isFinite(entry.meanSafeProgress));
  assert.deepEqual(P.capture(s),state);
  const older=clone(state);for(const row of older.history){delete row.bestSafeProgress;delete row.meanSafeProgress;}
  assert.doesNotThrow(()=>P.validateTraining(older,s.graph,s.circuits),'older saves without the optional metrics remain readable');
  const mismatched=clone(state);mismatched.history.at(-1).bestSafeProgress=mismatched.history.at(-1).bestProgress+1;
  assert.throws(()=>P.validateTraining(mismatched,s.graph,s.circuits),/superiore al massimo fisico/);
  const incomplete=clone(state);delete incomplete.history.at(-1).meanSafeProgress;
  assert.throws(()=>P.validateTraining(incomplete,s.graph,s.circuits),/incompleto/);
});
test('Restore does not infer current safety from archive rows that omit terminal outcomes',()=>{
  const source=learned(),state=P.capture(source),target=simulation(),genome=clone(state.genomes[0]);
  state.learningFrontier={progress:1200,laps:2,lapTime:40};
  state.hallOfFame=[
    {genome:clone(genome),fitness:-10,progress:450,bestProgress:450,laps:0,bestLapTime:null},
    {genome:clone(genome),fitness:-20,progress:400,bestProgress:400,laps:2,bestLapTime:100},
    {genome:clone(genome),fitness:-30,progress:500,bestProgress:500,laps:1,bestLapTime:90}
  ];
  P.restore(target,state);
  assert.deepEqual(target.safeLearningFrontier,{progress:0,laps:0,lapTime:null});
});
test('A progress-3 save remains loadable and continues its original reward revision',()=>{
  const source=learned(),state=P.capture(source);state.rewardRevision=F.Rewards.LEGACY_REVISION;for(const entry of state.history)entry.rewardRevision=F.Rewards.LEGACY_REVISION;
  const target=simulation();P.restore(target,state);assert.equal(target.rewardRevision,F.Rewards.LEGACY_REVISION);assert.ok(target.cars.every(car=>car.rewardRevision===F.Rewards.LEGACY_REVISION));
  assert.deepEqual({...P.capture(target),elapsedAtSave:state.elapsedAtSave},state);
  target.evolve();assert.equal(target.history.at(-1).rewardRevision,F.Rewards.LEGACY_REVISION);assert.ok(target.cars.every(car=>car.rewardRevision===F.Rewards.LEGACY_REVISION));
});
test('A progress-4 save remains loadable after the newer sensitive-brake reward is added',()=>{
  const source=learned(),state=P.capture(source);state.rewardRevision=F.Rewards.PREVIOUS_REVISION;for(const entry of state.history)entry.rewardRevision=F.Rewards.PREVIOUS_REVISION;
  const target=simulation();P.restore(target,state);
  assert.equal(target.rewardRevision,F.Rewards.PREVIOUS_REVISION);assert.ok(target.cars.every(car=>car.rewardRevision===F.Rewards.PREVIOUS_REVISION));
  assert.deepEqual({...P.capture(target),elapsedAtSave:state.elapsedAtSave},state);
  target.evolve();assert.equal(target.history.at(-1).rewardRevision,F.Rewards.PREVIOUS_REVISION);assert.ok(target.cars.every(car=>car.rewardRevision===F.Rewards.PREVIOUS_REVISION));
});
test('A progress-6 save keeps its original reward revision after the slow-stop fix',()=>{
  const source=learned(),state=P.capture(source);state.rewardRevision=F.Rewards.MISSING_LAP_REVISION;
  for(const entry of state.history)entry.rewardRevision=F.Rewards.MISSING_LAP_REVISION;
  const target=simulation();P.restore(target,state);
  assert.equal(target.rewardRevision,F.Rewards.MISSING_LAP_REVISION);assert.ok(target.cars.every(car=>car.rewardRevision===F.Rewards.MISSING_LAP_REVISION));
  assert.deepEqual({...P.capture(target),elapsedAtSave:state.elapsedAtSave},state);
  target.evolve();assert.equal(target.history.at(-1).rewardRevision,F.Rewards.MISSING_LAP_REVISION);
});
test('Empty training records keep the no-record sentinel, not a fake zero score',()=>{
  const s=simulation(),state=P.capture(s),target=simulation();assert.equal(state.bestEver,null);assert.equal(state.champion,null);P.restore(target,state);assert.equal(target.bestEver,-Infinity);assert.equal(target.champion,null);
});
test('Bad payload cannot replace existing simulation state',()=>{
  const s=learned(),before=P.capture(s),bad=clone(before);bad.optimizer.mean[0]=NaN;assert.throws(()=>P.restore(s,bad));assert.deepEqual(P.capture(s),before);
  for(const mutate of [p=>p.graph.nodes++,p=>p.vehicleRevision='wrong',p=>p.modelId='v3',p=>p.circuitId='other',p=>p.workers[0].index=1,p=>p.workers=[]]){const p=P.fromSimulation(s);mutate(p);assert.throws(()=>validate(p,s));}
});
test('Reject invalid weights, missing genomes, bad stats and unknown fields',()=>{
  const s=learned();
  for(const mutate of [
    t=>t.genomes[0].policyWeights=[1],t=>t.genomes[0].encoder[0]=Infinity,t=>t.genomes[0].gain=0,t=>t.genomes.pop(),
    t=>t.genomes[0].fastMotor=[1],t=>t.optimizer.sigma[0]=0,t=>t.championStats.fitness++,t=>t.champion=null,
    t=>t.history[0].generation=999,t=>t.circuitRevision++,t=>t.population=101,t=>t.rngState=-1,t=>t.hallOfFame[0].laps=3
  ]){const state=P.capture(s);mutate(state);assert.throws(()=>P.validateTraining(state,s.graph,s.circuits));}
});
test('100-agent genomes are all saved, without reducing the neural graph',async()=>{
  const s=simulation({population:100}),p=P.fromSimulation(s);assert.equal(p.workers[0].state.genomes.length,100);validate(p,s);
  const file=await P.decode(await P.encode(p,VERSION),VERSION);assert.equal(file.payload.workers[0].state.genomes[99].policyWeights.length,202);assert.equal(file.payload.graph.nodes,s.graph.n);
});
test('Only training mode is exported; manual test mode has a clear error',()=>{
  const s=simulation();s.mode='off';assert.throws(()=>P.capture(s),/modalità di apprendimento/);s.mode='straight';assert.throws(()=>P.capture(s),/test motore/);
});
test('Worker states retain independent RNGs, generations and optimizer values',()=>{
  const a=learned(),b=simulation({seed:200});b.evolve();const p=P.fromSimulation(a);p.workers.push({index:1,state:P.capture(b)});validate(p,a);assert.notEqual(p.workers[0].state.rngState,p.workers[1].state.rngState);assert.notEqual(p.workers[0].state.generation,p.workers[1].state.generation);
  assert.throws(()=>P.validatePayload(p,{graph:a.graph,circuits:a.circuits,maxWorkers:1}),/worker/);
  p.workers[1].state.mutation=.3;assert.throws(()=>validate(p,a),/non coerenti/);
});
test('Every installed model has a validated portable training descriptor',async()=>{
  const engine=new DesktopEngine(path.resolve(__dirname,'..'),()=>{},()=>{});
  for(const id of ['v2','v3','v4']){const graph=await engine.progressGraph(id),s=simulation(),p=P.fromSimulation(s);p.modelId=id;p.graph=P.compatibleGraph(graph);await engine.validateProgress(p);assert.equal(p.graph.nodes,{v2:1121,v3:7721,v4:166700}[id]);}
});
test('Real two-worker export/restore and invalid load preserve training isolation',async()=>{
  const errors=[],engine=new DesktopEngine(path.resolve(__dirname,'..'),()=>{},error=>errors.push(error.message));
  try{
    await engine.start({modelId:'v2',workerCount:2,population:4,circuitId:'monza',running:false,mutation:.22,speedMultiplier:3.5});
    await engine.command({type:'evolve'});await engine.command({type:'evolve'});
    // Drain the already-issued island champion messages before comparing a
    // paused trial; export itself does not freeze asynchronous migration.
    await engine.exportProgress();await engine.exportProgress();
    const p=await engine.exportProgress();assert.equal(p.workers.length,2);assert.ok(p.workers.every(w=>w.state.generation===3&&w.state.history.at(-1).noLapCount===4&&w.state.history.at(-1).rewardBreakdown.penalties.noLap>0),'manual generation endings apply the missing-lap penalty to every car');
    const oldSession=engine.sessionId,bad=clone(p);bad.workers[1].state.genomes[0].encoder=[];await assert.rejects(engine.restoreProgress(bad));assert.equal(engine.sessionId,oldSession);assert.deepEqual(await engine.exportProgress(),p);
    await engine.command({type:'setMode',value:'straight'});await engine.restoreProgress(p);assert.notEqual(engine.sessionId,oldSession);assert.equal(engine.options.running,false);assert.deepEqual(await engine.exportProgress(),p);assert.deepEqual(errors,[]);
  }finally{await engine.stop();}
});
test('RNG sequence is unchanged from the established generator, including high counter bits',()=>{
  function prior(seed){return()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
  for(const seed of [1,7717,0xffffffff,1e17]){const a=F.rng(seed),b=prior(seed);for(let i=0;i<100000;i++)assert.equal(a(),b());const state=a.getState(),resume=F.rng(state);assert.equal(a.getState(),state);for(let i=0;i<100;i++)assert.equal(a(),resume());}
});
