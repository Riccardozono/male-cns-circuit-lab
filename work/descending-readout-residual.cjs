'use strict';
// Research only: a static residual over existing descending-neuron activity.
// Neither route geometry, sensory shortcuts nor a clock enter this decoder.
function validate(graph, spec) {
  if (!spec || !Array.isArray(spec.nodes) || !spec.nodes.length ||
      new Set(spec.nodes).size !== spec.nodes.length ||
      spec.nodes.some(n => !Number.isInteger(n) || n < 0 || n >= graph.n ||
        graph.classNames[graph.classCodes[n]] !== 'descending_neuron') ||
      !Array.isArray(spec.weights) || spec.weights.length !== (spec.nodes.length + 1) * 2 ||
      spec.weights.some(w => !Number.isFinite(w) || Math.abs(w) > 8)) {
    throw Error('Bounded real descending-neuron residual required');
  }
  return spec;
}
function wrap(F, graph, spec) {
  validate(graph, spec);
  const active = spec.weights.some(w => w !== 0), norm = 1 / Math.sqrt(spec.nodes.length);
  return {...F, neuralStep(...args) {
    const baseline = F.neuralStep(...args);
    if (!active || args[4] === false || args[5] === false) return baseline;
    const brain = args[1], genome = args[2], p = graph.learning, w = genome.policyWeights;
    if (!w || !brain.policyFeatures || p.nodes.every(n => Math.abs(brain.activity[n]) < 1e-7)) return baseline;
    // Reconstruct the actual learned logits; never add to a clipped motor command.
    const logits = [0, 0], baseNorm = 1 / Math.sqrt(p.nodes.length);
    for (let j = 0; j < p.nodes.length; j++) for (let a = 0; a < 2; a++)
      logits[a] += brain.policyFeatures[j] * w[p.readoutOffset + j * 2 + a] * baseNorm;
    for (let a = 0; a < 2; a++) {
      logits[a] += w[w.length - 2 + a];
      let delta = 0;
      for (let j = 0; j < spec.nodes.length; j++)
        delta += Math.tanh(8 * brain.activity[spec.nodes[j]]) * norm * spec.weights[j * 2 + a];
      logits[a] += delta + spec.weights[spec.weights.length - 2 + a];
    }
    const steer = Math.tanh(logits[0]), longitudinal = Math.tanh(logits[1]);
    return [steer, Math.max(0, longitudinal), Math.max(0, -longitudinal)];
  }};
}
module.exports = {validate, wrap};
