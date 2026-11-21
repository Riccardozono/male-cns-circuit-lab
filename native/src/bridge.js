// Compatibility layer for the existing, local simulation.
(() => {
  const models = new Map();
  const circuits = JSON.parse(nativeCircuits);
  const base = JSON.parse(nativeReducedGraph);
  const profile = '5.7.1';
  let sim;

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
      rays: FlySim.sensorDistances(sim.track, leader),
      cars: sim.cars.map(car => ({
        x: car.x,
        z: car.y,
        elevation: car.vehicle.elevationM || 0,
        heading: car.heading,
        alive: car.alive,
        speed: car.vehicle.speedMps,
        rpm: car.vehicle.rpm,
        gear: car.vehicle.gear,
        laps: car.laps,
        fitness: car.fitness,
        progress: car.bestProgress,
        bestLap: Number.isFinite(car.bestLapTime) ? car.bestLapTime : null,
        outputs: car.outputs,
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

  globalThis.nativeStart = (modelId, circuitId, population, seed) => {
    sim = new FlySim.Simulation(source(modelId), { modelId, circuitId, circuits, population, seed });
    return circuit();
  };
  globalThis.nativeTrack = circuit;
  globalThis.nativeSnapshot = snapshot;
  globalThis.nativeAdvance = ticks => {
    for (let i = 0; i < ticks; i++) sim.tick();
    return snapshot();
  };
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
    return JSON.stringify({
      model: modelId, circuit: circuitId, population: sim.population,
      seed: sim.seed, speed: sim.speedMultiplier,
    });
  };
})();
