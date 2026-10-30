'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../outputs/simulation.js');
const Learning = require('../outputs/neural-learning.js');
const Legacy = require('../outputs/legacy-models.js');
const connectome = require('../outputs/data/connectome.json');
const { install, extendSimulation, LEGACY_LENGTH } = require('./v3-action-feedback.cjs');
const circuits = require('../outputs/data/circuits.json');

function fixture() {
  const sim = new F.Simulation(Legacy.tagV3(structuredClone(connectome)), {
    modelId: 'v3', population: 4, circuitId: 'monza', circuits, seed: 7717
  });
  return sim;
}

test('the zero action-feedback suffix preserves the original neural action exactly', t => {
  const sim = fixture();
  const car = sim.cars[0];
  for (const node of sim.graph.learning.nodes) car.brain.activity[node] = 0.025;
  const before = Learning.commands(sim.graph, car.brain, car.genome);
  const patch = install(Learning);
  t.after(patch.uninstall);
  extendSimulation(sim);
  patch.setFeedbackEnabled(true);
  car.brain.previousMotorAction = [0.83, -0.61];
  assert.deepEqual(car.genome.policyWeights.slice(LEGACY_LENGTH), [0, 0, 0, 0]);
  assert.deepEqual(Learning.commands(sim.graph, car.brain, car.genome), before);
  assert.deepEqual(car.brain.previousMotorAction, before.length ? [before[0], before[1] - before[2]] : [0, 0]);
});

test('learned action feedback changes the next action and keeps gas/brake exclusive', t => {
  const sim = fixture();
  const car = sim.cars[0];
  for (const node of sim.graph.learning.nodes) car.brain.activity[node] = 0.025;
  const patch = install(Learning);
  t.after(patch.uninstall);
  extendSimulation(sim);
  patch.setFeedbackEnabled(true);
  car.brain.previousMotorAction = [0.5, 0.4];
  car.genome.policyWeights[202] = 0.7;
  car.genome.policyWeights[205] = -0.6;
  const output = Learning.commands(sim.graph, car.brain, car.genome);
  assert.ok(output.some(value => value !== 0));
  assert.equal(Math.min(output[1], output[2]), 0);
  assert.deepEqual(car.brain.previousMotorAction, [output[0], output[1] - output[2]]);
});

test('action feedback cannot drive without descending-neuron activity', t => {
  const sim = fixture();
  const car = sim.cars[0];
  const patch = install(Learning);
  t.after(patch.uninstall);
  extendSimulation(sim);
  patch.setFeedbackEnabled(true);
  car.brain.activity.fill(0);
  car.brain.previousMotorAction = [1, 1];
  car.genome.policyWeights[202] = 8;
  car.genome.policyWeights[205] = 8;
  assert.deepEqual(Learning.commands(sim.graph, car.brain, car.genome), [0, 0, 0]);
  assert.deepEqual(car.brain.previousMotorAction, [0, 0]);
});

test('safe motor mutation explores the four added coefficients', t => {
  const sim = fixture();
  const patch = install(Learning);
  t.after(patch.uninstall);
  extendSimulation(sim);
  const weights = sim.cars[0].genome.policyWeights;
  const mutated = Learning.safeMotorMutation(sim.graph, weights, F.rng(41), 0.16, null);
  assert.equal(mutated.length, weights.length);
  assert.ok(mutated.slice(LEGACY_LENGTH).some(value => value !== 0));
});
