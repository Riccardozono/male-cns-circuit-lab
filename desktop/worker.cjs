'use strict';

const {parentPort, workerData} = require('node:worker_threads');
const {performance} = require('node:perf_hooks');
const {randomUUID}=require('node:crypto');

const constructors = {float64: Float64Array, float32: Float32Array, int32: Int32Array, uint32: Uint32Array, uint8: Uint8Array, int8: Int8Array};
const F = require(workerData.simulationPath);
const State=require(require('node:path').join(require('node:path').dirname(workerData.simulationPath),'desktop-state.js'));
const Progress=require(require('node:path').join(require('node:path').dirname(workerData.simulationPath),'progress-save.js'));
const ModelTest=require(require('node:path').join(require('node:path').dirname(workerData.simulationPath),'model-test.js'));
const data = workerData.modelData || {...workerData.metadata, compact: true};
if (!workerData.modelData) {
  for (const [name, descriptor] of Object.entries(workerData.metadata.arrays)) {
    data[name] = new constructors[descriptor.dtype](workerData.sharedBinary, descriptor.offset, descriptor.length);
  }
}

let sim;
let modelTest=null;
let speed = workerData.speedMultiplier;
let last = performance.now();
let lastReport = 0;
let stopped = false;
const gpuPreferred = Boolean(workerData.gpuPreferred);
let gpuEnabled = gpuPreferred;
let gpuState = gpuPreferred ? 'waiting' : 'cpu-only';
let gpuResetPending = true;
let gpuRequestSequence = 0;
const gpuPending = new Map();
let gpuGeneration = 1;
let lastGpuReport=0;
let inspectedAgentId=0;
let neuralEpoch=0;
let pendingInspectedRead=false;
const gpuSessionId=randomUUID();

function reportGpu(status = {}) {
  if (!gpuPreferred) return;
  gpuState = status.state || gpuState;
  parentPort.postMessage({
    type: 'gpu-status',
    status: {
      state: gpuState,
      backend: gpuState === 'active' ? 'WebGPU' : null,
      ...status
    }
  });
}

function compactBrain(brain) {
  if (!Number.isInteger(brain?.activeCount)) {
    return {active: [], values: brain.activity.slice(), activeCount: brain?.activity?.length || 0, dense: true};
  }
  const count = Number.isInteger(brain?.activeCount) ? brain.activeCount : 0;
  const active = brain.active.slice(0,count);
  const values = Float32Array.from(active,index=>brain.activity[index]);
  return {active, values, activeCount: count};
}

function compactCar(car) {
  const inspected=car.id===inspectedAgentId;
  return {
    id: car.id,
    x: car.x, y: car.y, heading: car.heading, speed: car.speed, steer: car.steer, scale: car.scale,
    pixelsPerMeter:car.pixelsPerMeter,vehicle:F.Vehicle.telemetry(car.vehicle,inspected),
    footprintSensorsEnabled:car.footprintSensorsEnabled===true,
    alive: car.alive, reason: car.reason, distance: car.distance, progress: car.progress, bestProgress: car.bestProgress,diagnosticVehicle:Boolean(car.diagnosticVehicle),
    fitness: car.fitness, reward: car.reward, penalty: car.penalty, lastReward: car.lastReward, lastPenalty: car.lastPenalty,
    baseFitness:car.baseFitness,rewardRevision:car.rewardRevision,
    rewardBreakdown:inspected?car.rewardBreakdown:null,previousGenerationLapTime:car.previousGenerationLapTime,
    lapRegressionPenalty:car.lapRegressionPenalty,noLapPenalty:car.noLapPenalty,
    checkpoints:car.rewardState.nextCheckpoint-1,
    laps: car.laps, lastLapTime: car.lastLapTime, bestLapTime: car.bestLapTime,
    lifetime: car.lifetime, totalG: car.totalG, longitudinalG: car.longitudinalG, lateralG: car.lateralG,
    slipAngle: car.slipAngle, inputs: Array.from(car.inputs || []), physicsInputs: Array.from(car.physicsInputs || []),
    outputs: Array.from(car.outputs || []), trail: inspected?(car.trail || []).slice(-160):[],
    // A GPU motor-only mirror is not a complete atlas. Keep waiting until a
    // read-only observation or the next actual control step provides it.
    brain: inspected&&(!car.brain.external||car.brain.activeCount===0||car.brain.activeCount>sim.graph.learning.nodes.length)?compactBrain(car.brain):null
  };
}

