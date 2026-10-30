'use strict';
// Isolated actual-physics evaluator. The new gate consumes only current
// neuronal observations; no position, route, clock or ideal action is exposed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const Model = require('./neural-statehead-model.cjs');
const Parent = require('./neural-frontier-chain.cjs');
const State = require('./neural-statehead.cjs');
const Residual = require('./neural-projected-residual.cjs');
const Bridge = require('./neural-command-state.cjs');
const Affine = require('./neural-affine-motor-head.cjs');

function create({ preparedFile, modelFile } = {}) {
  if (process.versions.node !== '24.19.0') throw Error('Pinned Node 24.19.0 runtime required');
  const preparedText = fs.readFileSync(preparedFile, 'utf8');
  const prepared = JSON.parse(preparedText);
  const loaded = Model.load(modelFile);
  if (prepared.format !== 'male-cns-actual-neuronal-state-head-preparation-v1'
    || prepared.parentSha256 !== loaded.data.parentSha256
    || prepared.firstActivatedControl !== 7727) throw Error('Verified early neural-context gate and matching parent required');

  const physical = Bridge.create();
  const brain = Parent.controller(loaded.parent);
  const parentHead = State.create(loaded.data);
  const affineGate = Residual.createGate(prepared.basis);
  let prefix = null;
  let protectedControls = 0;
  let gateParentHeadValue = null;

  function observe(raw) {
    brain.observe(raw);
    parentHead.observe(raw);
    affineGate.observe(raw);
  }

  function resetFull() {
    brain.reset();
    parentHead.reset();
    affineGate.reset();
    const state = physical.reset('full');
    observe(state.observation);
    return state;
  }

  function reset(mode) {
    if (mode === 'full') return resetFull();
    if (mode !== 'practice' || !prefix) throw Error('Actual full or previously reached practice state required');
    const state = physical.restore(prefix.physics);
    brain.restore(prefix.brain);
    parentHead.restore(prefix.parentHead);
    affineGate.restore(prefix.affineGate);
    return state;
  }

  function step(parameters) {
    const gate = affineGate.value();
    const parentPrior = brain.compose(physical.priorCommands(brain.snapshot().old));
    const learnedParent = parentHead.compose(parentPrior, loaded.data.weights);
    const commands = Affine.compose(learnedParent, gate, parameters);
    const state = physical.stepMotor(commands);
    if (!state.terminated && !state.truncated) observe(state.observation);
    return { state, commands, gate };
  }

  // Reach the correction context through the actual parent controller. The
  // control count is a verification only; it never enters the controller.
  let state = resetFull();
  const started = performance.now();
  while (affineGate.value() === 0) {
    if (performance.now() - started > 180000) throw Error('Bounded diagnostic wall guard while reaching real neural context');
    const result = step(Affine.IDENTITY);
    state = result.state;
    protectedControls++;
    if (state.terminated || state.truncated) throw Error('The verified neuronal gate was not reached on the actual episode');
  }
  if (protectedControls !== prepared.firstActivatedControl) throw Error('Actual first activation differs from verified 7727-control context');
  gateParentHeadValue = parentHead.value();
  prefix = { physics: physical.capture(), brain: brain.capture(), parentHead: parentHead.capture(), affineGate: affineGate.capture() };

  function evaluate(parameters, { mode = 'full', watchdogMs = 180000 } = {}) {
    Affine.validate(parameters);
    if (!Number.isFinite(watchdogMs) || watchdogMs < 1000 || watchdogMs > 180000) throw Error('Bounded diagnostic wall guard required');
    const startedAt = performance.now();
    const trace = crypto.createHash('sha256');
    const suffixTrace = crypto.createHash('sha256');
    let current = reset(mode);
    let controls = 0;
    let suffixControls = 0;
    let overlap = 0;
    let lastGate = affineGate.value();
    while (!current.terminated && !current.truncated && performance.now() - startedAt < watchdogMs) {
      const result = step(parameters);
      current = result.state;
      controls++;
      overlap += Number(Math.min(result.commands[1], result.commands[2]) !== 0);
      lastGate = result.gate;
      const sample = JSON.stringify([current.info.bestProgress, current.info.totalSimulationSeconds, result.commands]) + '\n';
      trace.update(sample);
      if (result.gate > 0) { suffixTrace.update(sample); suffixControls++; }
    }
    const censored = !current.terminated || current.truncated || performance.now() - startedAt >= watchdogMs;
    return {
      result: current.info,
      validationMode: mode,
      complete: current.terminated === true,
      censored,
      actualActorControls: controls,
      suffixControls,
      gasBrakeOverlapSteps: overlap,
      actionTraceSha256: trace.digest('hex'),
      gatedSuffixTraceSha256: suffixTrace.digest('hex'),
      finalNeuralGate: lastGate,
      wallSeconds: (performance.now() - startedAt) / 1000
    };
  }

  function metadata() {
    return {
      format: 'male-cns-neural-affine-motor-env-v1',
      appVersion: loaded.data.appVersion,
      modelId: loaded.data.modelId,
      circuitId: loaded.data.circuitId,
      modelSha256: loaded.sha256,
      parentSha256: loaded.data.parentSha256,
      preparedSha256: crypto.createHash('sha256').update(preparedText).digest('hex'),
      gateFirstActivatedControl: protectedControls,
      gateInput: '516 actual neuronal/controller values only',
      parentHeadValueAtAffineActivation: gateParentHeadValue,
      affineParameters: 4,
      identity: Affine.IDENTITY,
      limits: Affine.LIMITS,
      protectedResult: loaded.data.expectedResult,
      boundary: 'Real full physics/reward and current neuronal parent actions. New affine calibration is identity before its actually reached neural gate. No teacher, geometry, route, position, target or clock inputs. The optimizer is separate and scores only completed measured fitness.'
    };
  }

  return { reset, evaluate, metadata };
}

if (require.main === module) {
  let env;
  require('node:readline').createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', line => {
    let id = null;
    try {
      if (line.length > 8192) throw Error('Bounded evaluator request required');
      const message = JSON.parse(line); id = message.id;
      if (!Number.isInteger(id)) throw Error('Request ID required');
      let result;
      if (message.op === 'init') {
        if (env) throw Error('Already initialized');
        env = create(message.configuration); result = env.metadata();
      } else if (!env) throw Error('Initialize first');
      else if (message.op === 'evaluate') result = env.evaluate(message.genes, { mode: message.mode, watchdogMs: message.watchdogMs });
      else throw Error('Unsupported actual-physics operation');
      process.stdout.write(JSON.stringify({ id, result }) + '\n');
    } catch (error) { process.stdout.write(JSON.stringify({ id, error: error.stack }) + '\n'); }
  });
}

module.exports = { create };
