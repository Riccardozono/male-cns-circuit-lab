'use strict';
// Isolated A/B research wrapper. Chooses which motor block to mutate using
// only the stopped safe agent's actual steering output and wall-ray evidence.
// The controller itself, rewards, physics, RNG, saves, and production files stay unchanged.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const simulationPath = path.join(root, 'outputs', 'simulation.js');
const original = fs.readFileSync(simulationPath, 'utf8');
const Learning = require(path.join(root, 'outputs', 'neural-learning.js'));
const focusMutationCalls = { steering: 0, longitudinal: 0, combined: 0, unfocused: 0 };
const originalSafeMotorMutation = Learning.safeMotorMutation;
Learning.safeMotorMutation = function (...args) {
  const focus = args[5];
  if (focus === 'steering' || focus === 'longitudinal' || focus === 'combined') focusMutationCalls[focus]++;
  else focusMutationCalls.unfocused++;
  return originalSafeMotorMutation.apply(this, args);
};
const anchor = "const frontierMutationFocus=stagnantFrontier&&safeLeaderStopped?'longitudinal':null;";
if (!original.includes(anchor)) throw new Error('Comparatore sorgente cambiato: patch sperimentale annullata.');
const replacement = `const frontierSteeringMagnitude=Math.abs(Number(safeProgressLeader?.outputs?.[0])||0);`+
  `const frontierRoadAsymmetry=Math.abs(Number(roadSense(this.track,safeProgressLeader)[0])||0);`+
  `const frontierMutationFocus=stagnantFrontier&&safeLeaderStopped`+
  `?(frontierSteeringMagnitude<.04&&frontierRoadAsymmetry>.08?'steering':'longitudinal'):null;`;
const patched = original.replace(anchor, replacement);
const loaded = new Module(simulationPath, module);
loaded.filename = simulationPath;
loaded.paths = Module._nodeModulePaths(path.dirname(simulationPath));
loaded._compile(patched, simulationPath);
require.cache[simulationPath] = loaded;

const outArg = process.argv.find(value => value.startsWith('--out='));
const outDir = outArg ? path.resolve(root, outArg.slice('--out='.length)) : null;
const audit = {
  format: 'male-cns-research-observed-steering-focus-v1',
  rule: 'only for a safe stalled frontier, focus mutations on steering when the actual steering command is below 0.04 and wall-ray asymmetry exceeds 0.08; otherwise retain longitudinal focus',
  sourcePath: simulationPath,
  sourceSha256: crypto.createHash('sha256').update(original).digest('hex'),
  patchedSourceSha256: crypto.createHash('sha256').update(patched).digest('hex'),
  runtimeOnly: true,
  productionFilesChanged: false,
  userSaveChanged: false,
  appVersionChanged: false,
  focusMutationCalls
};
process.on('exit', () => {
  if (!outDir || !fs.existsSync(outDir)) return;
  fs.writeFileSync(path.join(outDir, 'steering-focus-audit.json'), JSON.stringify(audit, null, 2), { flag: 'wx' });
  const reportPath = path.join(outDir, 'report.json');
  if (fs.existsSync(reportPath)) {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    report.trainingInterventionResearch = audit;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }
});
require('./continue-saved-v3-training-cuda.cjs');
