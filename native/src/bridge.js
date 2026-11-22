// Compatibility layer for the existing, local simulation.
(() => {
  const models = new Map();
  const circuits = JSON.parse(nativeCircuits);
  const base = JSON.parse(nativeReducedGraph);
  const profile = '5.7.1';
  let sim;
  let trial;
  let atlas;
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
        for (let k = 0; k < width; ++k)
          request.drives[car.id * width + k] = FlySim.sensorDrive(g, car.genome, car.sensorVector, k, physicsGain);
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
        graph = MaleCNSLegacy.tagV3(base);
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
    return JSON.stringify({
      generation: sim.generation,
      ticks: sim.ticks,
      elapsed: sim.elapsed,
      neurons: sim.graph.n,
      edges: sim.graph.edgeCount,
      leader: leader.id,
      trial: trial ?? null,
      gpu,
      history: sim.history.slice(-32).map(h => ({
        generation:h.generation, bestSafeProgress:h.bestSafeProgress ?? h.bestProgress ?? 0,
        meanSafeProgress:h.meanSafeProgress ?? h.meanProgress ?? 0, bestProgress:h.bestProgress ?? 0,
        meanProgress:h.meanProgress ?? 0, best:h.best ?? 0, mean:h.mean ?? 0, stagnation:h.stagnation ?? 0,
        maxLaps:h.maxLaps ?? 0, bestLapTime:h.bestLapTime,
      })),
      stopped: !sim.running,
      rayCar: viewCar.id,
      rays: FlySim.sensorDistances(sim.track, viewCar),
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
    trial = null;
    inspectionId = null;
    atlas = null;
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
      atlas = null;
    }
    sim.generation = generation;
    sim.spawn(Array.from({length:population}, () => bundle.genome));
    if (previous !== undefined && previous !== null) for (const car of sim.cars)
      car.previousGenerationLapTime = previous;
    nativeActorSetup(sim.graph, JSON.stringify(bundle.actor), params);
    sim.motorDecoder = nativeActorDrive;
    sim.running = true;
    inspectionId = null;
    trial = null;
  };
  globalThis.nativeActorResults = () => JSON.stringify(sim.cars.map(car => ({
    agentId:car.id, safe: FlySim.isSafeLearningOutcome(car) && !car.diagnosticVehicle,
    laps:car.laps, reason:car.reason || '', progressMeters:car.bestProgress / (sim.track.pixelsPerMeter || 1),
    fitness:car.fitness, lapTimes:car.lapTimes,
    doneAt:trial?.finishedCars?.[car.id] ?? null,
  })));
  globalThis.nativeTrackTrial = () => {
    trial = { ticks: 0, generations: 0, currentGeneration: 1, maxLaps: 0,
      bestProgressMeters: 0, hit: null, generationSimSeconds: null, finishedCars: {}, done: false, limitReached: false };
    sim.onTrialTick = state => {
      if (trial.done) return;
      trial.ticks++;
      trial.currentGeneration = state.generation;
      const eligible = state.cars.filter(car => !car.diagnosticVehicle);
      for (const car of eligible) {
        trial.maxLaps = Math.max(trial.maxLaps, car.laps);
        trial.bestProgressMeters = Math.max(trial.bestProgressMeters,
          car.bestProgress / (state.track.pixelsPerMeter || 1));
      }
      const elapsed = trialClock();
      if (trialLimit > 0 && elapsed >= trialLimit) {
        trial.limitReached = true;
        trial.done = true;
        return;
      }
      for (const car of eligible) if (state.motorDecoder && car.laps === 2 && car.reason === 'limite 2 giri'
        && trial.finishedCars[car.id] === undefined) trial.finishedCars[car.id] = elapsed;
      if (!trial.hit) {
        const twoLaps = eligible.filter(car => car.laps === 2 && car.reason === 'limite 2 giri'
          && car.lapTimes.length === 2 && car.lapTimes.every(t => Number.isFinite(t) && t > 0));
        twoLaps.sort((a, b) => a.lastLapStartTime - b.lastLapStartTime || a.id - b.id);
        if (twoLaps.length) {
          const car = twoLaps[0];
          trial.hit = { generation: state.generation, agentId: car.id, lapTimes: car.lapTimes,
            twoLapSimSeconds: car.lapTimes[0] + car.lapTimes[1], wallToTwoLapsSeconds: elapsed };
        }
      }
      if (state.cars.every(car => !car.alive)) {
        trial.generations++;
        if (trial.hit?.generation === state.generation) {
          trial.generationSimSeconds = state.elapsed;
          trial.done = true;
        }
      }
    };
  };
  globalThis.nativeAtlas = () => {
    const g = sim.graph;
    const coords = MaleCNSAtlas.coordinates(g);
    const rows = new Float64Array(coords.indices.length * 11);
    const inputs = new Set(g.inputs);
    const readouts = new Set(FlySim.ensureLearning(g).nodes);
    coords.indices.forEach((i, j) => {
      const k = i * 3;
      const cls = g.classNames[g.classCodes[i]] || '';
      const flags = Number(inputs.has(i)) | (Number(readouts.has(i)) << 1)
        | (Number(cls.startsWith('descending')) << 2) | (Number(cls.startsWith('ascending')) << 3);
      rows.set([i, g.bodyIds[i], coords.positions[k], -coords.positions[k + 1], coords.positions[k + 2],
        g.classCodes[i], g.sideCodes[i], flags, g.positions[k], g.positions[k+1], g.positions[k+2]], j * 11);
    });
    atlas = { coords, inputs, readouts };
    return [rows, JSON.stringify(g.classNames)];
  };
  globalThis.nativeAtlasActivity = (carId, filter, limit, focus) => {
    const car = sim.cars[carId];
    if (!car || !atlas) return [new Float32Array(), '[]'];
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
    const { coords, inputs, readouts } = atlas;
    const mask = new Uint8Array(g.n);
    if (limit) for (const i of coords.indices) {
      mask[i] = Number(filter === 0 || (filter === 1 && Math.abs(activity[i]) > .002)
        || (filter === 2 && inputs.has(i)) || (filter === 3 && readouts.has(i))
        || (filter === 4 && g.classNames[g.classCodes[i]]?.startsWith('descending')));
    }
    const edges = MaleCNSAtlas.edges(g, activity, coords.valid, mask, limit, focus,
      FlySim.synapticGains(g, car.genome));
    return [Float32Array.from(activity), JSON.stringify(edges)];
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
  let trialClock = () => 0;
  let trialLimit = 0;
  globalThis.nativeAdvance = (ticks, trialSeconds = 0, limitSeconds = 0) => {
    if (trial) {
      const start = nativeWallNow();
      trialClock = () => trialSeconds + nativeWallNow() - start;
      trialLimit = limitSeconds;
    }
    for (let i = 0; i < ticks && sim.running && !trial?.done; i++) tick();
    return snapshot();
  };
  globalThis.nativeMutation = value => { sim.mutation = value; };
  globalThis.nativeEvolve = () => {
    if (sim.mode !== 'connectome') throw Error('Evoluzione non disponibile durante la diagnostica.');
    sim.evolve();
    gpuReset = true;
    return snapshot();
  };
  globalThis.nativeSave = speed => {
    sim.speedMultiplier = speed;
    return MaleCNSProgress.encode(MaleCNSProgress.fromSimulation(sim), profile);
  };
  function restore(modelId, circuitId, state) {
    const next = new FlySim.Simulation(source(modelId), { modelId, circuitId, circuits, population: 1 });
    MaleCNSProgress.restore(next, state);
    next.running = true;
    sim = next;
    configureGpu(sim, 'connectome');
    inspectionId = null;
    atlas = null;
    trial = null;
    return { model: modelId, circuit: circuitId, population: sim.population,
      seed: sim.seed, speed: sim.speedMultiplier, mutation: sim.mutation };
  }

  async function checkedPayload(text) {
    const { payload } = await MaleCNSProgress.decode(text, profile);
    const graph = FlySim.compileGraph(source(payload.modelId));
    MaleCNSProgress.validatePayload(payload, { graph, circuits: [{id:'lab',revision:1}, ...circuits.circuits] });
    return payload;
  }

  globalThis.nativeLoad = async text => {
    const p = await checkedPayload(text);
    if (p.workers.length !== 1 || p.globalChampion !== null) {
      throw Error('La prova a riga di comando richiede un worker e nessun campione globale.');
    }
    return JSON.stringify(restore(p.modelId, p.circuitId, p.workers[0].state));
  };

  globalThis.nativeDecodeSave = async text => JSON.stringify(await checkedPayload(text));
  globalThis.nativeRestoreState = (model, circuitId, state) =>
    JSON.stringify(restore(model, circuitId, JSON.parse(state)));
  globalThis.nativeCaptureState = speed => {
    sim.speedMultiplier = speed;
    return JSON.stringify(MaleCNSProgress.capture(sim));
  };
  globalThis.nativeSavePool = (workers, champion) => {
    const p = {modelId:sim.modelId, circuitId:sim.circuitId,
      graph:MaleCNSProgress.compatibleGraph(sim.graph), vehicleRevision:MaleCNSVehicle.REVISION,
      workers:JSON.parse(workers).map((state, index) => ({index, state})),
      globalChampion:JSON.parse(champion)};
    MaleCNSProgress.validatePayload(p, {graph:sim.graph,circuits:sim.circuits});
    return MaleCNSProgress.encode(p, profile);
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