function snapshot() {
  return {
    circuitId: sim.circuitId,
    population: sim.population,
    mutation: sim.mutation,
    speedMultiplier: sim.speedMultiplier,
    mode: sim.mode,
    running: sim.running,
    generation: sim.generation,
    elapsed: sim.elapsed,
    history: sim.history,
    bestEver: sim.bestEver,
    champion: sim.champion,
    championStats: sim.championStats,
    learningStats: sim.optimizer?.metrics()||null,
    modelTest:modelTest?.snapshot(performance.now())??null,
    cars: sim.cars.map(compactCar),
    workerIndex: workerData.index
  };
}

function report(force = false) {
  const now = performance.now();
  if (!force && now - lastReport < 250) return;
  lastReport = now;
  if (workerData.index === 0) parentPort.postMessage({type: 'snapshot', snapshot: snapshot()});
  else parentPort.postMessage({type: 'metric', metric: {generation: sim.generation, bestEver: sim.bestEver, champion: sim.champion, championStats:sim.championStats, elapsed: sim.elapsed, workerIndex: workerData.index}});
}

function requestGpu(payload) {
  const requestId = gpuSessionId + '-' + String(++gpuRequestSequence);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      gpuPending.delete(requestId);
      reject(new Error('Timeout del backend WebGPU.'));
    }, 15000);
    gpuPending.set(requestId, {resolve, reject, timer});
    parentPort.postMessage({
      type: 'gpu-request',
      request: {...payload, requestId, workerIndex: workerData.index}
    });
  });
}

function makeGpuRequest() {
  const inputCount = sim.graph.inputs.length;
  const population = sim.cars.length;
  const drives = new Float32Array(population * inputCount);
  const gainGroups=sim.graph.learning.gainGroups;
  const gains = new Float32Array(population * gainGroups);
  const agentIds = sim.cars.map(car => car.id);
  const physicsGain = sim.circuitId === 'lab' ? F.PHYSICS_ADAPTER_GAIN : F.MAP_PHYSICS_ADAPTER_GAIN;
  for (let agent = 0; agent < population; agent++) {
    const car = sim.cars[agent];
    gains.set(F.synapticGains(sim.graph,car.genome),agent*gainGroups);
    if (!car.alive) continue;
    car.inputs = F.sense(sim.track, car);
    car.physicsInputs = F.physicsSense(car, sim.track);
    car.sensorVector = car.inputs.concat(car.physicsInputs);
    const offset = agent * inputCount;
    for (let k = 0; k < inputCount; k++) drives[offset + k] = F.sensorDrive(sim.graph, car.genome, car.sensorVector, k, physicsGain);
  }
  return {
    population,
    agentIds,
    inspectedAgentId,
    drives,
    gains,
    reset: gpuResetPending,
    iterations: sim.graph.solver?.iterationsPerControlTick ?? 4
  };
}

async function neuralGpuOverrides() {
  if (!gpuEnabled || sim.mode !== 'connectome' || !sim.graph.full || sim.ticks % sim.neuralInterval !== 0) return null;
  const epoch=neuralEpoch,response = await requestGpu(makeGpuRequest());
  if(epoch!==neuralEpoch){gpuResetPending=true;return null;}
  if (!response?.available) throw new Error(response?.error || 'Backend WebGPU non disponibile.');
  const inspectedAgent = response.agents?.find(agent=>Number(agent.id)===inspectedAgentId)||response.agents?.[0];
  const firstActiveCount = inspectedAgent?.active?.length || 0;
  const firstMaxActivity = inspectedAgent?.values?.length ? Math.max(...inspectedAgent.values.map(value => Math.abs(Number(value) || 0))) : 0;
  if (gpuState !== 'active') reportGpu({state: 'active', backend: response.backend || 'WebGPU', adapter: response.adapter || null, error: null, activeCount: firstActiveCount, maxActivity: firstMaxActivity});
  else if ((firstActiveCount || firstMaxActivity)&&performance.now()-lastGpuReport>=250) {reportGpu({adapter: response.adapter || null, activeCount: firstActiveCount, maxActivity: firstMaxActivity});lastGpuReport=performance.now();}
  gpuResetPending = false;
  const overrides = new Map();
  for (const agent of response.agents || []) {
    overrides.set(Number(agent.id), {
      active: agent.active || [],
      values: agent.values || []
    });
  }
  return overrides;
}

