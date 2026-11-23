'use strict';

const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
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
    if (count === 4) {
      const text = fs.readFileSync(input, 'utf8');
      const rewritten = text.replace('"schema": 1,', '"schema": 1e0,')
        .replace(/"seed": (\d+),/g, '"seed": $1.0,')
        .replace(/"population": (\d+),/g, '"population": $1e0,');
      assert.notEqual(rewritten, text);
      const formatted = path.join(directory, 'equivalent-format.malecns-save');
      fs.writeFileSync(formatted, rewritten);
      assert.equal(run(['--probe-pool', formatted, output]).workerCount, count);
      const historical = structuredClone(p);
      for (const worker of historical.workers) for (const row of worker.state.history) {
        delete row.bestSafeProgress;
        delete row.meanSafeProgress;
      }
      historical.workers[0].state.generation = 4294967301;
      save.validatePayload(historical, {graph: sims[0].graph, circuits: sims[0].circuits});
      fs.writeFileSync(formatted, await save.encode(historical, version));
      const restoredHistorical = run(['--probe-pool', formatted, output]);
      assert.equal(restoredHistorical.workerCount, count);
      assert.equal(restoredHistorical.generation, historical.workers[0].state.generation);
      const {checksum: _, ...body} = JSON.parse(text);
      for (const [date, accepted] of [
        ['22 Nov 2026 12:00 GMT (\ud800)', true],
        ['2016-12-31T23:59:60.000Z', false],
      ]) {
        body.savedAt = date;
        const checksum = {algorithm: 'SHA-256', value: createHash('sha256').update(JSON.stringify(body)).digest('hex')};
        const stamped = JSON.stringify({...body, checksum});
        fs.writeFileSync(formatted, stamped);
        if (accepted) {
          await save.decode(stamped, version);
          assert.equal(run(['--probe-pool', formatted, output]).workerCount, count);
          const overflow = stamped.replace('"lapTime":null', '"lapTime":1e999');
          assert.notEqual(overflow, stamped);
          const legacy = await save.decode(overflow, version);
          assert.throws(() => save.validatePayload(legacy.payload, {graph: sims[0].graph, circuits: sims[0].circuits}));
          fs.writeFileSync(formatted, overflow);
          assert.throws(() => run(['--probe-pool', formatted, output]));
        } else {
          await assert.rejects(() => save.decode(stamped, version), /Data del salvataggio/);
          assert.throws(() => run(['--probe-pool', formatted, output]), /Data del salvataggio/);
        }
      }
      for (const tamper of [
        p => { p.workers[1].state.circuitRevision++; },
        p => { delete p.workers[1].state.learningFrontier.lapTime; },
        p => { p.workers[2].state.optimizer.sigma[0] = 0; },
        p => { p.workers[0].state.history[0].rewardBreakdown.rewards.progress++; },
        p => { p.globalChampion.workerIndex = 4; },
      ]) {
        const invalid = structuredClone(p);
        tamper(invalid);
        assert.throws(() => save.validatePayload(invalid, {graph: sims[0].graph, circuits: sims[0].circuits}));
        fs.writeFileSync(formatted, await save.encode(invalid, version));
        assert.throws(() => run(['--probe-pool', formatted, output]));
      }
    }
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

async function profileChecks(directory) {
  const profiles = [
    ['', legacy.tagV3],
    ['--male-cns-training-copy-v3', legacy.tagV3WideReadout],
    ['--male-cns-training-copy-v3-baseline', legacy.tagV3TrainingBaseline],
    ['--male-cns-training-copy-v3-current', legacy.tagV3TrainingCurrent],
  ];
  const results = [];
  for (const [i, [flag, build]] of profiles.entries()) {
    const flags = flag ? [flag] : [];
    const sim = new simulation.Simulation(build(graph), {
      circuitId: 'monza', circuits, population: 4,
    });
    const savePath = path.join(directory, `new-profile-${i}.malecns-save`);
    const {snapshot} = run(['--probe', 'v3', 'monza', '4', '120', savePath, ...flags]);
    for (let tick = 0; tick < 120; ++tick) sim.tick();
    assert.equal(snapshot.generation, sim.generation);
    for (const [index, car] of snapshot.cars.entries()) {
      const expected = sim.cars[index];
      assert.ok(Math.abs(car.x - expected.x) < 1e-5);
      assert.ok(Math.abs(car.z - expected.y) < 1e-5);
      assert.ok(Math.abs(car.speed - expected.vehicle.speedMps) < 1e-5);
      car.outputs.forEach((value, motor) => assert.ok(Math.abs(value - expected.outputs[motor]) < 1e-5));
    }
    const native = (await save.decode(fs.readFileSync(savePath, 'utf8'), version)).payload;
    assert.deepEqual(native.graph, save.compatibleGraph(sim.graph));
    save.validatePayload(native, {graph: sim.graph, circuits: sim.circuits});

    const input = path.join(directory, `reference-profile-${i}.malecns-save`);
    const exported = path.join(directory, `roundtrip-profile-${i}.malecns-save`);
    const expected = save.fromSimulation(sim);
    const peer = new simulation.Simulation(build(graph), {
      circuitId: 'monza', circuits, population: 4, seed: 107720,
    });
    expected.workers.push({index: 1, state: save.capture(peer)});
    fs.writeFileSync(input, await save.encode(expected, version));
    const restored = run(['--probe-pool', input, exported, ...flags]);
    assert.equal(restored.workerCount, 2);
    assert.equal(restored.elapsed, 0);
    expected.workers.forEach(({state}) => { state.elapsedAtSave = 0; });
    const roundtrip = await save.decode(fs.readFileSync(exported, 'utf8'), version);
    assert.deepEqual(roundtrip.payload, expected);
    for (const [other] of profiles) {
      if (flag === other) continue;
      assert.throws(() => run(['--probe-pool', input, exported, ...(other ? [other] : [])]),
        /Dati neurali o fisica incompatibili/);
    }
    results.push({profile: flag || 'standard', workers: 2, controlReplay: true, roundtrip: true,
      rejectedOtherProfiles: true, policyReadouts: sim.graph.learning.nodes.length});
  }
  return results;
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
    const v3Profiles = await profileChecks(directory);
    const gpu = gpuChecks();
    console.log(JSON.stringify({passed: true, pool, v3Profiles, gpu}, null, 2));
  } finally {
    for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
    fs.rmdirSync(directory);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
