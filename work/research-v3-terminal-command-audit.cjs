'use strict';
// Replay-only instrumentation for terminal V3/Monza outcomes.
// Adds actual final motor commands, speed and pose to the research report.
// It patches the runner in memory and does not modify production sources or saves.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const runnerPath = path.join(root, 'work', 'continue-saved-v3-training-cuda.cjs');
const source = fs.readFileSync(runnerPath, 'utf8');
const anchor = "terminal=s.cars.map(c=>({id:c.id,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),laps:c.laps,fitness:c.fitness,reason:c.reason||'',safe:F.isSafeLearningOutcome(c)})).sort((a,b)=>a.id-b.id);";
if (!source.includes(anchor)) throw new Error('Terminal outcome mapper changed; diagnostic aborted.');
const replacement = "terminal=s.cars.map(c=>({id:c.id,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),laps:c.laps,fitness:c.fitness,reason:c.reason||'',safe:F.isSafeLearningOutcome(c),steering:Number(c.outputs?.[0])||0,throttle:Number(c.outputs?.[1])||0,brake:Number(c.outputs?.[2])||0,speedMps:Number(c.vehicle?.speedMps??(c.speed/(s.track.pixelsPerMeter||1)))||0,slipAngle:Number(c.slipAngle)||0,heading:Number(c.angle)||0,x:Number(c.x)||0,y:Number(c.y)||0,lifetime:Number(c.lifetime)||0})).sort((a,b)=>a.id-b.id);";
const patched = source.replace(anchor, replacement);
if (patched === source) throw new Error('Terminal instrumentation patch was not applied.');
const audit = {
  format: 'male-cns-v3-terminal-command-audit-v1',
  runtimeOnly: true,
  productionFilesChanged: false,
  sourcePath: runnerPath,
  sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
  patchedRunnerSha256: crypto.createHash('sha256').update(patched).digest('hex'),
  fields: ['steering', 'throttle', 'brake', 'speedMps', 'slipAngle', 'heading', 'x', 'y', 'lifetime']
};

const loaded = new Module(runnerPath, module);
loaded.filename = runnerPath;
loaded.paths = Module._nodeModulePaths(path.dirname(runnerPath));
loaded._compile(patched, runnerPath);
require.cache[runnerPath] = loaded;

process.on('exit', () => {
  const outArg = process.argv.find(value => value.startsWith('--out='));
  if (!outArg) return;
  const outDir = path.resolve(root, outArg.slice('--out='.length));
  if (!fs.existsSync(outDir)) return;
  fs.writeFileSync(path.join(outDir, 'terminal-command-audit.json'), JSON.stringify(audit, null, 2), { flag: 'wx' });
  const reportPath = path.join(outDir, 'report.json');
  if (!fs.existsSync(reportPath)) return;
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  report.terminalCommandAudit = audit;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
});
