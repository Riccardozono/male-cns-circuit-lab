'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const {Worker} = require('node:worker_threads');
const F=require('../outputs/simulation.js'),{compareAgents}=F;
const Progress=require('../outputs/progress-save.js');

const MAX_WORKERS = Math.max(1, Number(os.availableParallelism?.() || os.cpus().length || 1));
// The connectome workers are deliberately CPU-heavy even when worker 0 sends
// the neural pass to WebGPU. On SMT systems, using every logical processor
// makes the physics, renderer and GPU submission compete for the same cores.
// Estimate physical cores conservatively and leave one available for the UI
// and the Electron/GPU bridge. On the user's 6c/12t Ryzen this selects 5
// workers: one hybrid GPU worker plus four CPU-only populations.
const ESTIMATED_PHYSICAL_CORES = Math.max(1, Math.ceil(MAX_WORKERS / 2));
const DEFAULT_CPU_WORKERS = Math.max(1, Math.min(MAX_WORKERS, ESTIMATED_PHYSICAL_CORES - 1));
// V4 now performs two sparse passes with an 8,192-neuron active budget. On a
// six-core Ryzen, five simultaneous V4 populations can starve Chromium and
// the GPU bridge even though the arithmetic is correct. Keep one hybrid GPU
// worker for the full graph by default; the lighter legacy
// profiles continue to use the normal physical-core recommendation.
const DEFAULT_FULL_WORKERS = 1;
const DEFAULT_POPULATION = 16;
const MAX_POPULATION = 100;
const clampInteger = (value, min, max) => Math.max(min, Math.min(max, Math.round(Number(value) || min)));

class DesktopEngine {
  constructor(outputsDir, emitSnapshot, emitError, forwardGpuRequest = null) {
    this.outputsDir = outputsDir;
    this.emitSnapshot = emitSnapshot;
    this.emitError = emitError;
    this.forwardGpuRequest = forwardGpuRequest;
    this.workers = [];
    this.states = [];
    this.seenGenerations = [];
    this.bundle = null;
    this.bundles = new Map();
    this.options = null;
    this.startedAt = 0;
    this.stopping = false;
    this.gpu = {state: 'waiting', backend: null, workerCount: 0, error: null, adapter: null};
    this.globalChampion = null;
    this.globalChampionFitness = -Infinity;
    this.globalChampionWorker = null;
    this.globalChampionStats = null;
    this.progressRequests=new Map();this.sessionId=null;this.restoring=false;
  }

