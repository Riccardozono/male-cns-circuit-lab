'use strict';

// Diagnostic replay with action feedback enabled only for real driving ticks.
// CPU-only, in-memory migration; the app sources and user save remain read-only.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
const savePath = 'C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const priorReportPath = path.join(root, '.impeccable/review/learning-ml/saved-v3-action-feedback-ab-20261023-01/report.json');
const output = path.join(root, '.impeccable/review/learning-ml/saved-v3-action-feedback-gen65-gated-20261023-01');
const selectedIds = [0, 7, 18];
if (fs.existsSync(output)) throw new Error('Refusing to overwrite an existing diagnostic report.');
if (process.versions.node !== '24.19.0') throw new Error('Pinned Node 24.19.0 required.');

const P = require(path.join(root, 'outputs/progress-save.js'));
const Legacy = require(path.join(root, 'outputs/legacy-models.js'));
const Learning = require(path.join(root, 'outputs/neural-learning.js'));
const circuits = require(path.join(root, 'outputs/data/circuits.json'));
const feedback = require('./v3-action-feedback.cjs');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const sourcePaths = ['outputs/simulation.js', 'outputs/neural-learning.js', 'outputs/rewards.js', 'outputs/progress-save.js',
  'work/v3-action-feedback.cjs', 'work/trace-saved-v3-action-feedback-gen65-gated.cjs'];
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

function runtimeProjection(car) {
  const { genome, brain, ...vehicleState } = car;
  return {
    ...vehicleState,
    brain: {
      ...brain,
      activity: Array.from(brain.activity),
      next: Array.from(brain.next)
    }
  };
}

function runToGeneration(sim, target, name, F, hooks, feedbackForEpisode, trace = false) {
  let ticks = 0;
  let generationOutcomes = null;
  const traces = Object.fromEntries(selectedIds.map(id => [id, []]));
  const terminal = Object.create(null);
  sim.onTrialTick = current => {
    const generationFinished = current.generation === target - 1 && current.cars.every(car => !car.alive);
    // Simulation.tick calls this hook immediately before evolve(). Prevent the
    // experimental decoder from contaminating counterfactual/evolution calls.
    if (generationFinished) hooks.setFeedbackEnabled(false);

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
        traces[id].push({
          step: Math.floor((current.ticks - 1) / 6),
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
        });
        if (terminalEvent) terminal[id] = true;
      }
    }
    if (generationFinished) generationOutcomes = terminalRows(current, F);
  };

  sim.running = true;
  while (sim.generation < target) {
    if (ticks >= 60000) throw new Error(`${name}: generation watchdog reached.`);
    hooks.setFeedbackEnabled(feedbackForEpisode);
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
    const riskWindow = comparisons.filter(row => row.controlProgressM >= 650 && row.controlProgressM <= 810);
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
        alignedDecisions: riskWindow.length,
        meanAbsoluteActionDelta: riskWindow.length ? riskWindow.reduce((sum, row) => sum + row.maxActionDelta, 0) / riskWindow.length : null,
        maxAbsoluteActionDelta: riskWindow.length ? Math.max(...riskWindow.map(row => row.maxActionDelta)) : null,
        firstMeaningfulChange: riskWindow.find(row => row.maxActionDelta >= 0.01) || null
      },
      traces: { control: left, treatment: right }
    };
  });
}

