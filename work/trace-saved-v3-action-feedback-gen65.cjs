'use strict';

// Paired, sampled neural/vehicle telemetry for identical gen.65 offspring.
// CPU-only; user save and app distribution remain read-only.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const savePath = 'C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const priorReportPath = path.join(root, '.impeccable/review/learning-ml/saved-v3-action-feedback-ab-20261023-01/report.json');
const output = path.join(root, '.impeccable/review/learning-ml/saved-v3-action-feedback-gen65-trace-20261023-01');
const selectedIds = [0, 7, 18];
if (fs.existsSync(output)) throw new Error('Refusing to overwrite an existing trace report.');
if (process.versions.node !== '24.19.0') throw new Error('Pinned Node 24.19.0 required.');

const P = require(path.join(root, 'outputs/progress-save.js'));
const Legacy = require(path.join(root, 'outputs/legacy-models.js'));
const Learning = require(path.join(root, 'outputs/neural-learning.js'));
const circuits = require(path.join(root, 'outputs/data/circuits.json'));
const feedback = require('./v3-action-feedback.cjs');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const sourcePaths = ['outputs/simulation.js', 'outputs/neural-learning.js', 'outputs/rewards.js', 'outputs/progress-save.js', 'work/v3-action-feedback.cjs', 'work/trace-saved-v3-action-feedback-gen65.cjs'];
const sourceHashes = () => Object.fromEntries(sourcePaths.map(file => [file, sha(fs.readFileSync(path.join(root, file)))]));

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

function createSimulation(F, state, connectome) {
  const sim = new F.Simulation(Legacy.tagV3(structuredClone(connectome)), {
    modelId: 'v3', population: state.population, circuitId: 'monza', circuits, seed: state.seed
  });
  P.restore(sim, structuredClone(state));
  feedback.extendSimulation(sim);
  return sim;
}

function syncPostGeneration(target, source, F) {
  for (const key of ['generation', 'stagnation', 'history', 'bestEver', 'champion', 'championStats', 'externalChampion', 'hallOfFame',
    'learningFrontier', 'safeLearningFrontier', 'population', 'mutation', 'rewardRevision', 'elapsed', 'ticks', 'accumulator',
    'lastFunctionalCrossoverCount', 'mode', 'running', 'neuralInterval']) {
    target[key] = structuredClone(source[key]);
  }
  target.random = F.rng(source.random.getState());
  target.cars = structuredClone(source.cars);
  target.optimizer.mean = source.optimizer.mean.slice();
  target.optimizer.sigma = source.optimizer.sigma.slice();
  target.optimizer.updates = source.optimizer.updates;
  target.optimizer.episodes = source.optimizer.episodes;
}

function terminalRows(sim, F) {
  return sim.cars.map(car => ({
    id: car.id,
    progressM: car.bestProgress / (sim.track.pixelsPerMeter || 1),
    laps: car.laps,
    fitness: car.fitness,
    reason: car.reason || '',
    safe: F.isSafeLearningOutcome(car)
  }));
}

function runToGeneration(sim, target, name, F, trace = false) {
  const firstGeneration = sim.generation;
  let ticks = 0;
  let generationOutcomes = null;
  const traces = Object.fromEntries(selectedIds.map(id => [id, []]));
  const terminal = Object.create(null);
  sim.onTrialTick = current => {
    if (trace && current.generation === target - 1) {
      const ppm = current.track.pixelsPerMeter || 1;
      for (const id of selectedIds) {
        const car = current.cars[id];
        if (!car) continue;
        const dead = !car.alive && Boolean(car.reason);
        const terminalEvent = dead && !terminal[id];
        if (!terminalEvent && (car.alive ? current.ticks % 6 !== 1 : true)) continue;
        const location = F.locate(current.track, car.x, car.y);
        const progressM = car.bestProgress / ppm;
        if (progressM > 900) continue;
        const actionStep = Math.floor((current.ticks - 1) / 6);
        const row = {
          step: actionStep,
          terminalEvent,
          simSeconds: current.elapsed,
          progressM,
          alongM: location.along / ppm,
          centrelineOffsetM: location.distance / ppm,
          onRoad: F.onRoad(current.track, car.x, car.y),
          x: car.x,
          y: car.y,
          heading: car.heading,
          speedMps: car.vehicle?.speedMps ?? car.speed / ppm,
          longitudinalVelocity: car.longitudinalVelocity / ppm,
          lateralVelocity: car.lateralVelocity / ppm,
          yawRate: car.yawRate,
          longitudinalG: car.longitudinalG,
          lateralG: car.lateralG,
          totalG: car.totalG,
          slipAngle: car.slipAngle,
          outputs: [...car.outputs],
          visualSensors: [...car.inputs],
          physicsSensors: [...car.physicsInputs],
          feedbackState: car.brain?.previousMotorAction ? [...car.brain.previousMotorAction] : null,
          feedbackWeights: car.genome.policyWeights.slice(feedback.LEGACY_LENGTH)
        };
        traces[id].push(row);
        if (terminalEvent) terminal[id] = true;
      }
    }
    if (current.generation === target - 1 && current.cars.every(car => !car.alive)) generationOutcomes = terminalRows(current, F);
  };
  sim.running = true;
  while (sim.generation < target) {
    if (ticks >= 60000) throw new Error(`${name}: generation watchdog reached.`);
    sim.tick();
    ticks++;
  }
  if (!generationOutcomes || generationOutcomes.length !== sim.population) throw new Error(`${name}: terminal population census missing.`);
  return { name, evaluatedGeneration: target - 1, ticks, outcomes: generationOutcomes, traces };
}