  async loadBundle(modelId = 'v5') {
    const id = ['v2', 'v3', 'v4', 'v5'].includes(modelId) ? modelId : 'v5';
    if (this.bundles.has(id)) return this.bundles.get(id);
    const circuits = JSON.parse(await fs.readFile(path.join(this.outputsDir, 'data', 'circuits.json'), 'utf8')).circuits;
    if(id==='v5'){
      const original=await this.loadBundle('v4'),profiles=require(path.join(this.outputsDir,'model-profiles.js'));
      const bundle={...original,modelId:id,metadata:profiles.buildV5(original.metadata)};
      delete bundle.progressGraph;
      this.bundles.set(id,bundle);return bundle;
    }
    if (id !== 'v4') {
      const legacyModels = require(path.join(this.outputsDir, 'legacy-models.js'));
      const source = JSON.parse(await fs.readFile(path.join(this.outputsDir, 'data', 'connectome.json'), 'utf8'));
      const modelData = id === 'v2' ? legacyModels.buildV2(source) : legacyModels.tagV3(source);
      const bundle = {
        modelId: id,
        full: false,
        metadata: {
          dataset: modelData.dataset,
          modelRevision: modelData.modelRevision,
          modelId: id,
          modelLabel: modelData.modelLabel,
          nodeCount: modelData.nodes.length,
          edgeCount: modelData.edges.length
        },
        modelData,
        shared: null,
        circuits
      };
      this.bundles.set(id, bundle);
      return bundle;
    }
    const metadataPath = path.join(this.outputsDir, 'data', 'connectome-full.json');
    const binaryPath = path.join(this.outputsDir, 'data', 'connectome-full.bin');
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
    const bytes = await fs.readFile(binaryPath);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== metadata.binaryBytes || hash !== metadata.binarySha256) {
      throw new Error(`Bundle MaleCNS non valido: ${bytes.length} byte / SHA ${hash}`);
    }
    const shared = new SharedArrayBuffer(bytes.byteLength);
    new Uint8Array(shared).set(bytes);
    const bundle = {modelId: id, full: true, metadata, modelData: null, shared, circuits};
    this.bundles.set(id, bundle);
    return bundle;
  }

  defaultWorkerCount() {
    return DEFAULT_CPU_WORKERS;
  }

  info() {
    return {
      availableWorkers: MAX_WORKERS,
      estimatedPhysicalCores: ESTIMATED_PHYSICAL_CORES,
      recommendedWorkerCount: this.bundle?.full ? DEFAULT_FULL_WORKERS : DEFAULT_CPU_WORKERS,
      workerCount: this.workers.length,
      activeWorkers: this.states.filter(Boolean).length,
      dataset: this.bundle?.metadata?.dataset || 'male-cns:v1.0',
      modelId: this.bundle?.metadata?.modelId || 'v4',
      modelLabel: this.bundle?.metadata?.modelLabel || 'MaleCNS V4 completo · 166.700 neuroni',
      nodeCount: this.bundle?.metadata?.nodeCount || 166700,
      edgeCount: this.bundle?.metadata?.edgeCount || 6242118,
      gpu: {...this.gpu},
      sessionId:this.sessionId,
      rendererToken:this.options?.rendererToken||null
    };
  }

  async start(rawOptions = {}, restoredWorkers = null) {
    await this.stop();
    this.stopping = false;
    this.sessionId=crypto.randomUUID();
    this.globalChampion = null;
    this.globalChampionFitness = -Infinity;
    this.globalChampionWorker = null;
    this.globalChampionStats = null;
    const modelId = ['v2', 'v3', 'v4', 'v5'].includes(rawOptions.modelId) ? rawOptions.modelId : 'v5';
    const bundle = await this.loadBundle(modelId);
    this.bundle = bundle;
    this.gpu = {state: bundle.full ? 'waiting' : 'not-used', backend: null, workerCount: 0, error: null, adapter: null};
    const recommendedWorkers = bundle.full ? DEFAULT_FULL_WORKERS : this.defaultWorkerCount();
    const workerCount = restoredWorkers?restoredWorkers.length:clampInteger(rawOptions.workerCount ?? recommendedWorkers, 1, MAX_WORKERS);
    this.options = {
      population: clampInteger(rawOptions.population ?? DEFAULT_POPULATION, 4, MAX_POPULATION),
      mutation: Math.max(0, Math.min(.35, Number(rawOptions.mutation ?? .32))),
      speedMultiplier: Math.max(.5, Math.min(30, Number(rawOptions.speedMultiplier ?? 1))),
      circuitId: rawOptions.circuitId || 'lab',
      mode: rawOptions.mode || 'connectome',
      modelId,
      workerCount,
      rendererToken:typeof rawOptions.rendererToken==='string'?rawOptions.rendererToken.slice(0,64):null
    };
    this.options.running=rawOptions.running??true;
    this.states = Array(workerCount).fill(null);
    // Restored paused workers may report their existing champion merely
    // because the UI inspects a car. That is not a new scored generation.
    this.seenGenerations=restoredWorkers?restoredWorkers.map(w=>w.state.generation):Array(workerCount).fill(0);
    this.startedAt = Date.now();
    const ready = [];
    for (let index = 0; index < workerCount; index++) ready.push(this.spawn(index, bundle,restoredWorkers?.[index]?.state));
    await Promise.all(ready);
    if(!restoredWorkers)this.broadcastGlobalChampion();
    return this.info();
  }

  resetGlobalRecord() {
    this.globalChampion = null;
    this.globalChampionFitness = -Infinity;
    this.globalChampionWorker = null;
    this.globalChampionStats = null;
    this.seenGenerations.fill(0);
  }

  considerChampion(index, state) {
    if(this.restoring)return;
    const generation=Number(state?.generation);
    if(!Number.isInteger(generation)||generation<1)return;
    const seen=this.seenGenerations[index]??0;
    if(this.options?.running===false&&generation<=seen)return;
    this.seenGenerations[index]=Math.max(seen,generation);
    const fitness = Number(state?.bestEver);
    if (!Number.isFinite(fitness) || !state?.champion || !state.championStats || (this.globalChampionStats&&compareAgents(state.championStats,this.globalChampionStats)>=0)) return;
    this.globalChampionFitness = fitness;
    this.globalChampion = state.champion;
    this.globalChampionWorker = index;
    this.globalChampionStats=state.championStats;
    this.broadcastGlobalChampion();
  }

  broadcastGlobalChampion() {
    if (!this.globalChampion) return;
    for (const worker of this.workers) worker?.postMessage({type: 'adoptChampion', genome: this.globalChampion});
  }

  spawn(index, bundle,progressState=null) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, 'worker.cjs'), {
        workerData: {
          index,
          metadata: bundle.metadata,
          modelData: bundle.modelData,
          sharedBinary: bundle.shared,
          circuits: bundle.circuits,
          simulationPath: path.join(this.outputsDir, 'simulation.js'),
          ...this.options,
          gpuPreferred: index === 0 && bundle.full && typeof this.forwardGpuRequest === 'function',
          seed: 7717 + index * 100003,
          progressState
        }
      });
      let settled = false;
      worker.once('error', error => {
        if (!settled) {settled = true; reject(error);}
        this.emitError(error);
      });
      worker.once('exit', code => {
        if (code !== 0 && !this.stopping) this.emitError(new Error(`Worker di calcolo ${index + 1} terminato con codice ${code}.`));
      });
      worker.on('message', message => {
        if(message.type==='progress-result'){
          const pending=this.progressRequests.get(message.requestId);if(pending){clearTimeout(pending.timer);this.progressRequests.delete(message.requestId);message.error?pending.reject(Error(message.error)):pending.resolve(message.state);}return;
        }
        if (message.type === 'ready') {
          if (!settled) {settled = true; resolve();}
          return;
        }
        if (message.type === 'fatal') {
          const error = new Error(message.message);
          if (!settled) {settled = true; reject(error);}
          this.emitError(error);
          return;
        }
        if (message.type === 'snapshot') {
          this.states[index] = message.snapshot;
          this.considerChampion(index, message.snapshot);
          if (index === 0) this.emitSnapshot(this.decorateSnapshot(message.snapshot));
          return;
        }
        if (message.type === 'metric') {
          this.states[index] = {...(this.states[index] || {}), ...message.metric};
          this.considerChampion(index, this.states[index]);
          if (index === 0) this.emitSnapshot(this.decorateSnapshot(this.states[index]));
          return;
        }
        if (message.type === 'gpu-status') {
          this.gpu = {...this.gpu, ...message.status, workerCount: message.status?.state === 'active' ? 1 : this.gpu.workerCount};
          if (index === 0) this.emitSnapshot(this.decorateSnapshot({workerIndex: index}));
          return;
        }
        if (message.type === 'gpu-request') {
          try {
            this.forwardGpuRequest({...message.request,sessionId:this.sessionId});
          } catch (error) {
            this.gpuResponse({requestId: message.request?.requestId, workerIndex: index, available: false, error: error.message});
          }
        }
      });
      this.workers[index] = worker;
    });
  }

  decorateSnapshot(snapshot) {
    return {
      ...snapshot,
      engine: {
        ...this.info(),
        globalBestEver: Number.isFinite(this.globalChampionFitness) ? this.globalChampionFitness : null,
        globalChampionWorker: this.globalChampionWorker,
        uptimeSeconds: (Date.now() - this.startedAt) / 1000
      }
    };
  }

  async command(command = {}) {
    if(this.restoring)throw Error('Caricamento dei progressi in corso.');
    const type = command.type;
    if (!type) return this.info();
    const resuming=type==='pause'&&Boolean(command.value)&&this.options?.running===false;
    if(type==='vehicleControl'){
      // Manual inspection applies only to the displayed worker, not all islands.
      const index=clampInteger(command.workerIndex??0,0,Math.max(0,this.workers.length-1));
      this.workers[index]?.postMessage(command);return this.info();
    }
    if (type === 'setWorkerCount') {
      const target = clampInteger(command.value, 1, MAX_WORKERS);
      if (target !== this.workers.length && this.options) {
        const next = {...this.options, workerCount: target};
        await this.start(next);
      }
      return this.info();
    }
    if (['reset', 'setPopulation', 'setMode', 'setCircuit'].includes(type)) this.resetGlobalRecord();
    if(type==='setPopulation'){command={...command,value:clampInteger(command.value,4,MAX_POPULATION)};if(this.options)this.options.population=command.value;}
    // Pool changes must not silently restore old speed, population or pause.
    if(this.options){
      const fields={pause:'running',setSpeed:'speedMultiplier',setMutation:'mutation',setMode:'mode',setCircuit:'circuitId'};
      if(fields[type])this.options[fields[type]]=type==='pause'?Boolean(command.value):command.value;
    }
    for (const worker of this.workers) worker?.postMessage(command);
    // The global record is part of a shareable save; resend it after resume
    // so workers can queue it behind any unconsumed saved migrant.
    if(resuming)this.broadcastGlobalChampion();
    return this.info();
  }

  gpuResponse(payload = {}) {
    if(payload.sessionId&&payload.sessionId!==this.sessionId)return this.info();
    const workerIndex = clampInteger(payload.workerIndex ?? 0, 0, Math.max(0, this.workers.length - 1));
    const worker = this.workers[workerIndex];
    if (worker) worker.postMessage({type: 'gpu-response', ...payload});
    return this.info();
  }

  async stop() {
    this.stopping = true;
    const workers = this.workers.filter(Boolean);
    this.workers = [];
    this.states = [];
    this.seenGenerations = [];
    for(const pending of this.progressRequests.values()){clearTimeout(pending.timer);pending.reject(Error('Prova sostituita durante il salvataggio.'));}this.progressRequests.clear();
    await Promise.all(workers.map(worker => worker.terminate()));
  }
  async progressGraph(modelId){
    const bundle=await this.loadBundle(modelId);if(bundle.progressGraph)return bundle.progressGraph;
    let data=bundle.modelData;
    if(!data){data={...bundle.metadata,compact:true};const types={float64:Float64Array,float32:Float32Array,int32:Int32Array,uint32:Uint32Array,uint8:Uint8Array,int8:Int8Array};for(const [name,d]of Object.entries(bundle.metadata.arrays))data[name]=new types[d.dtype](bundle.shared,d.offset,d.length);}
    const graph=F.compileGraph(data);F.ensureLearning(graph);bundle.progressGraph=graph;return graph;
  }
  async validateProgress(payload){
    if(!payload||!['v2','v3','v4','v5'].includes(payload.modelId))throw Error('Modello del salvataggio non valido.');
    const bundle=await this.loadBundle(payload.modelId),graph=await this.progressGraph(payload.modelId);
    Progress.validatePayload(payload,{graph,circuits:[{id:'lab',revision:1},...bundle.circuits]});return payload;
  }
  requestProgress(worker){
    return new Promise((resolve,reject)=>{const requestId=crypto.randomUUID(),timer=setTimeout(()=>{this.progressRequests.delete(requestId);reject(Error('Timeout lettura progressi del worker.'));},15000);this.progressRequests.set(requestId,{resolve,reject,timer});worker.postMessage({type:'exportProgress',requestId});});
  }
  async exportProgress(){
    if(this.restoring||!this.workers.length)throw Error('Motore non pronto per salvare.');
    const session=this.sessionId,modelId=this.options.modelId,states=await Promise.all(this.workers.map(worker=>this.requestProgress(worker)));
    if(session!==this.sessionId)throw Error('La prova è cambiata durante il salvataggio.');
    const graph=await this.progressGraph(modelId);
    const payload={modelId,circuitId:states[0].circuitId,graph:Progress.compatibleGraph(graph),vehicleRevision:F.Vehicle.REVISION,workers:states.map((state,index)=>({index,state})),globalChampion:this.globalChampion?{genome:this.globalChampion,stats:JSON.parse(JSON.stringify(this.globalChampionStats)),workerIndex:this.globalChampionWorker}:null};
    await this.validateProgress(payload);return payload;
  }
  async restoreProgress(payload,rendererToken=null){
    await this.validateProgress(payload);if(this.restoring)throw Error('Caricamento già in corso.');
    const previousOptions=this.options?{...this.options}:null;
    const previous=this.workers.length&&this.options?.mode==='connectome'?await this.exportProgress():null;
    this.restoring=true;
    const apply=async (p,token)=>{
      const s=p.workers[0].state;await this.start({modelId:p.modelId,circuitId:p.circuitId,population:s.population,mutation:s.mutation,speedMultiplier:s.speedMultiplier,mode:'connectome',running:false,rendererToken:token},p.workers);
      const g=p.globalChampion;this.globalChampion=g?.genome||null;this.globalChampionStats=g?.stats||null;
      this.globalChampionFitness=g?.stats?.fitness??-Infinity;this.globalChampionWorker=g?.workerIndex??null;
      return this.info();
    };
    try{return await apply(payload,rendererToken);}catch(error){try{if(previous)await apply(previous,previousOptions?.rendererToken);else if(previousOptions)await this.start({...previousOptions,running:false});}catch(rollback){this.emitError(rollback);}throw error;}
    finally{this.restoring=false;}
  }
}

module.exports = {DesktopEngine, MAX_WORKERS};