function optimizerProjection(sim) {
  return {
    mean: sim.optimizer.mean,
    sigma: sim.optimizer.sigma,
    updates: sim.optimizer.updates,
    episodes: sim.optimizer.episodes
  };
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
  if (!prior.passed || prior.learningSucceeded) throw new Error('The prior A/B report is not a usable diagnostic reference.');
  const connectome = JSON.parse(fs.readFileSync(path.join(root, 'outputs/data/connectome.json'), 'utf8'));
  const file = require.resolve(path.join(root, 'outputs/simulation.js'));
  const compiled = compileSimulation(file);
  const hashesBefore = sourceHashes();
  const hooks = feedback.install(Learning);
  try {
    const controlSim = createSimulation(compiled.api, state, connectome);
    const gen64Control = runToGeneration(controlSim, 65, 'gen64-control-prefix', compiled.api, hooks, false);
    const treatmentSim = createSimulation(compiled.api, state, connectome);
    const gen64Treatment = runToGeneration(treatmentSim, 65, 'gen64-feedback-prefix', compiled.api, hooks, true);

    const expectedGen64Control = projectOutcomes(prior.control.rows[0].terminalOutcomes);
    const expectedGen64Treatment = projectOutcomes(prior.treatment.rows[0].terminalOutcomes);
    const gen64ControlExact = JSON.stringify(projectOutcomes(gen64Control.outcomes)) === JSON.stringify(expectedGen64Control);
    const gen64TreatmentExact = JSON.stringify(projectOutcomes(gen64Treatment.outcomes)) === JSON.stringify(expectedGen64Treatment);
    const gen64ArmsEqual = JSON.stringify(projectOutcomes(gen64Control.outcomes)) === JSON.stringify(projectOutcomes(gen64Treatment.outcomes));

    const startGenomesEqual = JSON.stringify(controlSim.cars.map(car => car.genome.policyWeights)) ===
      JSON.stringify(treatmentSim.cars.map(car => car.genome.policyWeights));
    const startBaseWeightsEqual = controlSim.cars.every((car, i) =>
      JSON.stringify(car.genome.policyWeights.slice(0, feedback.LEGACY_LENGTH)) ===
      JSON.stringify(treatmentSim.cars[i].genome.policyWeights.slice(0, feedback.LEGACY_LENGTH)));
    const startFeedbackWeightsEqual = controlSim.cars.every((car, i) =>
      JSON.stringify(car.genome.policyWeights.slice(feedback.LEGACY_LENGTH)) ===
      JSON.stringify(treatmentSim.cars[i].genome.policyWeights.slice(feedback.LEGACY_LENGTH)));
    const startRuntimeEqual = JSON.stringify(controlSim.cars.map(runtimeProjection)) ===
      JSON.stringify(treatmentSim.cars.map(runtimeProjection));
    const startOptimizerEqual = JSON.stringify(optimizerProjection(controlSim)) === JSON.stringify(optimizerProjection(treatmentSim));
    const startRngEqual = controlSim.random.getState() === treatmentSim.random.getState();

    const expectedControl = projectOutcomes(prior.control.rows[1].terminalOutcomes);
    const control = runToGeneration(controlSim, 66, 'gen65-control', compiled.api, hooks, false, true);
    const treatment = runToGeneration(treatmentSim, 66, 'gen65-action-feedback-gated', compiled.api, hooks, true, true);
    const controlReproduced = JSON.stringify(projectOutcomes(control.outcomes)) === JSON.stringify(expectedControl);
    const treatmentReproducedHistoricalUngated = JSON.stringify(projectOutcomes(treatment.outcomes)) ===
      JSON.stringify(projectOutcomes(prior.treatment.rows[1].terminalOutcomes));

    const hashesAfter = sourceHashes();
    const sourcesUnchanged = JSON.stringify(hashesBefore) === JSON.stringify(hashesAfter);
    const saveUnchanged = sha(fs.readFileSync(savePath)) === saveSha;
    const comparison = compareTraces(control, treatment, selectedIds);
    const report = {
      format: 'male-cns-saved-v3-action-feedback-gen65-gated-trace-v1',
      appVersion: '5.6.0',
      passed: Boolean(gen64ControlExact && gen64TreatmentExact && gen64ArmsEqual && startGenomesEqual && startRuntimeEqual &&
        startOptimizerEqual && startRngEqual && controlReproduced && sourcesUnchanged && saveUnchanged),
      learningSucceeded: false,
      save: { sha256: saveSha, unchanged: saveUnchanged, model: 'V3', circuit: 'Monza', worker: 0, generation: 64,
        seed: state.seed, population: state.population, rewardRevision: state.rewardRevision },
      runtime: 'Node 24.19.0 CPU-only; no CUDA kernels used',
      method: 'Restore control and treatment independently from the V3/Monza gen.64 save. Enable the experimental feedback only during real simulation ticks, then disable it in the last onTrialTick callback before Simulation.evolve() runs internal sensory-counterfactual calls. Compare gen.65 offspring genome, runtime, optimizer and RNG state before tracing actions for the same agents.',
      preflight: {
        gen64ControlMatchesPrior: gen64ControlExact,
        gen64TreatmentMatchesPrior: gen64TreatmentExact,
        gen64OutcomesEqual: gen64ArmsEqual,
        identicalGen65FullGenomes: startGenomesEqual,
        identicalGen65BasePolicyWeights: startBaseWeightsEqual,
        identicalGen65FeedbackWeights: startFeedbackWeightsEqual,
        identicalGen65VehicleAndBrainState: startRuntimeEqual,
        identicalGen65OptimizerState: startOptimizerEqual,
        identicalGen65RngState: startRngEqual
      },
      gen65OutcomeReproduction: {
        controlMatchesHistoricalControl: controlReproduced,
        treatmentMatchesHistoricalUngatedTreatment: treatmentReproducedHistoricalUngated
      },
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
      boundary: 'A single paired V3/Monza gen.65 replay can isolate whether the four action-feedback coefficients change commands for identical offspring. It does not establish learning improvement, generalization, convergence, or a completed two-lap generation. No production source, save, version, portable, installer, tag, or release was modified.'
    };
    fs.mkdirSync(output, { recursive: false });
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2), { encoding: 'utf8', flag: 'wx' });
    const compact = comparison.map(item => ({ id: item.id,
      control: { progressM: item.controlTerminal.progressM, reason: item.controlTerminal.reason },
      treatment: { progressM: item.treatmentTerminal.progressM, reason: item.treatmentTerminal.reason },
      firstMeaningfulChange: item.firstMeaningfulChange, riskWindow: item.riskWindow }));
    console.log('ACTION_FEEDBACK_GATED_TRACE_RESULT ' + JSON.stringify({
      passed: report.passed,
      preflight: report.preflight,
      historicalOutcomeReproduction: report.gen65OutcomeReproduction,
      aggregate: report.aggregate,
      agents: compact,
      report: path.join(output, 'report.json')
    }));
  } finally {
    hooks.uninstall();
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