function projectOutcomes(rows) {
  return rows.map(({ id, progressM, laps, fitness, reason, safe }) => ({ id, progressM, laps, fitness, reason, safe }));
}

function compareTraces(control, treatment, ids) {
  return ids.map(id => {
    const left = control.traces[id], right = treatment.traces[id];
    const rightByStep = new Map(right.map(row => [row.step, row]));
    const comparisons = [];
    for (const a of left) {
      const b = rightByStep.get(a.step);
      if (!b) continue;
      const actionDelta = a.outputs.map((value, index) => b.outputs[index] - value);
      const maxActionDelta = Math.max(...actionDelta.map(Math.abs));
      comparisons.push({ step: a.step, controlProgressM: a.progressM, treatmentProgressM: b.progressM,
        controlSpeedMps: a.speedMps, treatmentSpeedMps: b.speedMps, actionDelta, maxActionDelta,
        controlOnRoad: a.onRoad, treatmentOnRoad: b.onRoad });
    }
    const firstActionChange = comparisons.find(row => row.maxActionDelta > 1e-8) || null;
    const firstMeaningfulChange = comparisons.find(row => row.maxActionDelta >= 0.01) || null;
    const byRiskWindow = comparisons.filter(row => row.controlProgressM >= 650 && row.controlProgressM <= 810);
    return {
      id,
      controlTerminal: control.outcomes.find(row => row.id === id),
      treatmentTerminal: treatment.outcomes.find(row => row.id === id),
      traceRowsControl: left.length,
      traceRowsTreatment: right.length,
      alignedDecisions: comparisons.length,
      firstActionChange,
      firstMeaningfulChange,
      riskWindow: {
        alignedDecisions: byRiskWindow.length,
        meanAbsoluteActionDelta: byRiskWindow.length ? byRiskWindow.reduce((sum, row) => sum + row.maxActionDelta, 0) / byRiskWindow.length : null,
        maxAbsoluteActionDelta: byRiskWindow.length ? Math.max(...byRiskWindow.map(row => row.maxActionDelta)) : null,
        firstMeaningfulChange: byRiskWindow.find(row => row.maxActionDelta >= 0.01) || null
      },
      traces: { control: left, treatment: right }
    };
  });
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
  const prior = JSON.parse(fs.readFileSync(priorReportPath, 'utf8'));
  if (!prior.passed || prior.learningSucceeded) throw new Error('The prior A/B report is not a valid diagnostic baseline.');
  const connectome = JSON.parse(fs.readFileSync(path.join(root, 'outputs/data/connectome.json'), 'utf8'));
  const file = require.resolve(path.join(root, 'outputs/simulation.js'));
  const compiled = compileSimulation(file);
  const hashesBefore = sourceHashes();
  const hooks = feedback.install(Learning);
  try {
    const controlSim = createSimulation(compiled.api, state, connectome);
    hooks.setFeedbackEnabled(false);
    const gen64Control = runToGeneration(controlSim, 65, 'gen64-control-prefix', compiled.api, false);
    const treatmentSim = createSimulation(compiled.api, state, connectome);
    hooks.setFeedbackEnabled(true);
    const gen64Treatment = runToGeneration(treatmentSim, 65, 'gen64-feedback-prefix', compiled.api, false);
    const expectedGen64Control = projectOutcomes(prior.control.rows[0].terminalOutcomes);
    const expectedGen64Treatment = projectOutcomes(prior.treatment.rows[0].terminalOutcomes);
    const gen64ControlExact = JSON.stringify(projectOutcomes(gen64Control.outcomes)) === JSON.stringify(expectedGen64Control);
    const gen64TreatmentExact = JSON.stringify(projectOutcomes(gen64Treatment.outcomes)) === JSON.stringify(expectedGen64Treatment);
    const gen64ArmsEqual = JSON.stringify(projectOutcomes(gen64Control.outcomes)) === JSON.stringify(projectOutcomes(gen64Treatment.outcomes));
    const startPolicyEqual = JSON.stringify(controlSim.cars.map(car => car.genome.policyWeights)) === JSON.stringify(treatmentSim.cars.map(car => car.genome.policyWeights));
    const startVehicleEqual = JSON.stringify(controlSim.cars.map(car => {
      const { brain, ...rest } = car;
      return { ...rest, brain: { ...brain, activity: Array.from(brain.activity), next: Array.from(brain.next) } };
    })) === JSON.stringify(treatmentSim.cars.map(car => {
      const { brain, ...rest } = car;
      return { ...rest, brain: { ...brain, activity: Array.from(brain.activity), next: Array.from(brain.next) } };
    }));
    const startRngEqual = controlSim.random.getState() === treatmentSim.random.getState();

    hooks.setFeedbackEnabled(false);
    const control = runToGeneration(controlSim, 66, 'gen65-control', compiled.api, true);
    hooks.setFeedbackEnabled(true);
    const treatment = runToGeneration(treatmentSim, 66, 'gen65-action-feedback', compiled.api, true);

    const expectedControl = projectOutcomes(prior.control.rows[1].terminalOutcomes);
    const expectedTreatment = projectOutcomes(prior.treatment.rows[1].terminalOutcomes);
    const controlReproduced = JSON.stringify(projectOutcomes(control.outcomes)) === JSON.stringify(expectedControl);
    const treatmentReproduced = JSON.stringify(projectOutcomes(treatment.outcomes)) === JSON.stringify(expectedTreatment);

    const hashesAfter = sourceHashes();
    const sourcesUnchanged = JSON.stringify(hashesBefore) === JSON.stringify(hashesAfter);
    const saveUnchanged = sha(fs.readFileSync(savePath)) === saveSha;
    const comparison = compareTraces(control, treatment, selectedIds);
    const report = {
      format: 'male-cns-saved-v3-action-feedback-gen65-trace-v1',
      appVersion: '5.6.0',
      passed: Boolean(gen64ControlExact && gen64TreatmentExact && gen64ArmsEqual && startPolicyEqual && startVehicleEqual && startRngEqual && controlReproduced && treatmentReproduced && sourcesUnchanged && saveUnchanged),
      learningSucceeded: false,
      save: { sha256: saveSha, unchanged: saveUnchanged, model: 'V3', circuit: 'Monza', worker: 0, generation: 64, seed: state.seed, population: state.population, rewardRevision: state.rewardRevision },
      runtime: 'Node 24.19.0 CPU-only; no CUDA kernels used',
      method: 'Run control and treatment independently from exact in-memory restores of the user save through gen.64, then compare gen.65. This mirrors the original paired experiment and detects any genotype/state drift during the prefix before interpreting telemetry. Telemetry is read-only and excludes any route/target action from control.',
      preflight: { gen64ControlMatchesPrior: gen64ControlExact, gen64TreatmentMatchesPrior: gen64TreatmentExact, gen64OutcomesEqual: gen64ArmsEqual,
        identicalGen65PolicyWeights: startPolicyEqual, identicalGen65VehicleAndBrainState: startVehicleEqual, identicalGen65RngState: startRngEqual },
      gen65OutcomeReproduction: { control: controlReproduced, treatment: treatmentReproduced },
      selectedAgents: comparison,
      aggregate: {
        controlSafeAgents: control.outcomes.filter(row => row.safe).length,
        treatmentSafeAgents: treatment.outcomes.filter(row => row.safe).length,
        controlBestSafeM: Math.max(...control.outcomes.filter(row => row.safe).map(row => row.progressM)),
        treatmentBestSafeM: Math.max(...treatment.outcomes.filter(row => row.safe).map(row => row.progressM)),
        controlMaxProgressM: Math.max(...control.outcomes.map(row => row.progressM)),
        treatmentMaxProgressM: Math.max(...treatment.outcomes.map(row => row.progressM)),
        controlLaps: Math.max(...control.outcomes.map(row => row.laps)),
        treatmentLaps: Math.max(...treatment.outcomes.map(row => row.laps))
      },
      sourceHashes: { before: hashesBefore, after: hashesAfter, unchanged: sourcesUnchanged },
      boundary: 'This is a paired telemetry replay for one V3/Monza saved worker and one generation. It can localize command divergence and terminal behavior, but cannot establish generalization, convergence, or a successful two-lap generation. No production source, save, version, portable, installer, tag, or release was modified.'
    };
    fs.mkdirSync(output, { recursive: false });
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2), { encoding: 'utf8', flag: 'wx' });
    const compact = comparison.map(item => ({ id: item.id, control: { progressM: item.controlTerminal.progressM, reason: item.controlTerminal.reason },
      treatment: { progressM: item.treatmentTerminal.progressM, reason: item.treatmentTerminal.reason }, firstMeaningfulChange: item.firstMeaningfulChange, riskWindow: item.riskWindow }));
    console.log('ACTION_FEEDBACK_TRACE_RESULT ' + JSON.stringify({ passed: report.passed, gen64Exact, startPolicyEqual, startVehicleEqual, startRngEqual, controlReproduced, treatmentReproduced, aggregate: report.aggregate, agents: compact, report: path.join(output, 'report.json') }));
  } finally {
    hooks.uninstall();
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
