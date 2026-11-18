'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync, gzipSync } = require('node:zlib');

const { IMITATION_PROFILE: PROFILE, IMITATION_CIRCUITS } = require('../outputs/model-test.js');
const FORMAT = 'male-cns-v3-imitation-trial-v1';
const CORRECTED_FORMAT = 'male-cns-v3-imitation-trial-v2';
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

function validLayers(layers, sizes, outputActivation) {
  return Array.isArray(layers) && layers.length === sizes.length - 1 && layers.every((layer, index) => {
    const count = sizes[index + 1];
    return layer?.activation === (index === layers.length - 1 ? outputActivation : 'silu') &&
      vector(layer.bias, count) && Array.isArray(layer.weights) && layer.weights.length === count &&
      layer.weights.every(row => vector(row, sizes[index]));
  });
}

function validateCorrection(policy, featureCount) {
  const {parameters, gate, adjustment, decays, threshold, exponent} = policy ?? {};
  const bounded = (value, low, high) => Number.isFinite(value) && value >= low && value <= high;
  if (!parameters || !bounded(parameters.steerGain, -.06, .06) ||
      !bounded(parameters.steerBias, -.04, .04) || !bounded(parameters.pedalBias, -.05, .05) ||
      !bounded(parameters.steerResidual, -.2, 1) || !bounded(parameters.pedalResidual, -.2, 1) ||
      !bounded(threshold, .1, .9) || !bounded(exponent, .3, 1.5) ||
      !vector(decays, 2) || !decays.every(decay => bounded(decay, .7, .99)) ||
      !validLayers(gate, [featureCount * 2, 64, 32, 1], 'sigmoid') ||
      !validLayers(adjustment, [featureCount * 2, 96, 60, 2], 'tanh')) {
    throw Error('Correzione neurale V3 incompatibile.');
  }
}

function validate(bundle) {
  const { actor, genome } = bundle ?? {};
  if (![FORMAT, CORRECTED_FORMAT].includes(bundle?.format) || !IMITATION_CIRCUITS.includes(bundle.circuitId) ||
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
  if (!validLayers(actor.layers, [332, 112, 80, 2], 'tanh')) {
    throw Error('Strati del decoder V3 incompatibili.');
  }
  if (bundle.format === CORRECTED_FORMAT) {
    validateCorrection(actor.neuralCorrection, actor.featureCount);
  } else if (actor.neuralCorrection !== undefined) {
    throw Error('La correzione neurale richiede il nuovo formato decoder V3.');
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
  let data;
  try {
    data = JSON.parse(gunzipSync(bytes, { maxOutputLength: 4 * MAX_BYTES }).toString('utf8'));
  } catch {
    throw Error('Il file non contiene un decoder V3 compresso valido.');
  }
  const bundle = validate(data);
  const hashes = await runtimeHashes(outputsDir);
  if (RUNTIME_FILES.some(name => bundle.runtimeHashes?.[name] !== hashes[name])) {
    throw Error('Decoder V3 incompatibile con questo motore. Serve il bundle della stessa build.');
  }
  return { ...bundle, sha256: digest(bytes) };
}

const activation = {
  silu: value => value / (1 + Math.exp(-value)),
  sigmoid: value => 1 / (1 + Math.exp(-value)),
  tanh: Math.tanh,
};

function compileNetwork(layers) {
  const compiled = layers.map(layer => ({
    weights: layer.weights.map(row => Float64Array.from(row)),
    bias: Float64Array.from(layer.bias),
    activate: activation[layer.activation],
  }));
  return inputs => {
    for (const layer of compiled) {
      const next = new Float64Array(layer.bias.length);
      for (const [row, weights] of layer.weights.entries()) {
        let sum = layer.bias[row];
        for (let i = 0; i < inputs.length; i++) sum += inputs[i] * weights[i];
        next[row] = layer.activate(sum);
      }
      inputs = next;
    }
    return inputs;
  };
}

function createCorrection(policy) {
  const gate = compileNetwork(policy.gate);
  const adjust = compileNetwork(policy.adjustment);
  const histories = new WeakMap();
  const {decays, threshold, exponent, parameters} = policy;
  return (car, inputs, steering, pedal) => {
    const count = inputs.length;
    const half = count / 2;
    let history = histories.get(car);
    if (!history) {
      history = decays.map(() => inputs.slice(0, half));
      histories.set(car, history);
    }
    const context = new Float64Array(2 * count);
    context.set(inputs);
    for (const [index, decay] of decays.entries()) {
      const memory = history[index];
      for (let i = 0; i < half; i++) {
        memory[i] = decay * memory[i] + (1 - decay) * inputs[i];
        context[count + index * half + i] = inputs[i] - memory[i];
      }
    }
    const confidence = gate(context)[0];
    const intensity = Math.max(0, Math.min(1, (confidence - threshold) / (1 - threshold))) ** exponent;
    if (!intensity) return [steering, pedal];
    const [steerResidual, pedalResidual] = adjust(context);
    return [
      steering + intensity * (steering * parameters.steerGain + parameters.steerBias + .55 * parameters.steerResidual * steerResidual),
      pedal + intensity * (parameters.pedalBias + .55 * parameters.pedalResidual * pedalResidual),
    ];
  };
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

  const predict = compileNetwork(actor.layers);
  const correct = actor.neuralCorrection ? createCorrection(actor.neuralCorrection) : null;
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

    const inputs = Float64Array.from(features, (value, index) =>
      Math.max(-8, Math.min(8, (value - actor.center[index]) / actor.scale[index])));
    let [steering, pedal] = predict(inputs);
    if (correct) {
      [steering, pedal] = correct(car, inputs, steering, pedal);
    }
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

module.exports = { PROFILE, FORMAT, CORRECTED_FORMAT, REFINEMENT_BOUNDS, runtimeHashes, load, createDecoder, encodeRefinement };
