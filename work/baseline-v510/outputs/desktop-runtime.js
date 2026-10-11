'use strict';

// Desktop bridge: physics, sensors, rewards and evolution stay in Node workers.
// The renderer owns the optional WebGPU connectome pass because navigator.gpu
// is exposed by Chromium, not by a Node worker_threads isolate.
(function(root) {
  const F = root.FlySim;
  const desktop = root.desktopCompute;
  const State=root.MaleCNSDesktopState;
  if (!desktop) return;

  let activeGpuBackend = null;

  function roundBufferSize(bytes) {
    return Math.max(4, Math.ceil(bytes / 4) * 4);
  }

  function readMapped(buffer, Type) {
    const copy = buffer.getMappedRange().slice(0);
    buffer.unmap();
    return new Type(copy);
  }

  class DesktopGpuNeuralBackend {
    constructor(data, graph) {
      this.data = data;
      this.graph = graph;
      this.nodeCount = graph.n;
      this.inputCount = graph.inputs.length;
      this.outputCount = graph.outputs.length;
      this.readoutNodes=F.ensureLearning(graph).nodes;
      this.readoutCount=this.readoutNodes.length;
      this.gainGroups=graph.learning.gainGroups;
      this.maxPopulation = F.MAX_POPULATION;
      this.capacity=Math.min(32,this.maxPopulation);
      this.activeBudget = Math.min(this.nodeCount, graph.solver?.activeNeuronBudget ?? 4096);
      this.device = null;
      this.queue = null;
      this.bindGroups = [];
      this.paramsBuffers = [];
      this.ownedBuffers = [];
      this.disposed = false;
      this.readyPromise = null;
      this.initialized = false;
      this.available = null;
      this.status = {state: 'waiting', backend: 'WebGPU', error: null};
      this.lastPopulation = 0;
      // The sparse solver uses two GPU state buffers as a ping-pong pair.
      // Keep the buffer containing the current state across control ticks;
      // otherwise a one-iteration solver would always read the cleared side
      // and the DNa outputs would remain zero.
      this.stateDirection = 0;
    }

    async init() {
      if(this.disposed)throw Error('Backend GPU chiuso.');
      if (this.initialized) return this.status;
      if (this.readyPromise) return this.readyPromise;
      this.readyPromise = (async () => {
        if (!root.navigator?.gpu) throw new Error('navigator.gpu non disponibile in Electron.');
        const usage = root.GPUBufferUsage;
        const stage = root.GPUShaderStage;
        const mapMode = root.GPUMapMode;
        if (!usage || !stage || !mapMode) throw new Error('API WebGPU incompleta nel renderer.');
        const adapter = await root.navigator.gpu.requestAdapter({powerPreference: 'high-performance'});
        if (!adapter) throw new Error('Nessun adapter WebGPU disponibile.');
        const adapterInfo = adapter.info || (typeof adapter.requestAdapterInfo === 'function' ? await adapter.requestAdapterInfo() : null);
        const adapterLabel = [adapterInfo?.vendor, adapterInfo?.architecture, adapterInfo?.device, adapterInfo?.description].filter(Boolean).join(' ') || 'WebGPU high-performance adapter';
        this.adapter = {
          label: adapterLabel,
          vendor: adapterInfo?.vendor || null,
          architecture: adapterInfo?.architecture || null,
          device: adapterInfo?.device || null,
          description: adapterInfo?.description || null
        };
        this.device = await adapter.requestDevice();
        if(this.disposed){this.device.destroy();throw Error('Backend GPU chiuso.');}
        this.queue = this.device.queue;
        this.device.lost.then(info => {
          this.initialized = false;
          this.available = false;
          this.status = {state: 'lost', backend: 'WebGPU', error: info?.message || 'Device WebGPU perso.'};
        }).catch(() => {});
        const maxStorage = this.device.limits?.maxStorageBufferBindingSize || 0;
        const packedGraphBytes=(this.graph.rowOffsets.length+this.graph.targets.length+this.graph.csrWeights.length+this.inputCount+2*this.nodeCount)*4;
        const largestBuffer = Math.max(packedGraphBytes,this.maxPopulation*this.nodeCount*2*4);
        if (maxStorage && largestBuffer > maxStorage) {
          throw new Error('Il device WebGPU non supporta i buffer richiesti per '+this.maxPopulation+' agenti.');
        }
        if(Math.ceil(this.maxPopulation*this.nodeCount/256)>this.device.limits.maxComputeWorkgroupsPerDimension)throw Error('Il batch supera il limite di dispatch della GPU.');
        this.usage = usage;
        this.stage = stage;
        this.mapMode = mapMode;
        this.allocateBuffers();
        await this.createPipelines();
        this.initialized = true;
        this.available = true;
        this.status = {state: 'ready', backend: 'WebGPU', error: null, adapter: this.adapter};
        return this.status;
      })().catch(error => {
        this.readyPromise = null;
        this.initialized = false;
        this.available = false;
        this.status = {state: 'fallback', backend: null, error: error.message || String(error), adapter: null};
        throw error;
      });
      return this.readyPromise;
    }

    createBuffer(bytes, usage) {
      const buffer=this.device.createBuffer({size: roundBufferSize(bytes), usage});
      this.ownedBuffers.push(buffer);
      return buffer;
    }

    uploadBuffer(bytes, usage, source) {
      const buffer = this.createBuffer(bytes, usage);
      if (source?.byteLength) {
        const raw = source.buffer || source;
        const baseOffset = source.byteOffset || 0;
        const chunkSize = 4 * 1024 * 1024;
        for (let offset = 0; offset < source.byteLength; offset += chunkSize) {
          const size = Math.min(chunkSize, source.byteLength - offset);
          this.queue.writeBuffer(buffer, offset, new Uint8Array(raw, baseOffset + offset, size));
        }
      }
      return buffer;
    }

    allocateBuffers() {
      const storage = this.usage.STORAGE;
      const copySource = this.usage.COPY_SRC;
      const copyDestination = this.usage.COPY_DST;
      const mapRead = this.usage.MAP_READ;
      const nodeCapacity = this.capacity * this.nodeCount;
      const activeCapacity = this.capacity * this.activeBudget;
      const outputRanks = new Uint32Array(this.nodeCount);
      outputRanks.fill(0xffffffff);
      this.readoutNodes.forEach((index, rank) => {outputRanks[index] = rank;});
      // Preserve the complete audited driving core before admitting context
      // cells. Atomic arrival order must not evict sensor-to-motor paths.
      let reserved=this.readoutCount;
      for(let node=0;node<this.nodeCount;node++)if(this.graph.coreMask[node]&&outputRanks[node]===0xffffffff){outputRanks[node]=reserved++;}
      this.reservedCount=reserved;
      if(reserved>this.activeBudget)throw Error('Budget GPU insufficiente per il nucleo di guida.');

      const rowBase = 0;
      const targetBase = rowBase + this.graph.rowOffsets.length;
      const weightBase = targetBase + this.graph.targets.length;
      const inputBase = weightBase + this.graph.csrWeights.length;
      const outputBase = inputBase + this.graph.inputs.length;
      const groupBase=outputBase+outputRanks.length;
      const graphPacked = new Uint32Array(groupBase + this.nodeCount);
      graphPacked.set(this.graph.rowOffsets, rowBase);
      graphPacked.set(this.graph.targets, targetBase);
      graphPacked.set(new Uint32Array(this.graph.csrWeights.buffer, this.graph.csrWeights.byteOffset, this.graph.csrWeights.length), weightBase);
      graphPacked.set(this.graph.inputs, inputBase);
      graphPacked.set(outputRanks, outputBase);
      graphPacked.set(this.graph.learning.groups,groupBase);
      this.graphLayout = {rowBase, targetBase, weightBase, inputBase, outputBase,groupBase};
      this.graphBufferSize = graphPacked.byteLength;
      this.paramsBuffers = [0,1].map(()=>this.createBuffer(48, this.usage.UNIFORM | copyDestination));
      this.graphBuffer = this.device.createBuffer({size: roundBufferSize(graphPacked.byteLength), usage: storage, mappedAtCreation: true});
      this.ownedBuffers.push(this.graphBuffer);
      new Uint8Array(this.graphBuffer.getMappedRange()).set(new Uint8Array(graphPacked.buffer, graphPacked.byteOffset, graphPacked.byteLength));
      this.graphBuffer.unmap();
      this.drivesBuffer = this.createBuffer(this.capacity * (this.inputCount+this.gainGroups) * 4, storage | copyDestination);
      this.sumBuffer = this.createBuffer(nodeCapacity * 4, storage);
      this.activityBuffer = this.createBuffer(nodeCapacity * 2 * 4, storage);
      this.activeIndicesBuffer = this.createBuffer(activeCapacity * 2 * 4, storage | copySource);
      this.activeValuesBuffer = this.createBuffer(activeCapacity * 2 * 4, storage | copySource);
      this.activeCountsBuffer = this.createBuffer(this.capacity * 2 * 4, storage | copySource);

      this.packetLayout=State.packetLayout(this.capacity,this.readoutCount,this.activeBudget);
      this.packetBuffer=this.createBuffer(this.packetLayout.bytes,storage|copySource);
      this.packetReadback=this.createBuffer(this.packetLayout.bytes,copyDestination|mapRead);
    }

    shaderCode() {
      const layout = this.graphLayout;
      const nodeCapacity = this.capacity * this.nodeCount;
      const activeCapacity = this.capacity * this.activeBudget;
      return [
        'struct Params {',
        '  nodeCount: u32,',
        '  inputCount: u32,',
        '  population: u32,',
        '  activeBudget: u32,',
        '  outputCount: u32,',
        '  direction: u32,',
        '  activityThreshold: f32,',
        '  edgeThreshold: f32,',
        '  inspectedAgent: u32,',
        '  padding0: u32,',
        '  padding1: u32,',
        '  padding2: u32,',
        '};',
        '@group(0) @binding(0) var<uniform> params: Params;',
        '@group(0) @binding(1) var<storage, read> graphData: array<u32>;',
        '@group(0) @binding(2) var<storage, read> drives: array<f32>;',
        '@group(0) @binding(3) var<storage, read_write> sums: array<atomic<i32>>;',
        '@group(0) @binding(4) var<storage, read_write> activities: array<f32>;',
        '@group(0) @binding(5) var<storage, read_write> activeIndices: array<u32>;',
        '@group(0) @binding(6) var<storage, read_write> activeValues: array<f32>;',
        '@group(0) @binding(7) var<storage, read_write> activeCounts: array<atomic<u32>>;',
        '@group(0) @binding(8) var<storage, read_write> packet: array<u32>;',
        'const ROW_BASE: u32 = ' + layout.rowBase + 'u;',
        'const TARGET_BASE: u32 = ' + layout.targetBase + 'u;',
        'const WEIGHT_BASE: u32 = ' + layout.weightBase + 'u;',
        'const INPUT_BASE: u32 = ' + layout.inputBase + 'u;',
        'const OUTPUT_BASE: u32 = ' + layout.outputBase + 'u;',
        'const GROUP_BASE: u32 = '+layout.groupBase+'u;',
        'const GAIN_BASE: u32 = '+(this.capacity*this.inputCount)+'u;',
        'const GAIN_GROUPS: u32 = '+this.gainGroups+'u;',
        'const NODE_CAPACITY: u32 = ' + nodeCapacity + 'u;',
        'const ACTIVE_CAPACITY: u32 = ' + activeCapacity + 'u;',
        'const POP_CAPACITY: u32 = ' + this.capacity + 'u;',
        'const READOUT_COUNT: u32 = '+this.readoutCount+'u;',
        'const PACKED_INDEX_BASE: u32 = '+this.packetLayout.indicesBase+'u;',
        'const PACKED_VALUE_BASE: u32 = '+this.packetLayout.valuesBase+'u;',
        'const SCALE: f32 = 1000000.0;',
        '',
        '@compute @workgroup_size(256)',
        'fn clear_state(@builtin(global_invocation_id) id: vec3<u32>) {',
        '  let total = params.population * params.nodeCount;',
        '  if (id.x < total) { activities[id.x] = 0.0; activities[NODE_CAPACITY + id.x] = 0.0; }',
        '  if (id.x < params.population) {',
        '    atomicStore(&activeCounts[id.x], 0u);',
        '    atomicStore(&activeCounts[POP_CAPACITY + id.x], 0u);',
        '  }',
        '}',
        '',
        '@compute @workgroup_size(256)',
        'fn clear_sum(@builtin(global_invocation_id) id: vec3<u32>) {',
        '  let total = params.population * params.nodeCount;',
        '  if (id.x < total) { atomicStore(&sums[id.x], 0); }',
        '}',
        '',
        '@compute @workgroup_size(64)',
        'fn clear_counts(@builtin(global_invocation_id) id: vec3<u32>) {',
        '  if (id.x >= params.population) { return; }',
        '  if (params.direction == 0u) { atomicStore(&activeCounts[POP_CAPACITY + id.x], params.outputCount); }',
        '  else { atomicStore(&activeCounts[id.x], params.outputCount); }',
        '}',
        '',
        '@compute @workgroup_size(256)',
        'fn inject(@builtin(global_invocation_id) id: vec3<u32>) {',
        '  let total = params.population * params.inputCount;',
        '  if (id.x >= total) { return; }',
        '  let input = id.x % params.inputCount;',
        '  let agent = id.x / params.inputCount;',
        '  let value = drives[id.x];',
        '  if (abs(value) < params.edgeThreshold) { return; }',
        '  let destination = graphData[INPUT_BASE + input];',
        '  let scaled = i32(value * SCALE);',
        '  if (scaled != 0) { atomicAdd(&sums[agent * params.nodeCount + destination], scaled); }',
        '}',
        '',
        '@compute @workgroup_size(256)',
        'fn propagate(@builtin(global_invocation_id) id: vec3<u32>) {',
        '  let total = params.population * params.activeBudget;',
        '  if (id.x >= total) { return; }',
        '  let slot = id.x % params.activeBudget;',
        '  let agent = id.x / params.activeBudget;',
        '  var count: u32 = 0u;',
        '  var source: u32 = 0u;',
        '  var sourceActivity: f32 = 0.0;',
        '  if (params.direction == 0u) {',
        '    count = min(atomicLoad(&activeCounts[agent]), params.activeBudget);',
        '    if (slot < count) { source = activeIndices[agent * params.activeBudget + slot]; sourceActivity = activities[agent * params.nodeCount + source]; }',
        '  } else {',
        '    count = min(atomicLoad(&activeCounts[POP_CAPACITY + agent]), params.activeBudget);',
        '    if (slot < count) { source = activeIndices[ACTIVE_CAPACITY + agent * params.activeBudget + slot]; sourceActivity = activities[NODE_CAPACITY + agent * params.nodeCount + source]; }',
        '  }',
        '  if (slot >= count || abs(sourceActivity) < params.activityThreshold) { return; }',
        '  let start = graphData[ROW_BASE + source];',
        '  let end = graphData[ROW_BASE + source + 1u];',
        '  for (var edge = start; edge < end; edge = edge + 1u) {',
        '    let gain = drives[GAIN_BASE + agent * GAIN_GROUPS + graphData[GROUP_BASE + source]];',
        '    let contribution = 0.9 * bitcast<f32>(graphData[WEIGHT_BASE + edge]) * sourceActivity * gain;',
        '    if (abs(contribution) >= params.edgeThreshold) {',
        '      let scaled = i32(contribution * SCALE);',
        '      if (scaled != 0) { atomicAdd(&sums[agent * params.nodeCount + graphData[TARGET_BASE + edge]], scaled); }',
        '    }',
        '  }',
        '}',
        '',
        '@compute @workgroup_size(256)',
        'fn update_activity(@builtin(global_invocation_id) id: vec3<u32>) {',
        '  let total = params.population * params.nodeCount;',
        '  if (id.x >= total) { return; }',
        '  var previous: f32 = 0.0;',
        '  if (params.direction == 0u) { previous = activities[id.x]; } else { previous = activities[NODE_CAPACITY + id.x]; }',
        '  let input = f32(atomicLoad(&sums[id.x])) / SCALE;',
        '  let value = 0.45 * previous + 0.55 * tanh(input);',
        '  let next = select(0.0, value, abs(value) >= params.activityThreshold);',
        '  if (params.direction == 0u) { activities[NODE_CAPACITY + id.x] = next; } else { activities[id.x] = next; }',
        '}',
        '',
        '@compute @workgroup_size(256)',
        'fn compact(@builtin(global_invocation_id) id: vec3<u32>) {',
        '  let total = params.population * params.nodeCount;',
        '  if (id.x >= total) { return; }',
        '  let node = id.x % params.nodeCount;',
        '  let agent = id.x / params.nodeCount;',
        '  var value: f32 = 0.0;',
        '  if (params.direction == 0u) { value = activities[NODE_CAPACITY + id.x]; } else { value = activities[id.x]; }',
        '  let outputRank = graphData[OUTPUT_BASE + node];',
        '  if (outputRank != 0xffffffffu) {',
        '    if (params.direction == 0u) { activeIndices[ACTIVE_CAPACITY + agent * params.activeBudget + outputRank] = node; activeValues[ACTIVE_CAPACITY + agent * params.activeBudget + outputRank] = value; }',
        '    else { activeIndices[agent * params.activeBudget + outputRank] = node; activeValues[agent * params.activeBudget + outputRank] = value; }',
        '    return;',
        '  }',
        '  if (abs(value) < params.activityThreshold) { return; }',
        '  var slot: u32 = 0u;',
        '  if (params.direction == 0u) { slot = atomicAdd(&activeCounts[POP_CAPACITY + agent], 1u); }',
        '  else { slot = atomicAdd(&activeCounts[agent], 1u); }',
        '  if (slot >= params.activeBudget) { return; }',
        '  if (params.direction == 0u) { activeIndices[ACTIVE_CAPACITY + agent * params.activeBudget + slot] = node; activeValues[ACTIVE_CAPACITY + agent * params.activeBudget + slot] = value; }',
        '  else { activeIndices[agent * params.activeBudget + slot] = node; activeValues[agent * params.activeBudget + slot] = value; }',
        '}',
        '',
        '// Gather motor readouts for all agents and the full inspected atlas.',
        '// This changes only transport; propagation still uses the full state.',
        '@compute @workgroup_size(256)',
        'fn pack_readback(@builtin(global_invocation_id) id: vec3<u32>) {',
        '  let countBase = params.direction * POP_CAPACITY;',
        '  let stateBase = params.direction * ACTIVE_CAPACITY;',
        '  if (id.x < params.population) { packet[id.x] = min(params.activeBudget, atomicLoad(&activeCounts[countBase + id.x])); }',
        '  let motorSlots = params.population * READOUT_COUNT;',
        '  var agent: u32 = 0u;',
        '  var slot: u32 = 0u;',
        '  var destination: u32 = id.x;',
        '  if (id.x < motorSlots) { agent = id.x / READOUT_COUNT; slot = id.x % READOUT_COUNT; }',
        '  else {',
        '    slot = id.x - motorSlots;',
        '    if (slot >= params.activeBudget) { return; }',
        '    agent = params.inspectedAgent;',
        '    destination = POP_CAPACITY * READOUT_COUNT + slot;',
        '  }',
        '  let count = min(params.activeBudget, atomicLoad(&activeCounts[countBase + agent]));',
        '  var node: u32 = 0u;',
        '  var value: f32 = 0.0;',
        '  if (slot < count) {',
        '    let source = stateBase + agent * params.activeBudget + slot;',
        '    node = activeIndices[source]; value = activeValues[source];',
        '  }',
        '  packet[PACKED_INDEX_BASE + destination] = node;',
        '  packet[PACKED_VALUE_BASE + destination] = bitcast<u32>(value);',
        '}',
        ''
      ].join('\n');
    }

    async createPipelines() {
      const module = this.device.createShaderModule({code: this.shaderCode()});
      if (module.getCompilationInfo) {
        const info = await module.getCompilationInfo();
        const errors = (info.messages || []).filter(message => message.type === 'error');
        if (errors.length) throw new Error(errors.map(message => message.message).join(' | '));
      }
      const bindGroupLayout = this.device.createBindGroupLayout({entries: [
        {binding: 0, visibility: this.stage.COMPUTE, buffer: {type: 'uniform'}},
        {binding: 1, visibility: this.stage.COMPUTE, buffer: {type: 'read-only-storage'}},
        {binding: 2, visibility: this.stage.COMPUTE, buffer: {type: 'read-only-storage'}},
        {binding: 3, visibility: this.stage.COMPUTE, buffer: {type: 'storage'}},
        {binding: 4, visibility: this.stage.COMPUTE, buffer: {type: 'storage'}},
        {binding: 5, visibility: this.stage.COMPUTE, buffer: {type: 'storage'}},
        {binding: 6, visibility: this.stage.COMPUTE, buffer: {type: 'storage'}},
        {binding: 7, visibility: this.stage.COMPUTE, buffer: {type: 'storage'}},
        {binding: 8, visibility: this.stage.COMPUTE, buffer: {type: 'storage'}}
      ]});
      const layout = this.device.createPipelineLayout({bindGroupLayouts: [bindGroupLayout]});
      const make = async entryPoint => {
        this.device.pushErrorScope('validation');
        const pipeline = this.device.createComputePipeline({label: 'male-cns-' + entryPoint, layout, compute: {module, entryPoint}});
        const error = await this.device.popErrorScope();
        if (error) throw new Error(error.message || 'Pipeline WebGPU non valido: ' + entryPoint);
        return pipeline;
      };
      this.pipelines = {
        clearState: await make('clear_state'),
        clearSum: await make('clear_sum'),
        clearCounts: await make('clear_counts'),
        inject: await make('inject'),
        propagate: await make('propagate'),
        update: await make('update_activity'),
        compact: await make('compact'),
        pack: await make('pack_readback')
      };
      const b = this;
      const resources = {
        1: {buffer: b.graphBuffer}, 2: {buffer: b.drivesBuffer},
        3: {buffer: b.sumBuffer}, 4: {buffer: b.activityBuffer}, 5: {buffer: b.activeIndicesBuffer},
        6: {buffer: b.activeValuesBuffer}, 7: {buffer: b.activeCountsBuffer},8:{buffer:b.packetBuffer}
      };
      this.bindGroups = this.paramsBuffers.map((buffer,direction)=>this.device.createBindGroup({
        label: 'male-cns-bind-group',
        layout: bindGroupLayout,
        entries: [{binding:0,resource:{buffer}},...Object.keys(resources).map(binding => ({binding: Number(binding), resource: resources[binding]}))]
      }));
    }

    writeParams(population, direction,inspectedAgent) {
      const bytes = new ArrayBuffer(48);
      const view = new DataView(bytes);
      view.setUint32(0, this.nodeCount, true);
      view.setUint32(4, this.inputCount, true);
      view.setUint32(8, population, true);
      view.setUint32(12, this.activeBudget, true);
      view.setUint32(16, this.reservedCount, true);
      view.setUint32(20, direction, true);
      view.setFloat32(24, this.graph.solver?.activityThreshold ?? 0.001, true);
      view.setFloat32(28, this.graph.solver?.edgeContributionThreshold ?? 0.000001, true);
      view.setUint32(32,inspectedAgent,true);
      this.queue.writeBuffer(this.paramsBuffers[direction], 0, bytes);
    }

    dispatch(pass, pipeline, name, total,direction) {
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, this.bindGroups[direction]);
      pass.dispatchWorkgroups(Math.max(1, Math.ceil(total / 256)));
    }

    async submit(encoder) {
      this.device.pushErrorScope('validation');
      this.queue.submit([encoder.finish()]);
      const error = await this.device.popErrorScope();
      if (error) throw new Error(error.message || 'Errore di validazione WebGPU.');
    }

    async run(request) {
      await this.init();
      if(this.disposed)throw Error('Backend GPU chiuso.');
      const population = Math.max(1, Math.min(this.maxPopulation, Math.round(Number(request.population) || 1)));
      if(population>this.capacity){
        // Grow on demand: the usual 16/32-agent run should not reserve the
        // 100-agent working set. Requests are serialized by the worker.
        for(const buffer of this.ownedBuffers)buffer.destroy();
        this.ownedBuffers=[];
        this.capacity=Math.min(this.maxPopulation,2**Math.ceil(Math.log2(population)));
        this.allocateBuffers();await this.createPipelines();
        this.lastPopulation=0;this.stateDirection=0;
      }
      const expectedDriveLength = population * this.inputCount;
      const drives = request.drives instanceof Float32Array ? request.drives : Float32Array.from(request.drives || []);
      if (drives.length < expectedDriveLength) throw new Error('Batch WebGPU privo dei drive sensoriali.');
      this.queue.writeBuffer(this.drivesBuffer, 0, new Uint8Array(drives.buffer, drives.byteOffset || 0, expectedDriveLength * 4));
      const gains=request.gains instanceof Float32Array?request.gains:Float32Array.from(request.gains||[]);
      if(gains.length!==population*this.gainGroups||!gains.every(v=>Number.isFinite(v)&&v>0&&v<3))throw Error('Batch WebGPU privo dei guadagni sinaptici appresi.');
      this.queue.writeBuffer(this.drivesBuffer,this.capacity*this.inputCount*4,gains);
      const reset = Boolean(request.reset) || population !== this.lastPopulation;
      const inspectedAgent=State.inspectedPosition(request,population);
      // Separate direction uniforms are immutable during this submission.
      // Writing one shared uniform between encoded passes would make every
      // pass read the last value, not its own ping-pong direction.
      this.writeParams(population,0,inspectedAgent);
      this.writeParams(population,1,inspectedAgent);
      const encoder=this.device.createCommandEncoder();
      if (reset) {
        this.stateDirection = 0;
        const pass = encoder.beginComputePass();
        this.dispatch(pass, this.pipelines.clearState, 'clearState', population * this.nodeCount,0);
        pass.end();
      }
      const iterations = Math.max(1, Math.min(4, Math.round(Number(request.iterations) || 1)));
      let direction = this.stateDirection;
      for (let iteration = 0; iteration < iterations; iteration++) {
        let pass = encoder.beginComputePass();
        this.dispatch(pass, this.pipelines.clearSum, 'clearSum', population * this.nodeCount,direction);
        pass.end();
        pass = encoder.beginComputePass();
        pass.setPipeline(this.pipelines.clearCounts);
        pass.setBindGroup(0, this.bindGroups[direction]);
        pass.dispatchWorkgroups(Math.max(1, Math.ceil(population / 64)));
        pass.end();
        pass = encoder.beginComputePass();
        this.dispatch(pass, this.pipelines.inject, 'inject', population * this.inputCount,direction);
        pass.end();
        pass = encoder.beginComputePass();
        this.dispatch(pass, this.pipelines.propagate, 'propagate', population * this.activeBudget,direction);
        pass.end();
        pass = encoder.beginComputePass();
        this.dispatch(pass, this.pipelines.update, 'update', population * this.nodeCount,direction);
        pass.end();
        pass = encoder.beginComputePass();
        this.dispatch(pass, this.pipelines.compact, 'compact', population * this.nodeCount,direction);
        pass.end();
        direction = direction === 0 ? 1 : 0;
      }
      const finalDirection = direction;
      this.stateDirection = finalDirection;
      const packPass=encoder.beginComputePass();
      this.dispatch(packPass,this.pipelines.pack,'pack',population*this.readoutCount+this.activeBudget,finalDirection);
      packPass.end();
      encoder.copyBufferToBuffer(this.packetBuffer,0,this.packetReadback,0,this.packetLayout.bytes);
      await this.submit(encoder);
      await this.packetReadback.mapAsync(this.mapMode.READ);
      const agents=State.decodePacket(readMapped(this.packetReadback,Uint32Array),this.packetLayout,request,population);
      this.lastReadbackBytes=this.packetLayout.bytes;
      this.lastSubmissions=1;
      this.lastPopulation = population;
      this.status = {state: 'active', backend: 'WebGPU', error: null, adapter: this.adapter};
      return {available: true, backend: 'WebGPU', adapter: this.adapter, agents};
    }

    dispose(){
      this.disposed=true;
      this.initialized=false;
      for(const buffer of this.ownedBuffers)buffer.destroy();
      this.ownedBuffers=[];
      this.device?.destroy();
    }

    async inspect(request){
      // Observation only: pack the existing activity. No sensory injection,
      // reset, recurrent pass, direction change or physics tick.
      await this.init();
      if(this.disposed)throw Error('Backend GPU chiuso.');
      const population=Math.round(Number(request.population));
      if(population!==this.lastPopulation)throw Error('Campione GPU non ancora disponibile per questa popolazione.');
      const inspected=State.inspectedPosition(request,population),direction=this.stateDirection;
      this.writeParams(population,direction,inspected);
      const encoder=this.device.createCommandEncoder(),pass=encoder.beginComputePass();
      this.dispatch(pass,this.pipelines.pack,'pack',population*this.readoutCount+this.activeBudget,direction);pass.end();
      encoder.copyBufferToBuffer(this.packetBuffer,0,this.packetReadback,0,this.packetLayout.bytes);
      await this.submit(encoder);await this.packetReadback.mapAsync(this.mapMode.READ);
      const agents=State.decodePacket(readMapped(this.packetReadback,Uint32Array),this.packetLayout,request,population);
      return {available:true,backend:'WebGPU',adapter:this.adapter,agents,readOnly:true};
    }

    async handleOne(request) {
      try {
        return await(request.readOnly?this.inspect(request):this.run(request));
      } catch (error) {
        if(request.readOnly)return {available:false,error:error.message||String(error),readOnly:true};
        this.available = false;
        this.status = {state: 'fallback', backend: null, error: error.message || String(error)};
        return {available: false, error: this.status.error};
      }
    }
    handle(request){
      const task=(this.requestTail||Promise.resolve()).then(()=>this.handleOne(request));
      this.requestTail=task.catch(()=>{});return task;
    }
  }

  const gpuBackends=new Map();
  for(const client of [desktop,root.desktopTest].filter(Boolean))if(typeof client.onGpuRequest==='function'){
    client.onGpuRequest(request => {
      const backend = gpuBackends.get(client);
      const task = backend ? backend.handle(request) : Promise.resolve({available: false, error: 'Backend GPU non inizializzato.'});
      task.then(response => client.gpuResponse({
        requestId: request?.requestId,
        workerIndex: request?.workerIndex,
        sessionId:request?.sessionId,
        ...response
      })).catch(error => client.gpuResponse({
        requestId: request?.requestId,
        workerIndex: request?.workerIndex,
        sessionId:request?.sessionId,
        available: false,
        error: error.message || String(error)
      })).catch(() => {});
    });
  }

  class DesktopSimulation {
    constructor(data, options = {}) {
      this.desktop=options.desktopClient||desktop;
      this.graph = F.compileGraph(data);
      this.modelId = options.modelId || data.modelId || this.graph.modelId;
      this.modelLabel = options.modelLabel || data.modelLabel || this.graph.modelLabel;
      this.circuits = [
        {id: 'lab', name: 'Laboratorio', revision: 1, description: 'Circuito originale per confrontare i controller.', landmarks: []},
        ...(options.circuits?.circuits || [])
      ];
      this._population = Math.max(4,Math.min(F.MAX_POPULATION,Math.round(options.population??16)));
      this._pendingPopulation=null;this._inspectedAgentId=0;
      this._mutation = options.mutation ?? .16;
      this._pendingMutation = null;
      this._speedMultiplier = F.clamp(options.speedMultiplier ?? 1, .5, 30);
      this._pendingSpeedMultiplier = null;
      this._running = true;
      this._mode = 'connectome';
      this._pendingRunning=null;this._pendingMode=null;
      this.random = F.rng(7717);
      this.history = [];
      this.bestEver = -Infinity;
      this.champion = null;
      this.generation = 1;
      this.elapsed = 0;
      this.cars = [];
      this.engine = null;
      this._starting=true;this._sessionId=null;this._bufferedSnapshot=null;this._rendererToken=root.crypto.randomUUID();
      this.gpu = this.graph.full ? new DesktopGpuNeuralBackend(data, this.graph) : null;
      activeGpuBackend = this.gpu;
      gpuBackends.set(this.desktop,this.gpu);
      this._firstSnapshot = new Promise(resolve => {this._resolveFirstSnapshot = resolve;});
      this._unsubscribe = this.desktop.onSnapshot(snapshot => this.applySnapshot(snapshot));
      this._unsubscribeError = this.desktop.onError(error => {
        const message = error?.message || 'Errore del motore desktop.';
        this.computeError=message;
        root.dispatchEvent(new CustomEvent(this.desktop===desktop?'desktop-compute-error':'desktop-test-error', {detail: message}));
      });
      this.configureCircuit(options.circuitId || 'lab');
      this._start = (options.progress?this.desktop.restoreProgress(options.progress,this._rendererToken):this.desktop.start({
        population: this._population,
        mutation: this.mutation,
        speedMultiplier: this._speedMultiplier,
        circuitId: this.circuitId,
        mode: this._mode,
        modelId: this.modelId,
        rendererToken:this._rendererToken,
        ...(options.workerCount===undefined?{}:{workerCount:options.workerCount}),
        ...(options.running===undefined?{}:{running:options.running})
      })).then(info=>{
        this._sessionId=info.sessionId;this._starting=false;
        const buffered=this._bufferedSnapshot;this._bufferedSnapshot=null;
        if(buffered)this.applySnapshot(buffered);
        return info;
      });
    }

    async ready() {
      await this._start;
      let timer;
      try{await Promise.race([this._firstSnapshot,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Nessun dato dal nuovo motore: caricamento non confermato.')),10000);})]);}
      finally{clearTimeout(timer);}
      return this;
    }

    configureCircuit(id) {
      const definition = this.circuits.find(circuit => circuit.id === id);
      if (!definition) throw Error('Circuito sconosciuto: ' + id);
      const track = definition.points ? F.makeTrack(definition.points, definition.halfWidth, true, definition.boundaries, definition) : F.makeTrack();
      F.Vehicle.configureTrack(track,id);
      this.circuitId = id;
      this.circuit = definition;
      this.track = track;
    }

    placeholderCars() {
      return Array.from({length: this._population}, (_, id) => {
        const car = F.makeCar(this.track, id);
        car.brain = State.mirrorBrain(this.graph,id===this._inspectedAgentId);car.brainSnapshot=false;
        car.inputs = F.sense(this.track, car);
        car.physicsInputs = F.physicsSense(car, this.track);
        return car;
      });
    }

    applySnapshot(payload) {
      if (!payload) return;
      if(this._starting){if(payload.cars)this._bufferedSnapshot=payload;return;}
      if(payload.engine?.modelId&&payload.engine.modelId!==this.modelId)return;
      if(this._sessionId&&payload.engine?.sessionId!==this._sessionId){
        // Pool resize is the same renderer-owned trial; another model/import
        // owns a different token and must not feed this observer late data.
        if(!this._rendererToken||payload.engine?.rendererToken!==this._rendererToken)return;
        this._sessionId=payload.engine.sessionId;
      }
      if (payload.circuitId && payload.circuitId !== this.circuitId) this.configureCircuit(payload.circuitId);
      if(this._pendingPopulation!==null&&payload.population!==undefined&&payload.population!==this._pendingPopulation)return;
      if(payload.population!==undefined){this._population=payload.population;this._pendingPopulation=null;}
      if(payload.mutation!==undefined&&(this._pendingMutation===null||payload.mutation===this._pendingMutation)){this._mutation=payload.mutation;this._pendingMutation=null;}
      const workerSpeed = Number(payload.speedMultiplier);
      if (Number.isFinite(workerSpeed)) {
        // A snapshot from the previous worker tick can arrive after the user
        // drags the slider. Keep the requested value until the worker confirms
        // the same value, otherwise the label visibly jumps back to 1x.
        if (this._pendingSpeedMultiplier === null || Math.abs(workerSpeed - this._pendingSpeedMultiplier) < 1e-9) {
          this._speedMultiplier = workerSpeed;
          this._pendingSpeedMultiplier = null;
        }
      }
      if(payload.running!==undefined&&(this._pendingRunning==null||Boolean(payload.running)===this._pendingRunning)){this._running=Boolean(payload.running);this._pendingRunning=null;}
      if(payload.mode&&(this._pendingMode==null||payload.mode===this._pendingMode)){this._mode=payload.mode;this._pendingMode=null;}
      this.generation = payload.generation ?? this.generation;
      this.workerIndex=payload.workerIndex??this.workerIndex??0;
      this.elapsed = payload.elapsed ?? this.elapsed;
      if(payload.history!==undefined)this.history = payload.history;
      this.bestEver = payload.bestEver ?? this.bestEver;
      this.champion = payload.champion || this.champion;
      this.championStats=payload.championStats??this.championStats;
      if(payload.learningStats!==undefined)this.learningStats=payload.learningStats;
      if(payload.modelTest!==undefined)this.modelTest=payload.modelTest;
      this.engine = payload.engine || this.engine;
      if(payload.cars){const previous=new Map(this.cars.map(car=>[car.id,car.brain]));this.cars=payload.cars.map(source=>this.inflateCar(source,previous.get(source.id)));this._resolveFirstSnapshot?.();this._resolveFirstSnapshot=null;}
    }

    inflateCar(source,previous) {
      const car = {...source};
      car.inputs = Array.from(source.inputs || []);
      car.physicsInputs = Array.from(source.physicsInputs || []);
      car.outputs = Array.from(source.outputs || []);
      car.trail = (source.trail || []).map(point => [point[0], point[1]]);
      car.brainSnapshot=Boolean(source.brain);
      if(!source.brain){car.brain=previous?.activity?.length===0?previous:State.mirrorBrain(this.graph,false);return car;}
      car.brain=previous?.activity?.length===this.graph.n?previous:State.mirrorBrain(this.graph);
      if(this.graph.full){for(let i=0;i<car.brain.activeCount;i++)car.brain.activity[car.brain.active[i]]=0;}else car.brain.activity.fill(0);
      const active = source.brain?.active || [];
      const values = source.brain?.values || [];
      if (this.graph.full) {
        const count = Math.min(active.length, values.length, car.brain.active.length);
        for (let index = 0; index < count; index++) {
          const neuron = active[index];
          car.brain.active[index] = neuron;
          car.brain.activity[neuron] = values[index];
        }
        car.brain.activeCount = count;
        car.brain.peakActiveCount = count;
      } else {
        const count = Math.min(values.length, car.brain.activity.length);
        for (let index = 0; index < count; index++) car.brain.activity[index] = Number(values[index]) || 0;
      }
      return car;
    }

    post(command) {
      this.desktop.command(command).catch(error => {
        if (command?.type === 'setSpeed' && this._pendingSpeedMultiplier === command.value) this._pendingSpeedMultiplier = null;
        if(command?.type==='pause')this._pendingRunning=null;
        if(command?.type==='setMode')this._pendingMode=null;
        this.computeError=error.message;
        root.dispatchEvent(new CustomEvent(this.desktop===desktop?'desktop-compute-error':'desktop-test-error', {detail: error.message}));
      });
    }

    get population() {return this._population;}
    set population(value) {this._population = Math.max(4, Math.min(F.MAX_POPULATION, Math.round(Number(value) || 16)));this._pendingPopulation=this._population;}
    get mutation(){return this._mutation;}
    set mutation(value){this._mutation=F.clamp(Number(value)||0,0,.35);this._pendingMutation=this._mutation;this.post({type:'setMutation',value:this._mutation});}
    get speedMultiplier() {return this._speedMultiplier;}
    set speedMultiplier(value) {
      this._speedMultiplier = Math.max(.5, Math.min(30, Number(value) || 1));
      this._pendingSpeedMultiplier = this._speedMultiplier;
      this.post({type: 'setSpeed', value: this._speedMultiplier});
    }
    get running() {return this._running;}
    set running(value) {
      this._running = Boolean(value);
      this._pendingRunning=this._running;
      this.post({type: 'pause', value: this._running});
    }
    get mode() {return this._mode;}
    set mode(value) {
      this._mode = value || 'connectome';
      this._pendingMode=this._mode;
      this.post({type: 'setMode', value: this._mode});
    }

    setCircuit(id) {
      this.configureCircuit(id);
      this.post({type: 'setCircuit', value: id});
      this.cars = this.placeholderCars();
    }

    reset() {
      this.history = [];
      this.bestEver = -Infinity;
      this.champion = null;
      this.championStats=null;
      this.generation = 1;
      this.elapsed = 0;
      this.cars = this.placeholderCars();
      this.post({type: 'setPopulation', value: this._population});
    }

    evolve() {this.post({type: 'evolve'});}
    setInspectedAgent(id) {this._inspectedAgentId=Math.max(0,Math.min(this._population-1,Math.floor(Number(id)||0)));this.post({type:'inspectAgent',value:this._inspectedAgentId});}
    spawn(genomes) {this.post({type: 'spawn', genomes});}
    advance() {/* The worker pool owns the fixed-step clock. */}
    async reconnect(){const info=await this.desktop.info();this._sessionId=info.sessionId;activeGpuBackend=this.gpu;gpuBackends.set(this.desktop,this.gpu);return info;}
    dispose(stop = true) {
      this._unsubscribe?.();
      this._unsubscribe = null;
      this._unsubscribeError?.();
      this._unsubscribeError = null;
      if (stop) this.post({type: 'stop'});
      if (activeGpuBackend === this.gpu) activeGpuBackend = null;
      if(gpuBackends.get(this.desktop)===this.gpu)gpuBackends.delete(this.desktop);
      this.gpu?.dispose();
    }
  }

  F.DesktopGpuNeuralBackend = DesktopGpuNeuralBackend;
  F.DesktopSimulation = DesktopSimulation;
})(typeof globalThis !== 'undefined' ? globalThis : this);