function disableGpu(error) {
  gpuEnabled = false;
  sim.brainFactory=F.makeBrain;
  for(const car of sim.cars)if(car.brain.external)car.brain=State.restoreBrain(F,sim.graph,car.brain);
  reportGpu({state: 'fallback', backend: null, error: error?.message || String(error)});
}

async function advanceDesktop(seconds) {
  if (!sim.running) return;
  if (!gpuEnabled || sim.mode !== 'connectome' || !sim.graph.full) {
    sim.accumulator+=Math.max(0,seconds)*sim.speedMultiplier;
    const started=performance.now();
    while(sim.accumulator>=F.DT-1e-10&&sim.running&&performance.now()-started<40){sim.tick();sim.accumulator-=F.DT;if(modelTest?.done){sim.running=false;report(true);}}
    return;
  }
  sim.accumulator += Math.max(0, seconds) * sim.speedMultiplier;
  const started=performance.now();
  while (sim.accumulator >= F.DT - 1e-10 && sim.running&&performance.now()-started<40) {
    const epoch=neuralEpoch;
    let overrides = null;
    if (sim.ticks % sim.neuralInterval === 0 && gpuEnabled) {
      try {
        overrides = await neuralGpuOverrides();
      } catch (error) {
        disableGpu(error);
      }
    }
    if(epoch!==neuralEpoch||!sim.running||sim.accumulator<F.DT-1e-10)return;
    sim.tick(overrides,Boolean(overrides));
    if(modelTest?.done){sim.running=false;report(true);}
    if (sim.generation !== gpuGeneration) {
      gpuGeneration = sim.generation;
      gpuResetPending = true;
    }
    sim.accumulator -= F.DT;
  }
}

async function loop() {
  if (stopped) return;
  const now = performance.now();
  const wallDelta = Math.min(.25, Math.max(0, (now - last) / 1000));
  last = now;
  if(modelTest?.checkLimit(now)&&sim.running){sim.running=false;report(true);}
  if(!sim.running&&pendingInspectedRead){
    pendingInspectedRead=false;
    if(gpuEnabled&&sim.graph.full&&sim.mode==='connectome'&&!gpuResetPending){
      const id=inspectedAgentId,epoch=neuralEpoch;
      try{
        const response=await requestGpu({readOnly:true,population:sim.cars.length,agentIds:sim.cars.map(car=>car.id),inspectedAgentId:id});
        if(epoch===neuralEpoch&&id===inspectedAgentId&&response.available){
          const sample=response.agents?.find(agent=>Number(agent.id)===id),car=sim.cars.find(car=>car.id===id);
          if(sample&&car)F.applyNeuralState(sim.graph,car.brain,sample.active,sample.values);
          report(true);
        }
      }catch(error){parentPort.postMessage({type:'inspection-warning',message:error.message});}
    }
  }
  // Charge time once per completed batch, including time spent awaiting the
  // GPU. The old busy loop advanced `last` during every pending request and
  // silently discarded almost all of that time, making the slider ineffective.
  try{await advanceDesktop(wallDelta);}catch(error){if(gpuEnabled)disableGpu(error);else parentPort.postMessage({type:'fatal',message:error.stack||error.message});}
  if(sim.running)report();
  const delay=State.nextDelay(sim.running,sim.accumulator,sim.speedMultiplier,F.DT);
  if(delay===0)setImmediate(loop);else setTimeout(loop,delay);
}

