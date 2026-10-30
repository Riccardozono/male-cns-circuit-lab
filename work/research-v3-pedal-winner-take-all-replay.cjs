'use strict';
// Runtime-only counterfactual for the V3 decoder7 accelerator/brake tie.
// Keeps the stronger pedal at its requested level and zeros only the weaker
// pedal. It does not modify files on disk, saved weights, or reward logic.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const runnerPath = path.join(root, 'work', 'decoder7-readout-attribution-replay-rtx.cjs');
const runnerSource = fs.readFileSync(runnerPath, 'utf8');
const anchor = "let simulationRuntimeSource=fs.readFileSync(simulationPath,'utf8');";
if (!runnerSource.includes(anchor)) throw new Error('Decoder7 replay runner changed; arbitration replay aborted.');
const revisionGuard = 'state.rewardRevision!==Rewards.REVISION';
if (!runnerSource.includes(revisionGuard)) throw new Error('Reward-revision guard changed; arbitration replay aborted.');

const injection = `${anchor}
if (process.argv.includes('--pedal-arbitration-winner-take-all')) {
  const originalNormalizer = /if\\(brake>=throttle\\)\\s*\\{\\s*brake-=throttle;\\s*throttle=0;\\s*\\}\\s*else\\s*\\{\\s*throttle-=brake;\\s*brake=0;\\s*\\}/;
  if (!originalNormalizer.test(simulationRuntimeSource)) throw new Error('Expected pedal normalizer not found; arbitration replay aborted.');
  const sourceSha256 = crypto.createHash('sha256').update(simulationRuntimeSource).digest('hex');
  simulationRuntimeSource = simulationRuntimeSource.replace(originalNormalizer, 'if(brake>=throttle) { throttle=0; } else { brake=0; }');
  globalThis.__maleCnsPedalArbitrationAudit = {
    format: 'male-cns-v3-pedal-winner-take-all-replay-v1',
    intervention: 'Keep the stronger of accelerator/brake at its original requested level and set the weaker pedal to zero; exact ties select brake.',
    runtimeOnly: true,
    productionFilesChanged: false,
    saveFilesChanged: false,
    weightsChanged: false,
    rewardsChanged: false,
    rewardRevisionHandling: 'Accept only revisions listed in the existing Rewards.SUPPORTED_REVISIONS; preserve the checkpoint revision during replay.',
    sourcePath: path.join(root, 'outputs', 'simulation.js'),
    sourceSha256,
    patchedSourceSha256: crypto.createHash('sha256').update(simulationRuntimeSource).digest('hex')
  };
}
`;
const patchedRunner = runnerSource.replace(anchor, injection).replace(revisionGuard, '!Rewards.SUPPORTED_REVISIONS.includes(state.rewardRevision)');
if (patchedRunner === runnerSource) throw new Error('Pedal arbitration injection was not applied.');

const loaded = new Module(runnerPath, module);
loaded.filename = runnerPath;
loaded.paths = Module._nodeModulePaths(path.dirname(runnerPath));
loaded._compile(patchedRunner, runnerPath);
require.cache[runnerPath] = loaded;

process.on('exit', () => {
  const runtimeAudit = globalThis.__maleCnsPedalArbitrationAudit;
  if (!runtimeAudit) return;
  const outputArg = process.argv.find(value => value.startsWith('--output='));
  if (!outputArg) return;
  const output = path.resolve(root, outputArg.slice('--output='.length));
  if (!fs.existsSync(output)) return;
  fs.writeFileSync(path.join(output, 'pedal-arbitration-audit.json'), JSON.stringify(runtimeAudit, null, 2), { flag: 'wx' });
  const reportPath = path.join(output, 'decoder7-main-runtime-frontier-replay.json');
  if (!fs.existsSync(reportPath)) return;
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  report.pedalArbitrationResearch = runtimeAudit;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
});
