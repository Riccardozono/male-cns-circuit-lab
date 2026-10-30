'use strict';

// Isolated CPU-only natural-generation A/B on the user's V3/Monza gen.64 save.
// The four action-feedback weights begin at zero; no app/save/release is written.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const savePath = 'C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const output = path.join(root, '.impeccable/review/learning-ml/saved-v3-action-feedback-ab-20261023-01');
if (fs.existsSync(output)) throw new Error('Refusing to overwrite an existing experiment.');
if (process.versions.node !== '24.19.0') throw new Error('Pinned Node 24.19.0 required.');

const P = require(path.join(root, 'outputs/progress-save.js'));
const Legacy = require(path.join(root, 'outputs/legacy-models.js'));
const Learning = require(path.join(root, 'outputs/neural-learning.js'));
const circuits = require(path.join(root, 'outputs/data/circuits.json'));
const feedback = require('./v3-action-feedback.cjs');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const sourcePaths = ['outputs/simulation.js', 'outputs/neural-learning.js', 'outputs/rewards.js', 'outputs/progress-save.js', 'work/v3-action-feedback.cjs'];
const sourceHashes = () => Object.fromEntries(sourcePaths.map(file => [file, sha(fs.readFileSync(path.join(root, file)))]));
const baselineHashes = sourceHashes();

function compileSimulation(file) {
  const original = fs.readFileSync(file, 'utf8');
  const gate = "const useFunctionalCrossover=this.modelId==='v3'&&donorCandidates.length>0&&this.random()<EVOLUTION_RULES.functionalCrossoverRate;";
  if (!original.includes(gate) || original.indexOf(gate) !== original.lastIndexOf(gate)) throw new Error('Expected one V3 functional-crossover gate.');
  const source = original.replace(gate, 'const useFunctionalCrossover=false;');
  const compiled = new Module(file, module);
  compiled.filename = file;
  compiled.paths = Module._nodeModulePaths(path.dirname(file));
  compiled._compile(source, file);
  compiled.loaded = true;
  return { api: compiled.exports, sourceSha256: sha(source) };
}

function simulation(F, state, connectome) {
  const sim = new F.Simulation(Legacy.tagV3(structuredClone(connectome)), {
    modelId: 'v3', population: state.population, circuitId: 'monza', circuits, seed: state.seed
  });
  P.restore(sim, structuredClone(state));
  const migration = feedback.extendSimulation(sim);
  return { sim, migration };
}

function dynamicsProjection(sim) {
  return sim.cars.map(car => {
    const { genome, ...rest } = car;
    return { ...rest, genome: { ...genome, policyWeights: genome.policyWeights.slice(0, feedback.LEGACY_LENGTH) } };
  });
}

function exactIdentityPreflight(F, state, connectome, hooks) {
  const original = new F.Simulation(Legacy.tagV3(structuredClone(connectome)), {
    modelId: 'v3', population: state.population, circuitId: 'monza', circuits, seed: state.seed
  });
  P.restore(original, structuredClone(state));
  const extended = simulation(F, state, connectome).sim;
  original.running = true;
  extended.running = true;
  hooks.setFeedbackEnabled(false);
  for (let tick = 0; tick < 360; tick++) {
    original.tick();
    extended.tick();
  }
  const exact = JSON.stringify(dynamicsProjection(original)) === JSON.stringify(dynamicsProjection(extended)) &&
    original.random.getState() === extended.random.getState() && original.generation === extended.generation;
  original.running = false;
  extended.running = false;
  if (!exact) throw new Error('Zero-head extended controller differs from the saved V3 action/physics prefix.');
  return { ticks: 360, controls: 60, exactVehicleBrainAndRngPrefix: true };
}

