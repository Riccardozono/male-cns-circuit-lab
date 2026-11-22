'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const simulation = require('../outputs/simulation.js');
const legacy = require('../outputs/legacy-models.js');
const save = require('../outputs/progress-save.js');
const circuits = require('../outputs/data/circuits.json');
const graph = require('../outputs/data/connectome.json');

const version = '5.7.1';
const executable = path.resolve(process.argv[2]);
const run = (args, overrides = {}) => JSON.parse(execFileSync(executable, args, {
  windowsHide: true, encoding: 'utf8', timeout: 150_000, env: {...process.env, ...overrides},
  stdio: ['ignore', 'pipe', 'pipe'],
}));

async function poolChecks(directory) {
  const report = [];
  for (const [source, count] of [
    [legacy.buildV2(graph), 1],
    [legacy.tagV3(graph), 2],
    [legacy.tagV3(graph), 4],
  ]) {
    const create = (index) => new simulation.Simulation(source, {
      population: 4, seed: 7717 + index * 100003, circuitId: 'monza', circuits,
    });
    const sims = Array.from({length: count}, (_, i) => create(i));
    sims.forEach((sim, i) => {
      for (let n = 0; n < 2 + i; n++) sim.evolve();
      for (let n = 0; n < 5 + i; n++) sim.tick();
    });
    const p = save.fromSimulation(sims[0]);
    p.workers = sims.map((sim, index) => ({index, state: save.capture(sim)}));
    const workerIndex = count - 1;
    p.globalChampion = {
      genome: p.workers[workerIndex].state.genomes[0],
      stats: {fitness: 22, bestProgress: 12, laps: 0, bestLapTime: null},
      workerIndex,
    };
    p.workers[0].state.externalChampion = p.workers[0].state.genomes[1];
    save.validatePayload(p, {graph: sims[0].graph, circuits: sims[0].circuits});
    const input = path.join(directory, `input-${count}.malecns-save`);
    const output = path.join(directory, `output-${count}.malecns-save`);
    fs.writeFileSync(input, await save.encode(p, version));
    const restored = run(['--probe-pool', input, output]);
    assert.equal(restored.workerCount, count);
    assert.equal(restored.elapsed, 0);
    const roundtrip = (await save.decode(fs.readFileSync(output, 'utf8'), version)).payload;
    save.validatePayload(roundtrip, {graph: sims[0].graph, circuits: sims[0].circuits});
    const details = roundtrip.workers.map((worker, i) => {
      assert.equal(worker.state.elapsedAtSave, 0);
      return {...worker, state: {...worker.state, elapsedAtSave: p.workers[i].state.elapsedAtSave}};
    });
    assert.deepEqual({...roundtrip, workers: details}, p);
    const replay = run(['--probe-pool', input, output, '12']);
    assert.equal(replay.workerCount, count);
    assert.equal(replay.ticks, 12);
    const resumed = (await save.decode(fs.readFileSync(output, 'utf8'), version)).payload;
    assert.ok(resumed.workers.every(w => Math.abs(w.state.elapsedAtSave - 0.2) < 1e-8));
    assert.deepEqual(resumed.globalChampion, p.globalChampion);
    const wrong = path.join(directory, `wrong-${count}.malecns-save`);
    fs.writeFileSync(wrong, await save.encode(p, '5.7.0'));
    assert.throws(() => run(['--probe-pool', wrong, output]), /richiede esattamente/);
    const corrupt = JSON.parse(await save.encode(p, version));
    corrupt.payload.workers[0].state.mutation = 0.15;
    fs.writeFileSync(wrong, JSON.stringify(corrupt));
    assert.throws(() => run(['--probe-pool', wrong, output]), /checksum/i);
    report.push({model: p.modelId, workers: count, preserved: true, resumed: true, rejectsInvalid: true});
  }
  return report;
}

function gpuChecks() {
  return ['v4', 'v5'].map(model => {
    const {before: gpu, after: cpu} = run(['--probe-gpu', model, '4', '30', '--lose-device']);
    assert.equal(gpu.gpu.state, 'active', gpu.gpu.error ?? 'GPU non attiva');
    assert.ok(gpu.gpu.dispatches >= 4);
    assert.ok(gpu.cars.some(c => c.speed > 0));
    assert.equal(cpu.gpu.state, 'fallback');
    assert.equal(cpu.generation, gpu.generation);
    assert.equal(cpu.ticks, gpu.ticks + 12);
    assert.ok(cpu.elapsed > gpu.elapsed);
    const {before: noGpu} = run(['--probe-gpu', model, '4', '18'], {MALE_CNS_GPU: 'cpu'});
    assert.equal(noGpu.gpu.state, 'fallback');
    assert.equal(noGpu.gpu.dispatches, 0);
    return {model, adapter: gpu.gpu.adapter, dispatches: gpu.gpu.dispatches,
      speed: Math.max(...gpu.cars.map(c => c.speed)), deviceLossPreservedGeneration: true,
      unavailablePreservedTicks: noGpu.ticks === 18};
  });
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'male-cns-native-qa-'));
  try {
    const pool = await poolChecks(directory);
    const gpu = gpuChecks();
    console.log(JSON.stringify({passed: true, pool, gpu}, null, 2));
  } finally {
    for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
    fs.rmdirSync(directory);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
