'use strict';
// Allows an exact V3/decoder7 checkpoint replay with its recorded population
// and any already-supported reward revision; all changes remain in memory.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const runnerPath = path.join(root, 'work', 'decoder7-brake-aware-stopped-focus-rtx.cjs');
const source = fs.readFileSync(runnerPath, 'utf8');
const populationGuard = 'state.population!==40';
const revisionGuard = 'state.rewardRevision!==Rewards.REVISION';
if (!source.includes(populationGuard) || !source.includes(revisionGuard)) {
  throw new Error('Decoder7 continuation guards changed; paired experiment aborted.');
}
const patched = source
  .replace(populationGuard, "state.population!==Number(arg('--population','40'))")
  .replace(revisionGuard, '!Rewards.SUPPORTED_REVISIONS.includes(state.rewardRevision)');
const audit = {
  format: 'male-cns-v3-brake-aware-focus-paired-harness-v1',
  runtimeOnly: true,
  productionFilesChanged: false,
  savesChanged: false,
  compatibility: 'Replay checkpoint population as recorded and accept only Rewards.SUPPORTED_REVISIONS; preserve the saved reward revision.',
  originalRunnerSha256: crypto.createHash('sha256').update(source).digest('hex'),
  patchedRunnerSha256: crypto.createHash('sha256').update(patched).digest('hex')
};

const loaded = new Module(runnerPath, module);
loaded.filename = runnerPath;
loaded.paths = Module._nodeModulePaths(path.dirname(runnerPath));
loaded._compile(patched, runnerPath);
require.cache[runnerPath] = loaded;

process.on('exit', () => {
  const outputArg = process.argv.find(value => value.startsWith('--output='));
  if (!outputArg) return;
  const output = path.resolve(root, outputArg.slice('--output='.length));
  if (!fs.existsSync(output)) return;
  const branchAudit = {
    ...audit,
    branch: process.argv.includes('--brake-aware-stopped-focus') ? 'treatment' : 'control',
    brakeAwareStoppedFocus: process.argv.includes('--brake-aware-stopped-focus')
  };
  fs.writeFileSync(path.join(output, 'research-harness-audit.json'), JSON.stringify(branchAudit, null, 2), { flag: 'wx' });
  const reportPath = path.join(output, 'decoder7-main-runtime-result.json');
  if (!fs.existsSync(reportPath)) return;
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  report.researchHarnessAudit = branchAudit;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
});
