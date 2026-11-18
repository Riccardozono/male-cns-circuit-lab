'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const Trial = require('../../desktop/imitation-trial.cjs');

const zeros = size => Array(size).fill(0);
function layers(sizes, last) {
  return sizes.slice(1).map((count, i) => ({
    activation: i === sizes.length - 2 ? last : 'silu',
    bias: zeros(count),
    weights: Array.from({length: count}, () => zeros(sizes[i])),
  }));
}

function fixture() {
  const policy = {
    decays: [.82, .955], threshold: .52, exponent: .65,
    parameters: {steerGain: 0, steerBias: .02, steerResidual: 0, pedalBias: -.02, pedalResidual: 0},
    gate: layers([664, 64, 32, 1], 'sigmoid'),
    adjustment: layers([664, 96, 60, 2], 'tanh'),
  };
  policy.gate[0].weights[0][332] = 1;
  policy.gate[1].weights[0][0] = 4;
  policy.gate[2].weights[0][0] = 3;
  const actor = {
    format: 'male-cns-neural-imitation-actor-v1',
    featureCount: 332,
    featureLayout: {descending: 128, inputGroupMeans: 38, adjacentDifference: 166},
    center: zeros(332), scale: Array(332).fill(1),
    layers: layers([332, 112, 80, 2], 'tanh'),
  };
  actor.layers[2].bias[1] = .2;
  return {format: Trial.CORRECTED_FORMAT, circuitId: 'monaco', actor: {...actor, neuralCorrection: policy},
    genome: {gain: 1, encoder: zeros(56), readout: [], policyWeights: zeros(330)}};
}

test('V3 files with neural correction require the new format and bounded weights', async t => {
  const bundle = fixture();
  const outputs = path.resolve(__dirname, '..');
  bundle.runtimeHashes = await Trial.runtimeHashes(outputs);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'malecns-decoder-'));
  const file = path.join(directory, 'decoder.json.gz');
  t.after(async () => {
    await fs.unlink(file);
    await fs.rmdir(directory);
  });
  const check = async data => {
    await fs.writeFile(file, gzipSync(JSON.stringify(data)));
    return Trial.load(file, outputs);
  };
  const loaded = await check(bundle);
  assert.equal(loaded.format, Trial.CORRECTED_FORMAT);
  await assert.rejects(check({...bundle, format: Trial.FORMAT}), /nuovo formato/);
  const {neuralCorrection, ...legacy} = bundle.actor;
  assert.equal((await check({...bundle, format: Trial.FORMAT, actor: legacy})).format, Trial.FORMAT);
  await assert.rejects(check({...bundle, actor: {...legacy, neuralCorrection: {...neuralCorrection, threshold: 1}}}), /Correzione neurale/);
});

test('V3 neural correction uses independent causal history for each car', () => {
  const {actor} = fixture();
  const graph = {
    inputs: Array.from({length: 38}, (_, i) => i),
    inputChannels: Array.from({length: 38}, (_, i) => i),
    physicsChannels: zeros(38), roadChannels: zeros(38),
    learning: {nodes: zeros(128)},
  };
  const before = {brain: {policyFeatures: zeros(128), activity: zeros(38)}};
  const other = {brain: {policyFeatures: zeros(128), activity: zeros(38)}};
  const decoder = Trial.createDecoder(actor, graph);
  const unchanged = decoder(before);
  before.brain.policyFeatures[0] = 1;
  other.brain.policyFeatures[0] = 1;
  const corrected = decoder(before);
  assert.ok(corrected[0] > unchanged[0] && corrected[1] < unchanged[1]);
  assert.equal(corrected[2], 0);
  assert.deepEqual(decoder(other), unchanged);
});
