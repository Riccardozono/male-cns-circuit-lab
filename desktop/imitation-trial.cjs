'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync, gzipSync } = require('node:zlib');

const { IMITATION_PROFILE: PROFILE, IMITATION_CIRCUITS } = require('../outputs/model-test.js');
const FORMAT = 'male-cns-v3-imitation-trial-v1';
const MODEL_FORMAT = 'male-cns-neural-imitation-actor-v1';
const RUNTIME_FILES = [
  'simulation.js', 'neural-learning.js', 'dense-neural.js', 'vehicle-992.js',
  'terrain.js', 'rewards.js', 'legacy-models.js', 'data/circuits.json', 'data/connectome.json',
];
const MAX_BYTES = 2 * 1024 * 1024;
const REFINEMENT_BOUNDS=Object.freeze({steeringScale:Object.freeze([.94,1.06]),pedalScale:Object.freeze([.9,1.18]),accelerationBias:Object.freeze([0,.075])});
const digest = value => createHash('sha256').update(value).digest('hex');

function vector(value, length) {
  return Array.isArray(value) && value.length === length && value.every(number => Number.isFinite(number) && Math.abs(number) <= 1000);
}

function validate(bundle) {
  const { actor, genome } = bundle ?? {};
  if (bundle?.format !== FORMAT || !IMITATION_CIRCUITS.includes(bundle.circuitId) ||
      actor?.format !== MODEL_FORMAT || actor.featureCount !== 332 ||
      (actor.footprintSensors !== undefined && typeof actor.footprintSensors !== 'boolean') ||
      actor.featureLayout?.descending !== 128 || actor.featureLayout?.inputGroupMeans !== 38 ||
      actor.featureLayout?.adjacentDifference !== 166 ||
      !vector(actor.center, 332) || !vector(actor.scale, 332) || actor.scale.some(scale => scale <= 0) ||
      !vector(genome?.policyWeights, 330) || !vector(genome?.encoder, 56) ||
      !Array.isArray(genome?.readout) || genome.readout.length > 2048 || !vector(genome.readout, genome.readout.length) ||
      !Number.isFinite(genome.gain) || !Array.isArray(actor.layers) || actor.layers.length !== 3) {
    throw Error('Decoder V3 di prova non valido.');
  }
  if (actor.actuatorRefinement !== undefined) {
    const values=actor.actuatorRefinement??{};
    if (Object.entries(REFINEMENT_BOUNDS).some(([key,[min,max]])=>!Number.isFinite(values[key])||values[key]<min||values[key]>max)) {
      throw Error('Affinamento dei comandi del V3 incompatibile.');
    }
  }
  const sizes = [332, 112, 80, 2];
  for (const [index, layer] of actor.layers.entries()) {
    if (layer?.activation !== (index === 2 ? 'tanh' : 'silu') ||
        !vector(layer.bias, sizes[index + 1]) || !Array.isArray(layer.weights) ||
        layer.weights.length !== sizes[index + 1] || !layer.weights.every(row => vector(row, sizes[index]))) {
      throw Error('Strati del decoder V3 incompatibili.');
    }
  }
  return bundle;
}

async function runtimeHashes(outputsDir) {
  const entries = await Promise.all(RUNTIME_FILES.map(async name => [
    name, digest(await fs.readFile(path.join(outputsDir, name))),
  ]));
  return Object.fromEntries(entries);
}

async function load(file, outputsDir) {
  const info = await fs.stat(file);
  if (!info.isFile() || info.size > MAX_BYTES) throw Error('File decoder V3 non valido o troppo grande.');
  const bytes = await fs.readFile(file);
  if (bytes.length > MAX_BYTES) throw Error('File decoder V3 troppo grande.');
  const bundle = validate(JSON.parse(gunzipSync(bytes, { maxOutputLength: 4 * MAX_BYTES }).toString('utf8')));
  const hashes = await runtimeHashes(outputsDir);
  if (RUNTIME_FILES.some(name => bundle.runtimeHashes?.[name] !== hashes[name])) {
    throw Error('Decoder V3 incompatibile con questo motore. Serve il bundle della stessa build.');
  }
  return { ...bundle, sha256: digest(bytes) };
}

function createDecoder(actor, graph, refinementForCar=()=>actor.actuatorRefinement) {
  const bySignature = new Map();
  graph.inputs.forEach((id, index) => {
    const key = [graph.inputChannels[index], graph.physicsChannels[index], graph.roadChannels[index]].join('/');
    if (!bySignature.has(key)) bySignature.set(key, []);
    bySignature.get(key).push(id);
  });
  const groups = Array.from(bySignature.values());
  const descending = actor.featureLayout.descending;
  const frameSize = actor.featureLayout.adjacentDifference;
  if (graph.learning?.nodes.length !== descending || groups.length !== actor.featureLayout.inputGroupMeans) {
    throw Error('Grafo MaleCNS incompatibile con il decoder V3.');
  }

  const layers = actor.layers.map(layer => ({
    weights: layer.weights.map(row => Float64Array.from(row)),
    bias: Float64Array.from(layer.bias),
    activate: layer.activation === 'tanh' ? Math.tanh : value => value / (1 + Math.exp(-value)),
  }));
  const previousByCar = new WeakMap();
  return car => {
    const brain = car.brain;
    const previous = previousByCar.get(car);
    const features = new Float32Array(actor.featureCount);
    features.set(brain.policyFeatures);
    for (const [index, group] of groups.entries()) {
      let sum = 0;
      for (const id of group) sum += brain.activity[id];
      features[descending + index] = sum / group.length;
    }
    if (previous) {
      for (let i = 0; i < frameSize; i++) features[frameSize + i] = features[i] - previous[i];
    }
    previousByCar.set(car, features);

    let inputs = Float64Array.from(features, (value, index) =>
      Math.max(-8, Math.min(8, (value - actor.center[index]) / actor.scale[index])));
    for (const layer of layers) {
      const next = new Float64Array(layer.bias.length);
      for (const [row, weights] of layer.weights.entries()) {
        let sum = layer.bias[row];
        for (let i = 0; i < inputs.length; i++) sum += inputs[i] * weights[i];
        next[row] = layer.activate(sum);
      }
      inputs = next;
    }
    let [steering, pedal] = inputs;
    const refinement=refinementForCar(car);
    if (refinement) {
      const {steeringScale, pedalScale, accelerationBias} = refinement;
      const bias = pedal > 0 ? accelerationBias * Math.exp(-7 * Math.abs(steering)) : 0;
      steering = Math.max(-1, Math.min(1, steering * steeringScale));
      pedal = Math.max(-1, Math.min(1, pedal * pedalScale + bias));
    }
    return [steering, Math.max(0, pedal), Math.max(0, -pedal)];
  };
}

function encodeRefinement(bundle, actuatorRefinement){
  const {format,circuitId,runtimeHashes,actor,genome}=bundle;
  return gzipSync(JSON.stringify(validate({format,circuitId,runtimeHashes,actor:{...actor,actuatorRefinement},genome})),{level:5});
}

module.exports = { PROFILE, FORMAT, REFINEMENT_BOUNDS, runtimeHashes, load, createDecoder, encodeRefinement };