parentPort.on('message', message => {
  if(message.type==='exportProgress'){
    try{parentPort.postMessage({type:'progress-result',requestId:message.requestId,state:Progress.capture(sim)});}
    catch(error){parentPort.postMessage({type:'progress-result',requestId:message.requestId,error:error.message});}
    return;
  }
  if (message.type === 'gpu-response') {
    const pending = gpuPending.get(message.requestId);
    if (!pending) return;
    gpuPending.delete(message.requestId);
    clearTimeout(pending.timer);
    pending.resolve(message);
    return;
  }
  try {
    if(['pause','setSpeed','setPopulation','setMode','reset','evolve','setCircuit','spawn'].includes(message.type))neuralEpoch++;
    switch (message.type) {
      case 'beginModelTest':
        if(sim.generation!==1||sim.ticks!==0||sim.history.length)throw Error('Il test deve partire da zero.');
        modelTest=new ModelTest.Trial({...message.options,population:sim.population,mutation:sim.mutation,speedMultiplier:sim.speedMultiplier,circuitId:sim.circuitId},performance.now());
        sim.onTrialTick=state=>{modelTest.backend=gpuEnabled?'WebGPU + CPU':'CPU';modelTest.observe(state,performance.now(),F.DT);};
        sim.running=true;sim.accumulator=0;last=performance.now();break;
      case 'cancelModelTest':modelTest?.finish('stopped',performance.now());sim.running=false;break;
      case 'vehicleControl': {
        const car=sim.cars.find(c=>c.id===Number(message.agentId));
        if(!car?.vehicle)break;
        car.diagnosticVehicle=true;
        const v=car.vehicle;
        if(message.gearboxMode==='auto'||message.gearboxMode==='manual')v.gearboxMode=message.gearboxMode;
        if(typeof message.absEnabled==='boolean')v.absEnabled=message.absEnabled;
        if(typeof message.tcEnabled==='boolean')v.tcEnabled=message.tcEnabled;
        if(Number.isFinite(message.brakeBias))v.brakeBias=F.clamp(message.brakeBias,.45,.7);
        if(v.gearboxMode==='manual'&&Number.isInteger(message.gear))F.Vehicle.requestGear(v,message.gear);
        break;
      }
      case 'inspectAgent': inspectedAgentId=Math.max(0,Math.min(sim.population-1,Math.floor(Number(message.value)||0)));pendingInspectedRead=true;break;
      case 'pause': sim.running = Boolean(message.value); sim.accumulator=0;last=performance.now();break;
      case 'setSpeed': speed = Math.max(.5, Math.min(30, Number(message.value) || 1)); sim.speedMultiplier = speed;sim.accumulator=0;last=performance.now();break;
      case 'setPopulation': sim.population = Math.max(4, Math.min(F.MAX_POPULATION, Math.round(Number(message.value) || 16)));inspectedAgentId=Math.min(inspectedAgentId,sim.population-1);sim.reset(); gpuResetPending = true; break;
      case 'setMutation': sim.mutation = Math.max(0, Math.min(.35, Number(message.value) || 0)); break;
      case 'setMode': sim.mode = message.value || 'connectome';sim.brainFactory=gpuEnabled&&sim.graph.full&&sim.mode==='connectome'?State.mirrorBrain:F.makeBrain;sim.reset();gpuResetPending = true; break;
      case 'reset': sim.reset(); gpuResetPending = true; break;
      case 'evolve': sim.evolve(); gpuResetPending = true; break;
      case 'adoptChampion': sim.adoptChampion(message.genome); break;
      case 'setCircuit': sim.setCircuit(message.value); gpuResetPending = true; break;
      case 'spawn': sim.spawn(message.genomes || [],true); gpuResetPending = true; break;
      case 'stop': stopped = true; break;
      default: return;
    }
    report(true);
  } catch (error) {
    parentPort.postMessage({type: 'fatal', message: error.stack || error.message});
  }
});

try {
  sim = new F.Simulation(data, {
    population: workerData.population,
    brainFactory:gpuPreferred&&workerData.mode==='connectome'?State.mirrorBrain:undefined,
    mutation: workerData.mutation,
    seed: workerData.seed,
    circuits: {circuits: workerData.circuits},
    circuitId: workerData.circuitId
  });
  sim.mode = workerData.mode;
  sim.running=workerData.running??true;
  sim.speedMultiplier = speed;
  if(workerData.progressState){Progress.restore(sim,workerData.progressState);speed=sim.speedMultiplier;gpuGeneration=sim.generation;}
  reportGpu({state: gpuPreferred ? 'waiting' : 'cpu-only', backend: gpuPreferred ? 'WebGPU' : null, error: null});
  parentPort.postMessage({type: 'ready', workerIndex: workerData.index});
  report(true);
  loop();
} catch (error) {
  parentPort.postMessage({type: 'fatal', message: error.stack || error.message});
}
