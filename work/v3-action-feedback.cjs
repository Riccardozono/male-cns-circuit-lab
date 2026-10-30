'use strict';

// Research-only extension for the saved V3 policy: four learned, causal
// coefficients let the current decoder read the previous emitted motor action.
// A zero suffix is an exact identity; this module is never loaded by the app.
const EXTRA = 4;
const LEGACY_LENGTH = 202;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const normal = r => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
const atanh = v => Math.atanh(clamp(v, -1 + 1e-12, 1 - 1e-12));

function install(Learning) {
  const originalCommands = Learning.commands;
  const originalSafeMotorMutation = Learning.safeMotorMutation;
  let feedbackEnabled = false;

  Learning.commands = function (graph, brain, genome, enabled = true, edgesEnabled = true) {
    const policy = graph.learning;
    const values = genome?.policyWeights;
    if (!Array.isArray(values) || values.length !== policy.length) {
      throw new Error('Unexpected V3 research policy shape.');
    }
    if (values.length === LEGACY_LENGTH) return originalCommands(graph, brain, genome, enabled, edgesEnabled);
    if (values.length !== LEGACY_LENGTH + EXTRA) throw new Error('Unexpected V3 action-feedback dimension.');

    // Reuse the exact saved decoder math on its original 202 coefficients.
    const extendedLength = policy.length;
    policy.length = LEGACY_LENGTH;
    let base;
    try {
      base = originalCommands(graph, brain, { ...genome, policyWeights: values.slice(0, LEGACY_LENGTH) }, enabled, edgesEnabled);
    } finally {
      policy.length = extendedLength;
    }
    if (!feedbackEnabled || !enabled || !edgesEnabled) return base;

    let neuralSignal = 0;
    for (const node of policy.nodes) neuralSignal = Math.max(neuralSignal, Math.abs(brain.activity[node] || 0));
    if (neuralSignal < 1e-7) {
      brain.previousMotorAction = [0, 0];
      return [0, 0, 0];
    }

    const previous = brain.previousMotorAction || [0, 0];
    const previousSteer = clamp(Number(previous[0]) || 0, -1, 1);
    const previousLongitudinal = clamp(Number(previous[1]) || 0, -1, 1);
    if (values[202] === 0 && values[203] === 0 && values[204] === 0 && values[205] === 0) {
      brain.previousMotorAction = [base[0], base[1] - base[2]];
      return base;
    }
    const steer = Math.tanh(atanh(base[0]) + values[202] * previousSteer + values[203] * previousLongitudinal);
    const longitudinal = Math.tanh(atanh(base[1] - base[2]) + values[204] * previousSteer + values[205] * previousLongitudinal);
    brain.previousMotorAction = [steer, longitudinal];
    return [steer, Math.max(0, longitudinal), Math.max(0, -longitudinal)];
  };

  Learning.safeMotorMutation = function (graph, values, random, amount, experience, focus = null) {
    if (values.length !== graph.learning.length || values.length !== LEGACY_LENGTH + EXTRA) {
      return originalSafeMotorMutation(graph, values, random, amount, experience, focus);
    }
    const base = originalSafeMotorMutation(graph, values.slice(0, LEGACY_LENGTH), random, amount, experience, focus);
    const scale = Math.max(0, amount) / 0.16;
    const suffix = values.slice(LEGACY_LENGTH).map((value, index) =>
      clamp(value + normal(random) * graph.learning.scales[LEGACY_LENGTH + index] * scale, -8, 8));
    return base.concat(suffix);
  };

  return {
    setFeedbackEnabled(value) { feedbackEnabled = value === true; },
    uninstall() {
      Learning.commands = originalCommands;
      Learning.safeMotorMutation = originalSafeMotorMutation;
    }
  };
}

function extendSimulation(sim) {
  const policy = sim.graph.learning;
  if (policy.length !== LEGACY_LENGTH || sim.optimizer.mean.length !== LEGACY_LENGTH || sim.optimizer.sigma.length !== LEGACY_LENGTH) {
    throw new Error('Only the unextended saved V3 policy can be migrated in memory.');
  }
  const scales = [0.08, 0.04, 0.04, 0.12];
  policy.length += EXTRA;
  policy.mean.push(0, 0, 0, 0);
  policy.scales.push(...scales);
  sim.optimizer.mean.push(0, 0, 0, 0);
  sim.optimizer.sigma.push(...scales);

  const extendGenome = genome => {
    if (!genome) return;
    if (genome.policyWeights.length === LEGACY_LENGTH) genome.policyWeights.push(0, 0, 0, 0);
    else if (genome.policyWeights.length !== LEGACY_LENGTH + EXTRA) throw new Error('Unexpected genome during in-memory migration.');
  };
  for (const car of sim.cars) extendGenome(car.genome);
  extendGenome(sim.champion);
  extendGenome(sim.externalChampion);
  for (const entry of sim.hallOfFame) extendGenome(entry.genome);

  return { addedParameters: EXTRA, parameterNames: [
    'previous steering -> steering',
    'previous longitudinal action -> steering',
    'previous steering -> longitudinal action',
    'previous longitudinal action -> longitudinal action'
  ], scales };
}

module.exports = { install, extendSimulation, LEGACY_LENGTH, EXTRA };