function runArm(F, state, connectome, hooks, name, enableFeedback, generations = 3) {
  const { sim, migration } = simulation(F, state, connectome);
  hooks.setFeedbackEnabled(enableFeedback);
  sim.running = true;
  const firstGeneration = sim.generation;
  const rows = [];
  let generationTicks = 0;
  let totalTicks = 0;
  let terminal = new Map();
  const started = Date.now();
  sim.onTrialTick = current => {
    if (!current.cars.every(car => !car.alive)) return;
    for (const car of current.cars) if (!terminal.has(car.id)) terminal.set(car.id, {
      id: car.id,
      progressM: car.bestProgress / (current.track.pixelsPerMeter || 1),
      laps: car.laps,
      bestLapTime: Number.isFinite(car.bestLapTime) ? car.bestLapTime : null,
      fitness: car.fitness,
      reason: car.reason || '',
      safe: F.isSafeLearningOutcome(car)
    });
  };
  while (sim.generation < firstGeneration + generations) {
    if (generationTicks >= 60000) throw new Error(`${name}: generation watchdog reached.`);
    const generation = sim.generation;
    sim.tick();
    generationTicks++;
    totalTicks++;
    if (sim.generation !== generation) {
      if (terminal.size !== state.population) throw new Error(`${name}: terminal population census incomplete (${terminal.size}/${state.population}).`);
      const outcomes = [...terminal.values()].sort((a, b) => a.id - b.id);
      const safe = outcomes.filter(value => value.safe);
      const history = sim.history.at(-1);
      const row = {
        evaluatedGeneration: history.generation,
        offspringGeneration: sim.generation,
        ticks: generationTicks,
        safeAgentCount: safe.length,
        maxSafeLaps: safe.length ? Math.max(...safe.map(value => value.laps)) : 0,
        bestSafeProgressM: safe.length ? Math.max(...safe.map(value => value.progressM)) : null,
        bestSafeLapTime: safe.map(value => value.bestLapTime).filter(Number.isFinite).length ? Math.min(...safe.map(value => value.bestLapTime).filter(Number.isFinite)) : null,
        bestSafeFitness: safe.length ? Math.max(...safe.map(value => value.fitness)) : null,
        feedbackParameterStats: {
          min: Math.min(...sim.cars.map(car => Math.min(...car.genome.policyWeights.slice(feedback.LEGACY_LENGTH)))),
          max: Math.max(...sim.cars.map(car => Math.max(...car.genome.policyWeights.slice(feedback.LEGACY_LENGTH))))
        },
        terminalOutcomes: outcomes
      };
      rows.push(row);
      console.log('ACTION_FEEDBACK_GENERATION ' + JSON.stringify({ arm: name, generation: row.evaluatedGeneration, maxSafeProgressM: row.bestSafeProgressM, maxSafeLaps: row.maxSafeLaps, safeAgents: row.safeAgentCount, ticks: row.ticks }));
      terminal = new Map();
      generationTicks = 0;
    }
  }
  sim.running = false;
  return { name, feedbackEnabled: enableFeedback, startGeneration: firstGeneration, population: state.population, migration, rows, totalTicks, wallSeconds: (Date.now() - started) / 1000 };
}

