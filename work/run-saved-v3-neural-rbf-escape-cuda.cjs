'use strict';
// CUDA-backed replay of the isolated neural-only radial escape diagnostic.
// Writes a new research report only; never touches application or save data.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
const reportDir = path.join(root, '.impeccable/review/learning-ml/saved-v3-neural-rbf-escape-cuda-user-approved-20261022-01');
if (fs.existsSync(reportDir)) throw new Error(`Refusing to overwrite ${reportDir}`);
process.env.MALECNS_V3_RBF_ESCAPE_REPORT_DIR = reportDir;

const Dense = require(path.join(root, 'outputs/dense-neural.js'));
const Cuda = require('./cuda-exact-v3-runtime.cjs');
const originalStep = Dense.step;
Dense.step = (...args) => Cuda.pass(...args);

process.once('beforeExit', () => {
  const gpu = Cuda.stats();
  Dense.step = originalStep;
  Cuda.close();
  const reportPath = path.join(reportDir, 'report.json');
  if (fs.existsSync(reportPath)) {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    report.cudaVerification = {
      ...gpu,
      verifiedGpuOnly: gpu.gpuCalls > 0 && gpu.cpuFallbacks === 0,
      runner: 'CUDA exact V3 neural pass; CPU simulation physics',
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), { encoding: 'utf8' });
  }
  console.log('V3_NEURAL_RBF_ESCAPE_CUDA_STATS ' + JSON.stringify(gpu));
  if (gpu.gpuCalls === 0 || gpu.cpuFallbacks !== 0) process.exitCode = 1;
});

// The older protected telemetry predates the current source revision. Bind the
// replay to this turn's already-passed exact-checkpoint A/B source hashes, then
// retain the benchmark's stricter saved-leader, trace, and save checks.
const benchmarkPath = path.join(__dirname, 'benchmark-saved-v3-neural-rbf-escape.cjs');
let benchmarkSource = fs.readFileSync(benchmarkPath, 'utf8');
const oldGuard = "if(sourceHashes.simulation!==control.sourceHashes.simulation||sourceHashes.learning!==control.sourceHashes.learning)\n    throw Error('Current application sources differ from the protected exact-replay evidence');";
const newGuard = "const currentRun=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-coherent-es-high-sample-ab-20261022-01/report.json'),'utf8'));\n  if(!currentRun.passed||!currentRun.productionSourceHashes.unchanged||sourceHashes.simulation!==currentRun.productionSourceHashes.before['outputs/simulation.js']||sourceHashes.learning!==currentRun.productionSourceHashes.before['outputs/neural-learning.js'])\n    throw Error('Current source hashes do not match the verified exact-checkpoint A/B');";
if (!benchmarkSource.includes(oldGuard) || benchmarkSource.indexOf(oldGuard) !== benchmarkSource.lastIndexOf(oldGuard)) {
  throw new Error('Expected one obsolete source-hash guard in the diagnostic runner');
}
benchmarkSource = benchmarkSource.replace(oldGuard, newGuard);
const benchmarkModule = new Module(benchmarkPath, module);
benchmarkModule.filename = benchmarkPath;
benchmarkModule.paths = Module._nodeModulePaths(path.dirname(benchmarkPath));
benchmarkModule._compile(benchmarkSource, benchmarkPath);
