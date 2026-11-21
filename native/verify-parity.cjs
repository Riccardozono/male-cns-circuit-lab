'use strict';
// Development-only reference checks. The distributed .exe does not use Node.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {performance} = require('node:perf_hooks');
const simulation = require('../outputs/simulation.js');
const legacy = require('../outputs/legacy-models.js');
const profiles = require('../outputs/model-profiles.js');
const saves = require('../outputs/progress-save.js');
const circuits = require('../outputs/data/circuits.json');
const reduced = require('../outputs/data/connectome.json');

function fullModels() {
  const metadata = require('../outputs/data/connectome-full.json');
  const binary = fs.readFileSync(path.join(__dirname, '../outputs/data', metadata.binary));
  const buffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
  const constructors = {
    float64: Float64Array, float32: Float32Array, int32: Int32Array,
    uint32: Uint32Array, uint8: Uint8Array, int8: Int8Array,
  };
  const v4 = {...metadata, compact: true, modelId: 'v4'};
  for (const [name, {dtype, offset, length}] of Object.entries(metadata.arrays)) {
    v4[name] = new constructors[dtype](buffer, offset, length);
  }
  return {v4, v5: profiles.buildV5(v4)};
}

async function main() {
  if (!process.argv[2]) throw Error('Usage: node native/verify-parity.cjs <native executable>');
  const executable = path.resolve(process.argv[2]);
  const sources = {v2: legacy.buildV2(reduced), v3: legacy.tagV3(reduced), ...fullModels()};
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'male-cns-native-'));
  const savePath = path.join(directory, 'probe.malecns-save');
  const report = [];
  try {
    for (const [modelId, circuitId, population, ticks] of [
      ['v2', 'lab', 4, 120], ['v2', 'monza', 16, 180],
      ['v3', 'monaco', 4, 120], ['v4', 'le-mans', 4, 45], ['v5', 'monza', 4, 60],
    ]) {
      const text = execFileSync(executable, ['--probe', modelId, circuitId, population, ticks, savePath], {
        encoding: 'utf8', timeout: 120_000, windowsHide: true,
      });
      const native = JSON.parse(text);
      const sim = new simulation.Simulation(sources[modelId], {modelId, circuitId, circuits, population, seed: 7717});
      const begin = performance.now();
      for (let i = 0; i < ticks; i++) sim.tick();
      const referenceSeconds = (performance.now() - begin) / 1000;
      const frame = native.snapshot;
      assert.equal(frame.neurons, sim.graph.n);
      assert.equal(frame.edges, sim.graph.edgeCount);
      assert.equal(frame.generation, sim.generation);
      assert.equal(frame.cars.length, sim.cars.length);
      assert.equal(frame.ticks, sim.ticks);
      let maximumError = 0;
      const close = (a, b) => {
        maximumError = Math.max(maximumError, Math.abs(a - b));
        assert.ok(Math.abs(a - b) <= 1e-5, `${modelId} ${circuitId}: ${a} != ${b}`);
      };
      for (const [i, expected] of sim.cars.entries()) {
        const actual = frame.cars[i];
        for (const [a, b] of [
          [actual.x, expected.x], [actual.z, expected.y], [actual.heading, expected.heading],
          [actual.speed, expected.vehicle.speedMps], [actual.fitness, expected.fitness],
          [actual.progress, expected.bestProgress],
          ...actual.outputs.map((value, j) => [value, expected.outputs[j]]),
        ]) close(a, b);
        assert.equal(actual.alive, expected.alive);
        assert.equal(actual.laps, expected.laps);
      }
      const saved = await saves.decode(fs.readFileSync(savePath, 'utf8'), '5.7.1');
      saves.validatePayload(saved.payload, {graph: sim.graph, circuits: sim.circuits});
      assert.equal(saved.payload.workers[0].state.generation, sim.generation);
      assert.equal(saved.payload.workers[0].state.population, population);
      assert.equal(native.roundtrip, true);
      report.push({
        modelId, circuitId, population, ticks, maximumError, saved: true,
        nativeSeconds: native.seconds, referenceSeconds,
      });
    }
  } finally {
    if (fs.existsSync(savePath)) fs.unlinkSync(savePath);
    fs.rmdirSync(directory);
  }
  console.log(JSON.stringify({passed: true, cases: report}, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