async function main() {
  const saveBytes = fs.readFileSync(savePath);
  const saveSha = sha(saveBytes);
  const decoded = await P.decode(saveBytes.toString('utf8'), '5.6.0');
  const state = decoded.payload.workers[0].state;
  if (decoded.appVersion !== '5.6.0' || decoded.payload.modelId !== 'v3' || decoded.payload.circuitId !== 'monza' ||
      state.generation !== 64 || state.seed !== 7717 || state.population !== 40 || state.rewardRevision !== 'progress-3') {
    throw new Error('Unexpected V3/Monza gen.64 save identity.');
  }
  const connectome = JSON.parse(fs.readFileSync(path.join(root, 'outputs/data/connectome.json'), 'utf8'));
  const file = require.resolve(path.join(root, 'outputs/simulation.js'));
  const compiled = compileSimulation(file);
  const hooks = feedback.install(Learning);
  try {
    const identity = exactIdentityPreflight(compiled.api, state, connectome, hooks);
    const control = runArm(compiled.api, state, connectome, hooks, 'zero-feedback-control', false, 3);
    const treatment = runArm(compiled.api, state, connectome, hooks, 'learned-action-feedback', true, 3);
    const identicalSavedGeneration = JSON.stringify(control.rows[0].terminalOutcomes) === JSON.stringify(treatment.rows[0].terminalOutcomes);
    if (!identicalSavedGeneration) throw new Error('Gen.64 start replay differs between paired arms.');
    const afterSourceHashes = sourceHashes();
    const saveUnchanged = sha(fs.readFileSync(savePath)) === saveSha;
    const sourcesUnchanged = JSON.stringify(baselineHashes) === JSON.stringify(afterSourceHashes);
    const report = {
      format: 'male-cns-saved-v3-action-feedback-ab-v1',
      appVersion: '5.6.0',
      passed: Boolean(identity.exactVehicleBrainAndRngPrefix && identicalSavedGeneration && saveUnchanged && sourcesUnchanged && control.rows.length === 3 && treatment.rows.length === 3),
      learningSucceeded: Math.max(...control.rows.map(row => row.maxSafeLaps), ...treatment.rows.map(row => row.maxSafeLaps)) >= 2,
      save: { sha256: saveSha, unchanged: saveUnchanged, model: 'V3', circuit: 'Monza', worker: 0, generation: 64, seed: state.seed, population: state.population, rewardRevision: state.rewardRevision },
      runtime: 'Node 24.19.0 CPU-only; no CUDA kernels used',
      method: 'Paired natural full-population evolution from independent in-memory restores of the original saved worker-0 state. Four learned coefficients read only the previous emitted steering and net longitudinal motor command; these are causal efference-copy features, not route, position, speed targets, clock, or teacher actions. The unchanged 202-parameter decoder, connectome, sensors, physics, rewards, selection, and ES are reused. Functional block crossover is disabled identically in both in-memory arms because its legacy bias indices do not describe the extended vector.',
      settings: { generationsPerArm: 3, population: state.population, addedParameters: feedback.EXTRA, parameterScales: [0.08, 0.04, 0.04, 0.12], initialParameters: [0, 0, 0, 0], mutation: state.mutation, crossover: 'disabled in both arms for valid extended-vector semantics' },
      preflight: identity,
      startingGenerationMatch: identicalSavedGeneration,
      inMemorySimulationSha256: compiled.sourceSha256,
      control,
      treatment,
      comparison: {
        safeProgressDeltaMetersByGeneration: treatment.rows.map((row, index) => row.bestSafeProgressM - control.rows[index].bestSafeProgressM),
        safeLapDeltaByGeneration: treatment.rows.map((row, index) => row.maxSafeLaps - control.rows[index].maxSafeLaps),
        controlProgressM: control.rows.map(row => row.bestSafeProgressM),
        treatmentProgressM: treatment.rows.map(row => row.bestSafeProgressM),
        promoteTreatment: false
      },
      sourceHashes: { before: baselineHashes, after: afterSourceHashes, unchanged: sourcesUnchanged },
      boundary: 'One saved V3/Monza worker and one seed, three natural generations per arm. Exact preflight and gen.64 match establish identity/integrity, not learning success. Promotion requires persistent safe lap completion and replication. No application source, user save, version, package, tag, or release was modified.'
    };
    if (!report.passed) throw new Error('A/B integrity gate failed.');
    fs.mkdirSync(output, { recursive: false });
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2), { encoding: 'utf8', flag: 'wx' });
    console.log('ACTION_FEEDBACK_RESULT ' + JSON.stringify({ passed: report.passed, learningSucceeded: report.learningSucceeded, saveUnchanged, sourcesUnchanged, identity, identicalSavedGeneration,
      control: control.rows.map(row => ({ generation: row.evaluatedGeneration, progressM: row.bestSafeProgressM, laps: row.maxSafeLaps, safeAgents: row.safeAgentCount })),
      treatment: treatment.rows.map(row => ({ generation: row.evaluatedGeneration, progressM: row.bestSafeProgressM, laps: row.maxSafeLaps, safeAgents: row.safeAgentCount })),
      delta: report.comparison.safeProgressDeltaMetersByGeneration, report: path.join(output, 'report.json') }));
  } finally {
    hooks.uninstall();
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
