'use strict';
const fs = require('node:fs'), path = require('node:path'), {spawnSync} = require('node:child_process'),
  F = require('../outputs/simulation.js'), Pool = require('./physical-rollout-pool.cjs'), I = require('./neural-research-source-identity.cjs'),
  {fullRollout, outcome} = require('./practice-full-rollout.cjs'), root = path.resolve(__dirname, '..');
function logits(graph, brain, genome) {
  const p = graph.learning, w = genome.policyWeights, norm = 1/Math.sqrt(p.nodes.length), value = [0, 0];
  for (let j = 0; j < p.nodes.length; j++) for (let a = 0; a < 2; a++)
    value[a] += brain.policyFeatures[j]*w[p.readoutOffset+j*2+a]*norm;
  for (let a = 0; a < 2; a++) value[a] += w[w.length-2+a];
  return p.nodes.some(n => Math.abs(brain.activity[n]) >= 1e-7) ? value : [0, 0];
}
const out = path.join(root, '.impeccable/review/learning-ml/v3-differentiable-recurrent-preflight-20261024-01');
if (fs.existsSync(out)) throw Error('Preserve previous gradient preflight');
const sourceDir = path.join(root, '.impeccable/review/learning-ml/saved-v3-multistart-learning-ab-20261024-01'),
  training = JSON.parse(fs.readFileSync(path.join(sourceDir, 'report.json'), 'utf8')),
  genome = JSON.parse(fs.readFileSync(path.join(sourceDir, 'zero-only.private.json'), 'utf8')).genome,
  parentSha256 = I.sha(JSON.stringify(genome)), sim = Pool.setup(), chunks = [], starts = [0, 520, 610, 690], count = 8;
if (!training.passed || parentSha256 !== training.final.find(x => x.arm === 'zero-only').best.genomeSha256) throw Error('Verified parent required');
const files = ['work/preflight-differentiable-v3.cjs', 'work/differentiable_v3_reservoir.py', 'work/verify-differentiable-v3.py'],
  before = I.collect(files), started = Date.now(); let control = 0;
const api = {...F, neuralStep(...args) {
  if (starts.includes(control)) chunks.push({startControl: control, initialActivity: Array.from(args[1].activity), rows: []});
  const commands = F.neuralStep(...args);
  for (const chunk of chunks) if (control >= chunk.startControl && control < chunk.startControl+count) {
    chunk.rows.push({sensors: args[3].slice(), commands, logits: logits(sim.graph, args[1], args[2])});
    if (chunk.rows.length === count) chunk.finalActivity = Array.from(args[1].activity);
  }
  control++; return commands;
}}, replay = fullRollout(api, sim.track, sim.graph, genome, {rewardRevision: 'progress-3', maxTicks: 60000}), baseline = outcome(F, replay);
if (!Pool.same(baseline, training.final.find(x => x.arm === 'zero-only').best.zero) || chunks.some(c => c.rows.length !== count)) throw Error('Native trace differs');
const nativeFiniteDifferences = [], probe = chunks[1], epsilon = .001;
function objective(index, direction) {
  const g = F.cloneGenome(genome); g.policyWeights[index] += epsilon*direction;
  const brain = F.makeBrain(sim.graph); brain.activity.set(probe.initialActivity); let total = 0;
  for (const row of probe.rows) {F.neuralStep(sim.graph, brain, g, row.sensors, true, true); const z = logits(sim.graph, brain, g); total += .37*z[0]-.19*z[1];}
  return total;
}
for (const index of [0, 10, 18, 28, 39, 55, 56, 63, 71, 72, 73, 126, 198, 200, 201]) {
  if (Math.abs(genome.policyWeights[index])+epsilon > 8) continue;
  const plus = objective(index, 1), minus = objective(index, -1);
  nativeFiniteDifferences.push({index, epsilon, numeric: (plus-minus)/(2*epsilon)});
}
fs.mkdirSync(out); const input = path.join(out, 'native-sequence.private.json'), pythonReport = path.join(out, 'numeric-verification.json');
fs.writeFileSync(input, JSON.stringify({format: 'actual-v3-recurrent-gradient-preflight-v1', parentSha256, weights: genome.policyWeights,
  graph: {n: sim.graph.n, from: Array.from(sim.graph.from), to: Array.from(sim.graph.to), weights: Array.from(sim.graph.weights),
    inputs: Array.from(sim.graph.inputs), groups: Array.from(sim.graph.learning.groups),
    readoutNodes: Array.from(sim.graph.learning.nodes), readoutOffset: sim.graph.learning.readoutOffset, iterations: 4},
  chunks, nativeFiniteDifferences}), {flag: 'wx'});
const child = spawnSync(path.join(root, '.impeccable/rl-venv/Scripts/python.exe'), [path.join(root, files[2]), input, pythonReport],
  {windowsHide: true, encoding: 'utf8', maxBuffer: 1024*1024, timeout: 120000});
if (child.status !== 0) throw Error('Numerical preflight failed: '+child.stderr);
const numeric = JSON.parse(fs.readFileSync(pythonReport, 'utf8')),
  save = 'C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',
  saveUnchanged = I.sha(fs.readFileSync(save)) === '29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3',
  sourceStable = JSON.stringify(I.collect(files)) === JSON.stringify(before),
  report = {...numeric, format: 'v3-differentiable-recurrent-preflight-v1', created: new Date().toISOString(), appVersion: '5.6.0',
    passed: numeric.passed && sourceStable && saveUnchanged, learningSucceeded: false, baseline, actualPhysicalControls: control,
    parentSha256, integrity: {sourceHashes: before, sourceStable, saveUnchanged,
      inputSha256: I.sha(fs.readFileSync(input)), numericReportSha256: I.sha(fs.readFileSync(pythonReport))}, wallSeconds: (Date.now()-started)/1000};
if (!report.passed) throw Error('Preflight preservation failed');
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2), {flag: 'wx'});
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(out, path.basename(file)));
console.log('RECURRENT_PREFLIGHT '+JSON.stringify({passed: report.passed, learningSucceeded: false, baseline,
  forward: numeric.forward, nativeChecks: numeric.nativeFiniteDifferenceChecks.length, gradientNorms: numeric.gradientBlockNorms,
  wallSeconds: report.wallSeconds, report: path.join(out, 'report.json'), sha256: I.sha(fs.readFileSync(path.join(out, 'report.json')))}));
