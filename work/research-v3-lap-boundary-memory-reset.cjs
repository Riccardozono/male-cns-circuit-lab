'use strict';
// A/B research treatment: reset recurrent neural state at a completed lap.
// Genome, physics, rewards, sensors, and episode state remain unchanged.
// The patch exists only in this process; production files and saves are untouched.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const simulationPath = path.join(root, 'outputs', 'simulation.js');
const original = fs.readFileSync(simulationPath, 'utf8');
const anchor = `for(const car of this.cars) {
        if(!car.alive) continue;
        // The desktop GPU bridge already sampled this exact physical state`;
if (!original.includes(anchor)) throw new Error('Simulation tick anchor changed; lap reset aborted.');
const intervention = `for(const car of this.cars) {
        if(!car.alive) continue;
        const currentLapCount=Number(car.laps)||0;
        if(car._maleCnsBrainLapCount===undefined)car._maleCnsBrainLapCount=currentLapCount;
        else if(currentLapCount>car._maleCnsBrainLapCount){
          const brain=car.brain;
          for(const key of ['activity','next','sum','inputDrive','active','nextActive','touched','marked','buckets','policyFeatures'])brain?.[key]?.fill?.(0);
          if(brain){brain.activeCount=0;brain.lastTouchedCount=0;brain.lastCoreCandidateCount=0;}
          car._maleCnsBrainLapCount=currentLapCount;
        }
        // The desktop GPU bridge already sampled this exact physical state`;
const patched = original.replace(anchor, intervention);
if (patched === original) throw new Error('Lap-boundary intervention was not applied.');
const audit = {
  format: 'male-cns-v3-lap-boundary-memory-reset-v1',
  intervention: 'At the first simulation tick after a completed lap, clear recurrent activity buffers and active count. Preserve genotype, policy weights, learned activity experience, vehicle, sensors, reward state and progress.',
  runtimeOnly: true,
  productionFilesChanged: false,
  userSaveChanged: false,
  appVersionChanged: false,
  sourcePath: simulationPath,
  sourceSha256: crypto.createHash('sha256').update(original).digest('hex'),
  patchedSourceSha256: crypto.createHash('sha256').update(patched).digest('hex')
};

const loaded = new Module(simulationPath, module);
loaded.filename = simulationPath;
loaded.paths = Module._nodeModulePaths(path.dirname(simulationPath));
loaded._compile(patched, simulationPath);
require.cache[simulationPath] = loaded;

require('./continue-saved-v3-training-cuda.cjs');
process.on('exit', () => {
  const outArg = process.argv.find(value => value.startsWith('--out='));
  if (!outArg) return;
  const outDir = path.resolve(root, outArg.slice('--out='.length));
  if (!fs.existsSync(outDir)) return;
  fs.writeFileSync(path.join(outDir, 'lap-boundary-reset-audit.json'), JSON.stringify(audit, null, 2), { flag: 'wx' });
  const reportPath = path.join(outDir, 'report.json');
  if (!fs.existsSync(reportPath)) return;
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  report.lapBoundaryResetResearch = audit;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
});
