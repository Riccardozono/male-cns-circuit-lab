// Compatibility layer for the existing, local simulation.
(() => {
  const models = new Map();
  const circuits = JSON.parse(nativeCircuits);
  const base = JSON.parse(nativeReducedGraph);
  let sim;
  let trialDone = false;
  let inspectionId = null;
  let gpu = { state: 'cpu', adapter: null, dispatches: 0, error: null };
  let gpuReset = true;

  function configureGpu(s, mode) {
    if (typeof nativeGpuReset === 'function') nativeGpuReset();
    const enabled = typeof nativeGpu === 'function' && s.graph.full && mode === 'connectome';
    gpu = { state: enabled ? 'waiting' : 'cpu', adapter: null, dispatches: 0, error: null };
    gpuReset = true;
    if (enabled) {
      const graph = s.graph;
      const learning = FlySim.ensureLearning(graph);
      learning.gpuNodes = Uint32Array.from(learning.nodes);
      s.brainFactory = MaleCNSDesktopState.mirrorBrain;
      for (const car of s.cars) car.brain = s.brainFactory(s.graph);
    }
  }

  function leaderCar() {
    return sim.cars.reduce((best, car) => {
      if (!best || (car.alive && !best.alive)) return car;
      return car.alive === best.alive && FlySim.compareAgents(car, best) < 0 ? car : best;
    }, null);
  }

  function gpuFrame(selected, readOnly) {
    const g = sim.graph;
    const population = sim.cars.length;
    const request = {population, inspectedAgentId:selected, readOnly, reset:gpuReset,
      iterations:g.solver.iterationsPerControlTick, agentIds:sim.cars.map(car => car.id)};
    if (!readOnly) {
      const width = g.inputs.length, groupCount = g.learning.gainGroups;
      request.drives = new Float32Array(population * width);
      request.gains = new Float32Array(population * groupCount);
      const physicsGain = sim.circuitId === 'lab' ? FlySim.PHYSICS_ADAPTER_GAIN : FlySim.MAP_PHYSICS_ADAPTER_GAIN;
      for (const car of sim.cars) {
        request.gains.set(FlySim.synapticGains(g, car.genome), car.id * groupCount);
        if (!car.alive) continue;
        car.inputs = FlySim.sense(sim.track, car);
        car.physicsInputs = FlySim.physicsSense(car, sim.track);
        car.sensorVector = car.inputs.concat(car.physicsInputs);
        const mapping = car.genome.sensorMappingVersion ?? MaleCNSLearning.LEGACY_SENSOR_MAPPING_VERSION;
        const drives = nativeLearningInputs(g, Float64Array.from(car.genome.policyWeights),
          Float64Array.from(car.sensorVector), mapping, physicsGain);
        request.drives.set(drives, car.id * width);
      }
    }
    const packet = nativeGpu(g, request);
    const layout = MaleCNSDesktopState.packetLayout(packet.capacity, packet.readout, packet.budget);
    const agents = MaleCNSDesktopState.decodePacket(packet.words, layout, request, population);
    if (!readOnly) {
      gpu.state = 'active';
      gpu.adapter = packet.label;
      gpu.dispatches = packet.dispatches;
      gpuReset = false;
    }
    return agents;
  }

  function tick() {
    const generation = sim.generation;
    let overrides = null;
    if (sim.ticks % sim.neuralInterval === 0 && (gpu.state === 'active' || gpu.state === 'waiting')) {
      try {
        overrides = gpuFrame(inspectionId ?? leaderCar().id, false);
      } catch (error) {
        gpu.error = String(error.message || error);
        gpu.state = 'fallback';
        sim.brainFactory = FlySim.makeBrain;
        for (const car of sim.cars) if (car.brain.external)
          car.brain = MaleCNSDesktopState.restoreBrain(FlySim, sim.graph, car.brain);
        nativeGpuReset();
      }
    }
    sim.tick(overrides, Boolean(overrides));
    if (sim.generation !== generation) gpuReset = true;
  }

  function source(modelId) {
    if (models.has(modelId)) return models.get(modelId);
    let graph;
    switch (modelId) {
      case 'v2':
        graph = MaleCNSLegacy.buildV2(base);
        break;
      case 'v3':
        graph = MaleCNSLegacy[nativeV3GraphBuilder](base);
        break;
      case 'v4':
      case 'v5': {
        const metadata = JSON.parse(nativeFullMetadata);
        const constructors = {
          float64: Float64Array, float32: Float32Array, int32: Int32Array,
          uint32: Uint32Array, uint8: Uint8Array, int8: Int8Array,
        };
        graph = { ...metadata, compact: true, modelId: 'v4' };
        const binary = nativeLoadFullBytes();
        for (const [name, { dtype, offset, length }] of Object.entries(metadata.arrays)) {
          graph[name] = new constructors[dtype](binary, offset, length);
        }
        if (modelId === 'v5') graph = MaleCNSProfiles.buildV5(graph);
        break;
      }
      default:
        throw Error('Modello MaleCNS sconosciuto.');
    }
    models.set(modelId, graph);
    return graph;
  }

  function snapshot() {
    const leader = leaderCar();
    const viewCar = sim.cars[inspectionId] ?? leader;
    const track = sim.track, terrain = MaleCNSVehicle.Terrain.forTrack(track);
    const rays = FlySim.sensorDistances(track, viewCar), scale = track.pixelsPerMeter || 1;
    const point = (x, z) => [x, (terrain.sample(x, z).height + .52) * scale, z];
    const rayPoints = [point(viewCar.x, viewCar.y), ...rays.map((distance, index) => {
      const angle = viewCar.heading + FlySim.ANGLES[index];
      return point(viewCar.x + Math.cos(angle) * distance, viewCar.y + Math.sin(angle) * distance);
    })];
    return JSON.stringify({
      generation: sim.generation,
      ticks: sim.ticks,
      elapsed: sim.elapsed,
      neurons: sim.graph.n,
      edges: sim.graph.edgeCount,
      leader: leader.id,
      gpu,
      history: sim.history.slice(-32).map(h => ({
        generation:h.generation, bestSafeProgress:h.bestSafeProgress ?? h.bestProgress ?? 0,
        meanSafeProgress:h.meanSafeProgress ?? h.meanProgress ?? 0, bestProgress:h.bestProgress ?? 0,
        meanProgress:h.meanProgress ?? 0, best:h.best ?? 0, mean:h.mean ?? 0, stagnation:h.stagnation ?? 0,
        maxLaps:h.maxLaps ?? 0, bestLapTime:h.bestLapTime,
      })),
      stopped: !sim.running,
      rayCar: viewCar.id,
      rays, rayPoints,
      cars: sim.cars.map(car => ({
        x: car.x,
        z: car.y,
        elevation: car.vehicle.elevationM || 0,
        heading: car.heading,
        pitch: car.vehicle.pitch || 0,
        roll: car.vehicle.roll || 0,
        steeringAngle: car.vehicle.steeringAngle || 0,
        alive: car.alive,
        speed: car.vehicle.speedMps,
        rpm: car.vehicle.rpm,
        gear: car.vehicle.gear,
        laps: car.laps,
        fitness: car.fitness,
        progress: car.bestProgress,
        bestLap: Number.isFinite(car.bestLapTime) ? car.bestLapTime : null,
        outputs: car.outputs,
        longitudinalG: car.longitudinalG || 0,
        lateralG: car.lateralG || 0,
        abs: car.vehicle.absEnabled,
        tc: car.vehicle.tcEnabled,
      })),
    });
  }

  function circuit() {
    const { track } = sim;
    const terrain = MaleCNSVehicle.Terrain.forTrack(track);
    const project = points => points.map(({ x, y }) => [x, terrain.sample(x, y).height, y]);
    const point = (label, p, scene_only = false) => ({
      label, point: [p.x, terrain.sample(p.x, p.y).height, p.y], scene_only,
    });
    const landmarks = [point('Partenza / arrivo', track.center[0])];
    landmarks.push(...(sim.circuit.landmarks ?? []).map(p => point(p.label, p)));
    landmarks.push(...(track.widthStations ?? []).map(p =>
      point(`${p.label} · ${p.widthMeters.toFixed(1)} m`, p)));
    const widths = (track.widthStations ?? []).map(p => p.widthMeters);
    return JSON.stringify({
      label: sim.circuit.name,
      source: sim.circuit.sourceLabel ?? '',
      description: sim.circuit.description ?? '',
      width_min: widths.length ? Math.min(...widths) : track.halfWidth * 2,
      width_max: widths.length ? Math.max(...widths) : track.halfWidth * 2,
      landmarks,
      bounds: track.bounds,
      length: track.total / (track.pixelsPerMeter || 1),
      outer: project(track.outer),
      inner: project(track.inner),
      center: project(track.center),
    });
  }

  globalThis.nativeStart = (modelId, circuitId, population, seed,mutation,mode) => {
    sim = new FlySim.Simulation(source(modelId), { modelId, circuitId, circuits, population, seed,mutation });
    sim.mode = mode;
    configureGpu(sim, mode);
    trialDone = false;
    inspectionId = null;
    return circuit();
  };
  globalThis.nativeStartActor = (text, params, generation, previous) => {
    const bundle = JSON.parse(text), adjustments = JSON.parse(params);
    const population = adjustments.length || 1;
    if (generation === 1) {
      const data = MaleCNSLegacy.tagV3WideReadout(base);
      sim = new FlySim.Simulation(data,{modelId:'v3', circuits, circuitId:bundle.circuitId,
        population, seed:7717, mutation:0, learningEnabled:false});
      if (bundle.actor.footprintSensors === true) sim.graph.sensorProfile = MaleCNSLegacy.V3_CURRENT_SENSOR_PROFILE;
      configureGpu(sim, 'connectome');
    }
    sim.generation = generation;
    sim.spawn(Array.from({length:population}, () => bundle.genome));
    if (previous !== undefined && previous !== null) for (const car of sim.cars)
      car.previousGenerationLapTime = previous;
    nativeActorSetup(sim.graph, JSON.stringify(bundle.actor), params);
    sim.motorDecoder = nativeActorDrive;
    sim.running = true;
    inspectionId = null;
    trialDone = false;
    sim.onTrialTick = null;
  };
  globalThis.nativeActorResults = () => JSON.stringify(sim.cars.map(car => ({
    agentId:car.id, safe: FlySim.isSafeLearningOutcome(car) && !car.diagnosticVehicle,
    laps:car.laps, reason:car.reason || '', progressMeters:car.bestProgress / (sim.track.pixelsPerMeter || 1),
    fitness:car.fitness, lapTimes:car.lapTimes,
  })));
  globalThis.nativeTrackTrial = () => {
    trialDone = false;
    const packet = new Float64Array(sim.cars.length * 8);
    sim.onTrialTick = state => {
      if (trialDone) return;
      for (let index = 0; index < state.cars.length; ++index) {
        const car = state.cars[index];
        const flags = Number(car.alive) | (Number(Boolean(car.diagnosticVehicle)) << 1)
          | (Number(car.reason === 'limite 2 giri') << 2);
        const offset = index * 8;
        packet.set([car.id, flags, car.laps, car.bestProgress, car.lapTimes[0],
          car.lapTimes[1], car.lastLapStartTime, car.lapTimes.length], offset);
      }
      trialDone = nativeTrialObserve(state.generation, state.elapsed,
        state.track.pixelsPerMeter || 1, Boolean(state.motorDecoder), packet);
    };
    return sim.generation;
  };
  globalThis.nativeAtlasGraph = () => {
    const g = sim.graph;
    FlySim.ensureLearning(g);
    return g;
  };
  globalThis.nativeAtlasActivity = carId => {
    const car = sim.cars[carId];
    if (!car) return null;
    const g = sim.graph;
    // Paused or newly selected agents can be observed without any physics tick.
    let { activity } = car.brain;
    if (gpu.state === 'active' && !gpuReset) {
      try {
        const packet = gpuFrame(carId, true)[carId];
        activity = new Float32Array(g.n);
        for (let i = 0; i < packet.active.length; ++i) activity[packet.active[i]] = packet.values[i];
      } catch { /* The retained CPU mirror is still safe to inspect during fallback. */ }
    }
    return [activity, FlySim.synapticGains(g, car.genome)];
  };
  globalThis.nativeRaySelection = carId => { inspectionId = carId >= 0 ? carId : null; };
  globalThis.nativeInspect = carId => {
    const car = sim.cars[carId];
    const v = MaleCNSVehicle.telemetry(car.vehicle, true);
    const physics = car.physicsInputs?.length === FlySim.PHYSICS_SENSOR_COUNT
      ? car.physicsInputs : FlySim.physicsSense(car, sim.track);
    const width = FlySim.trackWidthAt(sim.track, car.lastAlong || 0).widthMeters;
    const ledger = [
      ...Object.entries(car.rewardBreakdown?.rewards ?? {}),
      ...Object.entries(car.rewardBreakdown?.penalties ?? {}).map(([label, amount]) => [label, -amount]),
    ];
    return JSON.stringify({
      car: carId, gearManual: v.gearboxMode === 'manual', shiftRemaining: v.shiftRemaining,
      reason: car.alive ? 'Attiva' : car.reason || 'Inattiva', diagnostic: !!car.diagnosticVehicle,
      tyreC: v.tyreC, tyreWear: v.tyreWear, brakeC: v.brakeC, pressureBar: v.pressureBar,
      fuelL: v.fuelL, enginePowerKw: v.enginePowerKw, downforceN: v.downforceN,
      roadGradePercent: v.roadGradePercent || 0, normalG: v.normalG ?? 1,
      totalG: car.totalG || 0, slipDeg: (car.slipAngle || 0) * 180 / Math.PI,
      width, loads: v.wheels.map(w => w.fz),
      reward: car.reward || 0, penalty: car.penalty || 0,
      lastLap: Number.isFinite(car.lastLapTime) ? car.lastLapTime : null,
      ledger: ledger.filter(([, amount]) => Number.isFinite(amount)),
      visual: [car.inputs[1],car.inputs[3],car.inputs[5]], physics,
    });
  };
  globalThis.nativeVehicle = (id, name, value) => {
    const car = sim.cars[id];
    if (!car) throw Error('Auto selezionata non disponibile');
    const v = car.vehicle;
    if (name === 'shift') {
      if (v.gearboxMode !== 'manual') return;
      if (!MaleCNSVehicle.shift(v, value)) return;
    } else if (name === 'mode') v.gearboxMode = value ? 'manual' : 'auto';
    else if (name === 'abs') v.absEnabled = !v.absEnabled;
    else if (name === 'tc') v.tcEnabled = !v.tcEnabled;
    car.diagnosticVehicle = true;
  };
  globalThis.nativeTrack = circuit;
  globalThis.nativeSnapshot = snapshot;
  globalThis.nativeAdvance = ticks => {
    for (let i = 0; i < ticks && sim.running && !trialDone; i++) tick();
    return snapshot();
  };
  globalThis.nativeMutation = value => { sim.mutation = value; };
  globalThis.nativeEvolve = () => {
    if (sim.mode !== 'connectome') throw Error('Evoluzione non disponibile durante la diagnostica.');
    sim.evolve();
    gpuReset = true;
    return snapshot();
  };
  globalThis.nativeCurrentSimulation = () => sim;
  globalThis.nativePrepareRestore = (modelId, circuitId) =>
    new FlySim.Simulation(source(modelId), { modelId, circuitId, circuits, population: 1 });
  globalThis.nativeCommitRestore = next => {
    next.running = true;
    sim = next;
    configureGpu(sim, 'connectome');
    inspectionId = null;
    trialDone = false;
  };

  globalThis.nativeCanParseDate = value => Number.isFinite(Date.parse(value));
  globalThis.nativeNormalizeLegacyDate = literal => {
    const date = JSON.parse(literal);
    if (typeof date !== 'string' || date.length > 40 || !/[\uD800-\uDFFF]/u.test(date)
      || !Number.isFinite(Date.parse(date))) return null;
    return JSON.stringify(date);
  };
  globalThis.nativeSaveContext = (modelId, live) => {
    const graph = live ? sim.graph : FlySim.compileGraph(source(modelId));
    const policy = FlySim.ensureLearning(graph);
    return [graph, policy, {
      modelId:graph.modelId, vehicleRevision:FlySim.Vehicle.REVISION, sensorCount:FlySim.SENSOR_COUNT,
      modelOutputs:graph.outputs.length, policyVersion:policy.version, policyWidth:policy.length,
      populationLimit:FlySim.MAX_POPULATION, rewardRevisions:FlySim.Rewards.SUPPORTED_REVISIONS,
      rewardKeys:FlySim.Rewards.rewardKeys, penaltyKeys:FlySim.Rewards.penaltyKeys,
      circuits:Object.fromEntries([['lab',1], ...circuits.circuits.map(c => [c.id,c.revision||1])]),
    }];
  };

  globalThis.nativeChampion = index => JSON.stringify(sim.champion && sim.championStats
    ? {genome:sim.champion, stats:sim.championStats, workerIndex:index} : null);
  globalThis.nativeBetter = (current, candidate) => {
    const a = JSON.parse(current), b = JSON.parse(candidate);
    if (!a) return true;
    for (const champion of [a,b]) if (champion.stats.bestLapTime === null) champion.stats.bestLapTime = Infinity;
    const compare = a.genome.policyWeights && b.genome.policyWeights
      ? FlySim.compareLearningAgents : FlySim.compareAgents;
    return compare(b.stats, a.stats) < 0;
  };
  globalThis.nativeAdopt = champion => sim.adoptChampion(JSON.parse(champion).genome);
})();
