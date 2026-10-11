'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const F=require('../simulation.js'),State=require('../desktop-state.js'),Legacy=require('../legacy-models.js'),source=require('../data/connectome.json');
const tiny={full:true,n:4,inputs:Uint32Array.from([0]),outputs:Uint32Array.from([3]),solver:{activeNeuronBudget:3}};
const bytes=brain=>Object.values(brain).reduce((sum,value)=>sum+(value?.byteLength||0),0);

test('GPU mirror removes CPU scratch arrays without dropping neural activity',()=>{
  const brain=State.mirrorBrain(tiny);
  assert.equal(brain.activity.length,4);assert.equal(brain.active.length,3);
  assert.equal(brain.next,undefined);assert.equal(brain.sum,undefined);assert.equal(brain.marked,undefined);
  F.applyNeuralState(tiny,brain,[0,3],[.25,-.5]);
  assert.equal(brain.activeCount,2);assert.deepEqual(Array.from(brain.activity),[.25,0,0,-.5]);
  assert.ok(bytes(brain)<bytes(F.makeBrain(tiny)));
});
test('Uninspected renderer agents have no activity or solver allocation',()=>{
  assert.equal(bytes(State.mirrorBrain(tiny,false)),0);
  const dense=State.mirrorBrain({full:false,n:7721},false);
  assert.equal(bytes(dense),0);assert.equal(dense.activeCount,undefined);
});
test('CPU fallback restores the actual known GPU state and motor readout',()=>{
  const brain=State.mirrorBrain(tiny);F.applyNeuralState(tiny,brain,[0,3],[.25,-.5]);
  const restored=State.restoreBrain(F,tiny,brain),reference=F.makeBrain(tiny);
  F.applyNeuralState(tiny,reference,[0,3],[.25,-.5]);
  assert.deepEqual(restored,reference);
  const genome={readout:[1,.4,-.6]};
  assert.deepEqual(F.neuralOutputsFromBrain(tiny,restored,genome),F.neuralOutputsFromBrain(tiny,reference,genome));
});
function packet(capacity,population,inspected){
  const layout=State.packetLayout(capacity,2,3),words=new Uint32Array(layout.bytes/4),values=new Float32Array(words.buffer,layout.valuesBase*4,layout.slots);
  for(let i=0;i<population;i++){
    words[i]=3;
    for(let slot=0;slot<2;slot++){words[layout.indicesBase+i*2+slot]=i*10+slot;values[i*2+slot]=i+.25*slot;}
  }
  for(let slot=0;slot<3;slot++){words[layout.indicesBase+capacity*2+slot]=inspected*10+slot;values[capacity*2+slot]=inspected+.25*slot;}
  return {words,layout};
}
test('GPU packet keeps all 100 motor readouts and the inspected A-100 atlas',()=>{
  const {words,layout}=packet(100,100,99),request={agentIds:Array.from({length:100},(_,i)=>i),inspectedAgentId:99};
  const agents=State.decodePacket(words,layout,request,100);
  assert.equal(agents.length,100);assert.equal(agents[0].active.length,2);
  assert.deepEqual(Array.from(agents[99].active),[990,991,992]);assert.deepEqual(Array.from(agents[99].values),[99,99.25,99.5]);
  assert.equal(State.packetLayout(100,64,8192).bytes,117136);
});
test('GPU packet resolves nonsequential IDs and a population below capacity',()=>{
  const {words,layout}=packet(100,4,2),request={agentIds:[7,11,25,35],inspectedAgentId:25};
  const agents=State.decodePacket(words,layout,request,4);
  assert.equal(agents[2].id,25);assert.equal(agents[2].active.length,3);
  assert.deepEqual(Array.from(agents[2].active),[20,21,22]);
  assert.deepEqual(Array.from(agents[3].values),[3,3.25]);
});
test('Incomplete GPU packet fails closed',()=>{
  assert.throws(()=>State.decodePacket(new Uint32Array(2),State.packetLayout(100,64,8192),{},100),/incompleto/);
});
test('Worker scheduler rests in pause and does not skip any due fixed step',()=>{
  assert.equal(State.nextDelay(false,0,30,F.DT),50);
  assert.equal(State.nextDelay(true,F.DT,30,F.DT),0);
  assert.equal(State.nextDelay(true,2*F.DT,1,F.DT),0);
  assert.equal(State.nextDelay(true,0,1,F.DT),17);
  assert.equal(State.nextDelay(true,0,30,F.DT),1);
});
for(const model of ['v2','v3'])test(model+' supports 100 independent policies in one generation',()=>{
  const data=model==='v2'?Legacy.buildV2(source):Legacy.tagV3(source),sim=new F.Simulation(data,{population:100,seed:7717});
  assert.equal(sim.population,100);assert.equal(sim.cars.length,100);
  assert.equal(new Set(sim.cars.map(car=>car.brain)).size,100);
  assert.equal(new Set(sim.cars.map(car=>car.genome)).size,100);
  const oldBrains=new Set(sim.cars.map(car=>car.brain));sim.evolve();
  assert.equal(sim.generation,2);assert.equal(sim.cars.length,100);
  assert.ok(sim.cars.every(car=>!oldBrains.has(car.brain)));
});
function bridge(){
  const context={FlySim:{...F},MaleCNSDesktopState:State,desktopCompute:{onGpuRequest(){}},Float32Array,Float64Array,Uint32Array,ArrayBuffer,DataView,CustomEvent:class{},dispatchEvent(){}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../desktop-runtime.js'),'utf8'),context);
  const sim=Object.create(context.FlySim.DesktopSimulation.prototype);
  Object.assign(sim,{graph:tiny,_population:4,_pendingPopulation:null,_speedMultiplier:1,_pendingSpeedMultiplier:null,_running:false,_mode:'connectome',generation:2,elapsed:1,history:[{best:10}],learningStats:{sigma:.1},cars:[],engine:{},circuitId:'lab'});
  return sim;
}
test('GPU-status partial snapshot preserves paused simulation and history',()=>{
  const sim=bridge(),history=sim.history,stats=sim.learningStats;
  sim.applySnapshot({workerIndex:0,engine:{gpu:{state:'active'}}});
  assert.equal(sim.history,history);assert.equal(sim.learningStats,stats);assert.equal(sim.running,false);assert.equal(sim.generation,2);
});
test('Only the inspected car gets a dense activity mirror; sparse updates clear stale cells',()=>{
  const sim=bridge(),selected=sim.inflateCar({id:99,brain:{active:[0,3],values:[.25,-.5]}});
  assert.equal(selected.brainSnapshot,true);assert.equal(selected.brain.activity.length,4);
  const updated=sim.inflateCar({id:99,brain:{active:[1],values:[.75]}},selected.brain);
  assert.deepEqual(Array.from(updated.brain.activity),[0,.75,0,0]);
  assert.equal(updated.brain,selected.brain);
  const hidden=sim.inflateCar({id:0,brain:null},selected.brain);
  assert.equal(hidden.brainSnapshot,false);assert.equal(bytes(hidden.brain),0);
});
test('Late population snapshot cannot undo the requested 100 agents',()=>{
  const sim=bridge();sim.population=100;
  sim.applySnapshot({population:4});assert.equal(sim.population,100);assert.equal(sim._pendingPopulation,100);
  sim.applySnapshot({population:100});assert.equal(sim.population,100);assert.equal(sim._pendingPopulation,null);
});
test('Reusing an already sensed GPU frame preserves sensors, neural outputs and physics exactly',()=>{
  const data=Legacy.tagV3(source),options={population:4,seed:7717},reference=new F.Simulation(data,options),optimized=new F.Simulation(data,options);
  for(let tick=0;tick<18;tick++){
    const overrides=new Map(reference.cars.map(car=>[car.id,{active:reference.graph.outputs,values:Float32Array.from([.25,-.1,.3,.15])}]));
    if(optimized.ticks%optimized.neuralInterval===0)for(const car of optimized.cars){car.inputs=F.sense(optimized.track,car);car.physicsInputs=F.physicsSense(car,optimized.track);car.sensorVector=car.inputs.concat(car.physicsInputs);}
    reference.tick(overrides);optimized.tick(overrides,true);
  }
  for(let i=0;i<4;i++)for(const field of ['x','y','heading','speed','outputs','inputs','physicsInputs','fitness','progress'])assert.deepEqual(optimized.cars[i][field],reference.cars[i][field]);
});
test('Resizing the worker pool retains the requested population, speed and pause',async()=>{
  const {DesktopEngine}=require('../../desktop/engine.cjs'),engine=new DesktopEngine('',()=>{},()=>{}),messages=[];
  engine.options={population:16,speedMultiplier:1,running:true};engine.workers=[{postMessage:m=>messages.push(m)}];
  await engine.command({type:'setPopulation',value:100});await engine.command({type:'setSpeed',value:30});await engine.command({type:'pause',value:false});
  let restarted;engine.start=async options=>{restarted=options;};
  await engine.command({type:'setWorkerCount',value:2});
  assert.equal(restarted.population,100);assert.equal(restarted.speedMultiplier,30);assert.equal(restarted.running,false);assert.equal(messages.length,3);
});
test('Stale worker snapshots cannot undo pending pause or network-off commands',()=>{
  const sim=bridge();sim.post=()=>{};sim.running=false;sim.mode='off';
  sim.applySnapshot({running:true,mode:'connectome'});
  assert.equal(sim.running,false);assert.equal(sim.mode,'off');
  sim.applySnapshot({running:false,mode:'off'});
  assert.equal(sim._pendingRunning,null);assert.equal(sim._pendingMode,null);
});

test('Paused GPU inspection packs existing activity without running neural passes',async()=>{
  const context={FlySim:{...F},MaleCNSDesktopState:State,desktopCompute:{onGpuRequest(){}},Float32Array,Float64Array,Uint32Array,ArrayBuffer,DataView};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../desktop-runtime.js'),'utf8'),context);
  const backend=Object.create(context.FlySim.DesktopGpuNeuralBackend.prototype),{words,layout}=packet(4,4,2),commands=[];
  Object.assign(backend,{disposed:false,lastPopulation:4,stateDirection:1,packetLayout:layout,readoutCount:2,activeBudget:3,adapter:{vendor:'test'},init:async()=>{},writeParams:(...args)=>commands.push(['params',...args]),pipelines:{pack:'pack'},mapMode:{READ:1},packetBuffer:{},packetReadback:{mapAsync:async()=>{},getMappedRange:()=>words.buffer,unmap(){}},device:{createCommandEncoder:()=>({beginComputePass:()=>({end(){}}),copyBufferToBuffer:()=>commands.push(['copy'])})},dispatch:(_p,_pipeline,name,...args)=>commands.push([name,...args]),submit:async()=>commands.push(['submit'])});
  const result=await backend.inspect({population:4,inspectedAgentId:2,agentIds:[0,1,2,3]});
  assert.equal(result.readOnly,true);assert.equal(result.agents[2].active.length,3);assert.equal(backend.stateDirection,1);assert.equal(backend.lastPopulation,4);
  assert.deepEqual(commands.map(c=>c[0]),['params','pack','copy','submit']);
  await assert.rejects(()=>backend.inspect({population:100}),/non ancora disponibile/);
});

test('GPU observation and control requests use one serial readback queue',async()=>{
  const context={FlySim:{...F},MaleCNSDesktopState:State,desktopCompute:{onGpuRequest(){}},Float32Array,Float64Array,Uint32Array,ArrayBuffer,DataView};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../desktop-runtime.js'),'utf8'),context);
  const backend=Object.create(context.FlySim.DesktopGpuNeuralBackend.prototype),order=[];
  let release;backend.handleOne=async request=>{order.push('start'+request.id);if(request.id===1)await new Promise(resolve=>{release=resolve;});order.push('end'+request.id);return request.id;};
  const first=backend.handle({id:1}),second=backend.handle({id:2,readOnly:true});await Promise.resolve();assert.deepEqual(order,['start1']);release();
  assert.equal(await first,1);assert.equal(await second,2);assert.deepEqual(order,['start1','end1','start2','end2']);
});
test('Snapshots from another model or engine session cannot overwrite an imported trial',()=>{
  const sim=bridge();sim.modelId='v4';sim._sessionId='new-session';
  sim.applySnapshot({generation:99,engine:{sessionId:'old-session',modelId:'v4'}});assert.equal(sim.generation,2);
  sim.applySnapshot({generation:99,engine:{sessionId:'new-session',modelId:'v2'}});assert.equal(sim.generation,2);
  sim.applySnapshot({generation:7,engine:{sessionId:'new-session',modelId:'v4'}});assert.equal(sim.generation,7);
});
test('Pending mutation control is sent to workers and is not undone by a late snapshot',()=>{
  const sim=bridge(),messages=[];sim.post=m=>messages.push(m);sim._mutation=.16;sim._pendingMutation=null;
  sim.mutation=.23;assert.equal(messages.length,1);assert.equal(messages[0].type,'setMutation');assert.equal(messages[0].value,.23);
  sim.applySnapshot({mutation:.16});assert.equal(sim.mutation,.23);assert.equal(sim._pendingMutation,.23);
  sim.applySnapshot({mutation:.23});assert.equal(sim._pendingMutation,null);assert.equal(sim.mutation,.23);
});
test('Old GPU responses cannot be delivered to replacement workers',()=>{
  const {DesktopEngine}=require('../../desktop/engine.cjs'),engine=new DesktopEngine('',()=>{},()=>{}),messages=[];
  engine.sessionId='new-session';engine.workers=[{postMessage:m=>messages.push(m)}];
  engine.gpuResponse({sessionId:'old-session',workerIndex:0,requestId:'0:1',available:true});assert.equal(messages.length,0);
  engine.gpuResponse({sessionId:'new-session',workerIndex:0,requestId:'0:1',available:true});assert.equal(messages.length,1);
});
test('Legitimate pool restart keeps the same observer but an unrelated import does not',()=>{
  const sim=bridge();sim.modelId='v4';sim._sessionId='old';sim._rendererToken='same-owner';
  sim.applySnapshot({generation:8,engine:{sessionId:'new',rendererToken:'same-owner',modelId:'v4'}});assert.equal(sim.generation,8);assert.equal(sim._sessionId,'new');
  sim.applySnapshot({generation:99,engine:{sessionId:'other',rendererToken:'other-owner',modelId:'v4'}});assert.equal(sim.generation,8);assert.equal(sim._sessionId,'new');
});
