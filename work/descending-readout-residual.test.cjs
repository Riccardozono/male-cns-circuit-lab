'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict');
const R = require('./descending-readout-residual.cjs');
function fixture() {
  const graph = {n: 2, classNames: ['descending_neuron', 'sensory_neuron'], classCodes: [0, 1],
    learning: {nodes: Uint32Array.of(0), readoutOffset: 0}};
  const brain = {activity: Float64Array.of(.1, .5), policyFeatures: Float64Array.of(Math.tanh(.8))};
  const genome = {policyWeights: [.2, -.3, .1, -.1]};
  const F = {neuralStep: () => [.12, 0, .31]};
  return {graph, brain, genome, F};
}
test('zero residual preserves the original command exactly', () => {
  const {graph, brain, genome, F} = fixture(), r = R.wrap(F, graph, {nodes: [0], weights: [0, 0, 0, 0]});
  assert.deepEqual(r.neuralStep(graph, brain, genome, []), F.neuralStep());
});
test('residual uses actual neuronal logits and preserves exclusive pedals', () => {
  const {graph, brain, genome, F} = fixture(), spec = {nodes: [0], weights: [.2, .4, 0, .1]},
    r = R.wrap(F, graph, spec), result = r.neuralStep(graph, brain, genome, [], true, true);
  assert.equal(result[0], Math.tanh(Math.tanh(.8) * .2 + .1 + Math.tanh(.8) * .2));
  assert.equal(result[1], Math.tanh((Math.tanh(.8) * -.3 - .1) + (Math.tanh(.8) * .4 + .1)));
  assert.equal(result[2], 0);
});
test('disabled propagation cannot be bypassed by a residual bias', () => {
  const {graph, brain, genome} = fixture(), F = {neuralStep: () => [0, 0, 0]},
    r = R.wrap(F, graph, {nodes: [0], weights: [0, 0, 1, 1]});
  assert.deepEqual(r.neuralStep(graph, brain, genome, [], true, false), [0, 0, 0]);
  assert.deepEqual(r.neuralStep(graph, brain, genome, [], false, true), [0, 0, 0]);
});
test('non-descending, duplicate and invalid-weight residuals are rejected', () => {
  const {graph} = fixture();
  for (const spec of [{nodes: [1], weights: [0, 0, 0, 0]}, {nodes: [0, 0], weights: Array(6).fill(0)},
    {nodes: [0], weights: [0, 0, NaN, 0]}, {nodes: [0], weights: [0, 0, 9, 0]}])
    assert.throws(() => R.validate(graph, spec), /descending-neuron residual/);
});
