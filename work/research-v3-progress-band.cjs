'use strict';
// Isolated A/B research wrapper. Patches the no-lap ranking in memory only;
// no production source, save, version, or app package is edited.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const bandArg = process.argv.find(value => value.startsWith('--rank-band-meters='));
const bandMeters = Number(bandArg?.split('=')[1]);
if (!Number.isFinite(bandMeters) || bandMeters < 1 || bandMeters > 100) {
  throw new Error('Specificare --rank-band-meters tra 1 e 100.');
}

const simulationPath = path.join(root, 'outputs', 'simulation.js');
const original = fs.readFileSync(simulationPath, 'utf8');
const anchor = 'if(aLaps===0&&Math.abs(aProgress-bProgress)>1e-9)return bProgress-aProgress;';
if (!original.includes(anchor)) throw new Error('Comparatore sorgente cambiato: patch sperimentale annullata.');
const replacement = `if(aLaps===0){const band=Number(globalThis.__maleCnsProgressBandMeters)||0;`+
  `if(band>0){const aBand=Math.floor(aProgress/band),bBand=Math.floor(bProgress/band);`+
  `if(aBand!==bBand)return bBand-aBand;}`+
  `else if(Math.abs(aProgress-bProgress)>1e-9)return bProgress-aProgress;}`;
const patched = original.replace(anchor, replacement);
globalThis.__maleCnsProgressBandMeters = bandMeters;
const loaded = new Module(simulationPath, module);
loaded.filename = simulationPath;
loaded.paths = Module._nodeModulePaths(path.dirname(simulationPath));
loaded._compile(patched, simulationPath);
require.cache[simulationPath] = loaded;

const outArg = process.argv.find(value => value.startsWith('--out='));
const outDir = outArg ? path.resolve(root, outArg.slice('--out='.length)) : null;
const audit = {
  format: 'male-cns-research-no-lap-progress-band-v1',
  ranking: 'safe outcome first; lap count first; before any lap compare floor(safeProgressMeters / bandMeters), then real penalized fitness, then exact progress',
  bandMeters,
  sourcePath: simulationPath,
  sourceSha256: crypto.createHash('sha256').update(original).digest('hex'),
  patchedSourceSha256: crypto.createHash('sha256').update(patched).digest('hex'),
  runtimeOnly: true,
  productionFilesChanged: false,
  userSaveChanged: false,
  appVersionChanged: false
};
process.on('exit', () => {
  if (!outDir || !fs.existsSync(outDir)) return;
  fs.writeFileSync(path.join(outDir, 'progress-band-audit.json'), JSON.stringify(audit, null, 2), { flag: 'wx' });
  const reportPath = path.join(outDir, 'report.json');
  if (fs.existsSync(reportPath)) {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    report.learningRankingResearch = audit;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }
});

// Keep the training runner's normal argument parser; the extra ranking flag is
// accepted as metadata and ignored by it.
require('./continue-saved-v3-training-cuda.cjs');
