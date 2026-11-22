// Compatibility layer for the existing, local simulation.
(() => {
  const models = new Map();
  const circuits = JSON.parse(nativeCircuits);
  const base = JSON.parse(nativeReducedGraph);
  const profile = '5.7.1';
  let sim;
  let twoLaps;
  let atlasIndices = [];

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
        for (const [name, { dtype, offset, length }] of Object.entries(metadata.arrays)) {
          graph[name] = new constructors[dtype](nativeFullGraph, offset, length);
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
    const leader = sim.cars.reduce((best, car) => {
      if (!best || (car.alive && !best.alive)) return car;
      return car.alive === best.alive && FlySim.compareAgents(car, best) < 0 ? car : best;
    }, null);
    return JSON.stringify({
      generation: sim.generation,
      ticks: sim.ticks,
      elapsed: sim.elapsed,
      neurons: sim.graph.n,
      edges: sim.graph.edgeCount,
      leader: leader.id,
      twoLaps: twoLaps ?? null,
      history: sim.history.slice(-7).map(({ generation, bestSafeProgress, maxLaps, bestLapTime }) =>
        ({ generation, bestSafeProgress: bestSafeProgress ?? 0, maxLaps: maxLaps ?? 0, bestLapTime })),
      rays: FlySim.sensorDistances(sim.track, leader),
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
    return JSON.stringify({
      label: sim.circuit.name,
      bounds: track.bounds,
      length: track.total / (track.pixelsPerMeter || 1),
      outer: project(track.outer),
      inner: project(track.inner),
      center: project(track.center),
    });
  }

  globalThis.nativeStart = (modelId, circuitId, population, seed,mutation) => {
    sim = new FlySim.Simulation(source(modelId), { modelId, circuitId, circuits, population, seed,mutation });
    twoLaps = null;
    atlasIndices = [];
    return circuit();
  };
  globalThis.nativeTrackTrial = () => {
    sim.onTrialTick = state => {
      if (twoLaps !== null) return;
      const times = state.cars.filter(car => car.laps === 2)
        .map(car => car.lapTimes[0] + car.lapTimes[1]);
      if (times.length) twoLaps = Math.min(...times);
    };
  };
  globalThis.nativeAtlas = () => {
    const g=sim.graph, data=[], step=Math.max(1,Math.ceil(g.n/9000));
    atlasIndices = [];
    for(let i=0;i<g.n;i+=step){
      const x=g.positions[i*3],y=g.positions[i*3+1],z=g.positions[i*3+2];
      if(x===g.missingPosition)continue;
      const cl=g.classNames[g.classCodes[i]]||'';
      const category=g.outputMask[i]?1:cl.startsWith('descending')?1:cl.startsWith('ascending')?2:cl.includes('visual')?3:0;
      data.push([x,y,z,category]);
      atlasIndices.push(i);
    }
    return JSON.stringify(data);
  };
  globalThis.nativeAtlasActivity = carId => {
    const activity = sim.cars[carId]?.brain.activity;
    return activity ? Float32Array.from(atlasIndices, i => activity[i]) : new Float32Array();
  };
  globalThis.nativeTrack = circuit;
  globalThis.nativeSnapshot = snapshot;
  globalThis.nativeAdvance = ticks => {
    for (let i = 0; i < ticks; i++) sim.tick();
    return snapshot();
  };
  globalThis.nativeMutation = value => { sim.mutation = value; };
  globalThis.nativeEvolve = () => { sim.evolve();return snapshot(); };
  globalThis.nativeSave = speed => {
    sim.speedMultiplier = speed;
    return MaleCNSProgress.encode(MaleCNSProgress.fromSimulation(sim), profile);
  };
  globalThis.nativeLoad = async data => {
    const { payload } = await MaleCNSProgress.decode(data, profile);
    if (payload.workers?.length !== 1 || payload.globalChampion !== null) {
      throw Error('Questa anteprima nativa apre salvataggi con un worker e senza campione globale.');
    }
    const { modelId, circuitId } = payload;
    const next = new FlySim.Simulation(source(modelId), { modelId, circuitId, circuits, population: 1 });
    MaleCNSProgress.validatePayload(payload, { graph: next.graph, circuits: next.circuits, maxWorkers: 1 });
    MaleCNSProgress.restore(next, payload.workers[0].state);
    sim = next;
    twoLaps = null;
    return JSON.stringify({
      model: modelId, circuit: circuitId, population: sim.population,
      seed: sim.seed, speed: sim.speedMultiplier,mutation:sim.mutation,
    });
  };
})();
