'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'),
  {spawnSync} = require('node:child_process'), {Worker, isMainThread, parentPort, workerData} = require('node:worker_threads'),
  F = require('../outputs/simulation.js'), Pool = require('./physical-rollout-pool.cjs'), R = require('./descending-readout-residual.cjs'),
  {fullRollout, outcome} = require('./practice-full-rollout.cjs'), root = path.resolve(__dirname, '..'),
  sha = x => crypto.createHash('sha256').update(x).digest('hex'),
  researchFiles = ['work/probe-descending-readout-comparison.cjs', 'work/descending-readout-residual.cjs',
    'work/fit-descending-readout-comparison.py', 'work/fit-prefix-constrained-readout.py', 'outputs/progress-save.js'],
  sources = () => ({...Pool.sources(), ...Object.fromEntries(researchFiles.map(f => [f, sha(fs.readFileSync(path.join(root, f)))]))});
function episode(sim, genome, spec, headingOffsetRad = 0, onControl = null) {
  const neural = spec ? R.wrap(F, sim.graph, spec) : F;
  const api = {...neural, makeCar(...args) {const car = F.makeCar(...args); car.heading += headingOffsetRad; return car;}};
  const result = fullRollout(api, sim.track, sim.graph, genome, {rewardRevision: 'progress-3', maxTicks: 60000, onControl});
  return {...outcome(F, result), progressM: result.car.bestProgress / (sim.track.pixelsPerMeter || 1)};
}
async function batch(tasks, reference, sourceHashes) {
  const workers = [], results = new Map();
  try {
    await Promise.all(Array.from({length: Math.min(2, tasks.length)}, (_, index) => new Promise((resolve, reject) => {
      const worker = new Worker(__filename, {workerData: {tasks: tasks.filter((_, j) => j % Math.min(2, tasks.length) === index), reference, sourceHashes}});
      workers.push(worker); let done = false;
      worker.on('message', m => {
        if (m.kind === 'error') reject(Error(m.error));
        if (m.kind === 'case') {if (results.has(m.id)) return reject(Error('Duplicate result')); results.set(m.id, m.result);
          if (results.size % 8 === 0 || m.result.safe && m.result.progressM > reference.expected.progressM + 1)
            console.log('DESCENDING_EPISODE ' + JSON.stringify({completed: results.size, total: tasks.length, id: m.id, ...m.result}));}
        if (m.kind === 'done') {done = true; resolve();}
      });
      worker.once('error', reject); worker.once('exit', code => {if (!done) reject(Error('Early worker exit ' + code));});
    })));
  } finally {await Promise.all(workers.map(w => w.terminate()));}
  if (results.size !== tasks.length) throw Error('Missing result');
  return results;
}
async function main() {
  const out = path.join(root, '.impeccable/review/learning-ml/v3-descending-readout-comparison-20261024-02');
  if (fs.existsSync(out)) throw Error('Preserve previous readout study');
  const trainingDir = path.join(root, '.impeccable/review/learning-ml/saved-v3-multistart-learning-ab-20261024-01'),
    training = JSON.parse(fs.readFileSync(path.join(trainingDir, 'report.json'), 'utf8')),
    parent = JSON.parse(fs.readFileSync(path.join(trainingDir, 'zero-only.private.json'), 'utf8')).genome,
    expected = training.final.find(x => x.arm === 'zero-only').best.zero,
    sim = Pool.setup(), oldNodes = Array.from(sim.graph.learning.nodes),
    nodes = Array.from({length: sim.graph.n}, (_, n) => n).filter(n => sim.graph.classNames[sim.graph.classCodes[n]] === 'descending_neuron'),
    observations = [], sourceHashes = sources(), started = Date.now(), parentSha256 = sha(JSON.stringify(parent));
  if (!training.passed || parentSha256 !== training.final.find(x => x.arm === 'zero-only').best.genomeSha256 || oldNodes.some(n => !nodes.includes(n))) throw Error('Verified parent/neurons required');
  const trace = crypto.createHash('sha256'), baseline = episode(sim, parent, null, 0, (car, tick) => {
    observations.push({tick, progressM: car.bestProgress / (sim.track.pixelsPerMeter || 1),
      features: nodes.map(n => Math.tanh(8 * car.brain.activity[n]))});
    trace.update(JSON.stringify([tick, car.slowOutputs, car.bestProgress, car.x, car.y, car.heading]) + '\n');
  }), traceSha256 = trace.digest('hex');
  if (!Pool.same(baseline, expected)) throw Error('Parent replay differs');
  const zero = {nodes, weights: Array((nodes.length + 1) * 2).fill(0)}, zeroTrace = crypto.createHash('sha256'),
    identity = episode(sim, parent, zero, 0, (car, tick) => zeroTrace.update(JSON.stringify([tick, car.slowOutputs, car.bestProgress, car.x, car.y, car.heading]) + '\n'));
  const identityTraceSha256 = zeroTrace.digest('hex');
  if (!Pool.same(baseline, identity) || identityTraceSha256 !== traceSha256) throw Error('Zero extension changed the physical drive');
  fs.mkdirSync(out); const input = path.join(out, 'observations.private.json'), candidatesFile = path.join(out, 'candidates.private.json');
  fs.writeFileSync(input, JSON.stringify({format: 'actual-descending-activity-v1', parentSha256, genome: parent, baseline, nodes,
    oldNodes, bodyIds: nodes.map(n => sim.graph.bodyIds[n]), observations}), {flag: 'wx'});
  console.log('DESCENDING_IDENTITY ' + JSON.stringify({baseline, controls: observations.length, oldNeurons: oldNodes.length, availableDescending: nodes.length, traceSha256}));
  const fitted = spawnSync(path.join(root, '.impeccable/rl-venv/Scripts/python.exe'), [path.join(root, researchFiles[2]), input, candidatesFile],
    {windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024});
  if (fitted.status !== 0) throw Error('Fit failed: ' + fitted.stderr);
  console.log('DESCENDING_FIT ' + fitted.stdout.trim());
  const candidateData = JSON.parse(fs.readFileSync(candidatesFile, 'utf8'));
  if (candidateData.parentSha256 !== parentSha256) throw Error('Fit parent mismatch');
  const reference = {genome: parent, expected: baseline}, tasks = candidateData.variants.map(v => ({id: v.id, genome: parent, spec: v.spec})),
    results = await batch(tasks, reference, sourceHashes);
  for (const row of candidateData.variants) {R.validate(sim.graph, row.spec); row.outcome = results.get(row.id);}
  const ranked = candidateData.variants.filter(v => v.outcome.safe).sort((a, b) => F.compareLearningAgents(a.outcome, b.outcome)),
    bestBySpace = candidateData.representations.map(r => ({name: r.name, safe: candidateData.variants.filter(v => v.name === r.name && v.outcome.safe).length,
      total: candidateData.variants.filter(v => v.name === r.name).length, best: ranked.find(v => v.name === r.name)})),
    top = bestBySpace.map(r => r.best).filter(Boolean), offsets = [-.002, -.001, 0, .001, .002],
    validationTasks = top.flatMap(v => offsets.map(offset => ({id: v.id + '@' + offset, genome: parent, spec: v.spec, headingOffsetRad: offset}))),
    validation = validationTasks.length ? await batch(validationTasks, reference, sourceHashes) : new Map(),
    validations = top.map(v => ({id: v.id, episodes: offsets.map(offset => ({headingOffsetRad: offset, ...validation.get(v.id + '@' + offset)}))}));
  for (const v of top) if (!Pool.same(v.outcome, validation.get(v.id + '@0'))) throw Error('Independent candidate replay differs');
  const savePath = 'C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',
    saveUnchanged = sha(fs.readFileSync(savePath)) === '29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3',
    sourceStable = JSON.stringify(sources()) === JSON.stringify(sourceHashes), publicRow = ({spec, ...rest}) => rest,
    report = {format: 'descending-readout-comparison-v1', created: new Date().toISOString(), appVersion: '5.6.0',
      passed: saveUnchanged && sourceStable, learningSucceeded: validations.some(v => v.episodes.every(r => r.safe && r.laps >= 2)),
      singleStartImproved: ranked.some(v => v.outcome.progressM > baseline.progressM + 1),
      baseline, controls: observations.length, parentSha256, identity: {exact: true, traceSha256, identityTraceSha256},
      anatomicalNeurons: sim.graph.n, anatomicalEdges: sim.graph.edgeCount, currentReadout: oldNodes.length, availableDescending: nodes.length,
      representations: candidateData.representations, diagnostics: candidateData.diagnostics,
      bestBySpace: bestBySpace.map(r => ({...r, best: r.best ? publicRow(r.best) : null})),
      variants: candidateData.variants.map(publicRow), validations,
      settings: {rewardRevision: 'progress-3', workers: 2, maxTicks: 60000, ridge: 1e-6, prefixLogitCap: .001, weightBound: 8},
      method: 'Same fixed learned parent, static zero-initialized residual over current64 versus all existing descending neurons. Directions fitted to actual neural observations with prefix constraints; symmetric candidate logit changes judged only by complete physical episodes. No route, clock, direct sensor or teacher action is supplied at runtime.',
      integrity: {sourceHashes, saveUnchanged, sourceStable, observationsSha256: sha(fs.readFileSync(input)), candidatesSha256: sha(fs.readFileSync(candidatesFile))},
      wallSeconds: (Date.now() - started) / 1000,
      boundary: 'A bounded local decoder-capacity probe on one trained V3/Monza parent, not proof of cold-start or general two-lap learning. Watchdog termination is censored and unsafe. Private models are not normal app saves.'};
  if (!report.passed) throw Error('Source/save integrity failed');
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2), {flag: 'wx'});
  for (const file of researchFiles.slice(0, 4)) fs.copyFileSync(path.join(root, file), path.join(out, path.basename(file)));
  if (report.singleStartImproved) fs.writeFileSync(path.join(out, 'best.private.json'), JSON.stringify({format: 'private-descending-residual-v1',
    genome: parent, spec: ranked[0].spec, expected: ranked[0].outcome, sourceReport: 'report.json'}, null, 2), {flag: 'wx'});
  console.log('DESCENDING_RESULT ' + JSON.stringify({passed: report.passed, learningSucceeded: report.learningSucceeded,
    singleStartImproved: report.singleStartImproved, baseline, bestBySpace: report.bestBySpace, validations,
    wallSeconds: report.wallSeconds, report: path.join(out, 'report.json'), sha256: sha(fs.readFileSync(path.join(out, 'report.json')))}));
}
if (isMainThread) main().catch(e => {console.error(e.stack || e); process.exitCode = 1;});
else {
  try {
    if (JSON.stringify(sources()) !== JSON.stringify(workerData.sourceHashes)) throw Error('Worker source differs');
    const sim = Pool.setup(), baseline = episode(sim, workerData.reference.genome, null);
    if (!Pool.same(baseline, workerData.reference.expected)) throw Error('Worker baseline differs');
    for (const task of workerData.tasks) parentPort.postMessage({kind: 'case', id: task.id,
      result: episode(sim, task.genome, task.spec, task.headingOffsetRad || 0)});
    parentPort.postMessage({kind: 'done'});
  } catch (e) {parentPort.postMessage({kind: 'error', error: e.stack || String(e)}); process.exitCode = 1;}
}
