'use strict';
// Audit only. Removing files from the Git index is a separate explicit action.
// Local saves, diagnostics, releases and source files are never deleted here.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const git = args => cp.execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024}).trim();
assert.equal(path.resolve(git(['rev-parse', '--show-toplevel'])), root, 'Run the audit from its own Git checkout');
const files = git(['ls-files', '-z']).split('\0').filter(Boolean);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const planFile = path.join(root, '.impeccable/review/repository-cleanup/plan.json');
const generated = file => /\.malecns-save$/.test(file) ||
  /^outputs\/(?:progress-[^/]+|[^/]*-progress-[^/]+|[^/]*-verification[^/]*|verification[^/]*|[^/]*-diagnosis[^/]*|[^/]*-benchmark[^/]*|pulizia-[^/]+)\//.test(file) ||
  /^outputs\/[^/]*verification[^/]*\.json$/.test(file) || /^outputs\/[^/]*\.tap$/.test(file);
const shipping = file => pkg.build.files.some(pattern => pattern.endsWith('/**/*') ?
  file.startsWith(pattern.slice(0, -4)) : file === pattern);
const absolute = file => {
  const target = path.resolve(root, file);
  assert.ok(target.startsWith(root + path.sep), 'Target outside checkout');
  return target;
};
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(absolute(file))).digest('hex');
const candidates = files.filter(generated);
assert.ok(candidates.every(file => !shipping(file)), 'Generated candidate is in the app bundle');
for (const pattern of pkg.build.files) {
  const target = pattern.endsWith('/**/*') ? pattern.slice(0, -5) : pattern;
  assert.ok(fs.existsSync(absolute(target)), 'Missing build source: ' + target);
}

if (process.argv.includes('--plan')) {
  assert.ok(!fs.existsSync(planFile), 'A preservation plan already exists; do not overwrite it');
  const removed = candidates.map(file => ({file, bytes: fs.statSync(absolute(file)).size, sha256: digest(file)}));
  // README and ignore rules are the explicitly edited publication documents.
  const retained = files.filter(file => !generated(file) && !['README.md', '.gitignore'].includes(file) && fs.lstatSync(absolute(file)).isFile())
    .map(file => ({file, sha256: digest(file)}));
  const plan = {createdAt: new Date().toISOString(), baseCommit: git(['rev-parse', 'HEAD']), version: pkg.version, removed, retained,
    boundary: 'Index-only cleanup. Local originals remain; no history, tags, releases, saves or runtime edits.'};
  fs.mkdirSync(path.dirname(planFile), {recursive: true});
  fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));
  console.log(JSON.stringify({planned: true, files: removed.length, saveFiles: removed.filter(x => x.file.endsWith('.malecns-save')).length,
    bytes: removed.reduce((total, x) => total + x.bytes, 0), retainedFiles: retained.length}));
} else if (process.argv.includes('--verify')) {
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const preservedLocal = plan.removed.filter(x => !fs.existsSync(absolute(x.file)) || digest(x.file) !== x.sha256);
  const changedSource = plan.retained.filter(x => !fs.existsSync(absolute(x.file)) || digest(x.file) !== x.sha256);
  const stillTracked = plan.removed.filter(x => files.includes(x.file));
  const passed = !preservedLocal.length && !changedSource.length && !stillTracked.length && !candidates.length && pkg.version === plan.version;
  console.log(JSON.stringify({passed, localFilesPreserved: plan.removed.length - preservedLocal.length,
    retainedFilesPreserved: plan.retained.length - changedSource.length, stillTracked: stillTracked.length,
    excludedFiles: plan.removed.length, version: pkg.version}));
  assert.ok(passed, 'Cleanup preservation failed');
} else {
  const trackedPrivate = files.filter(file => /(?:^|\/)(?:\.codex|\.impeccable|node_modules|__pycache__)\//.test(file) || /^dist-[^/]+\//.test(file) || (/(?:^|\/)\.env(?:\.[^/]+)?$/.test(file) && !file.endsWith('.env.example')));
  const passed = !candidates.length && !trackedPrivate.length;
  console.log(JSON.stringify({passed, trackedFiles: files.length, generatedFiles: candidates.length,
    trackedPrivate: trackedPrivate.length, version: pkg.version,
    boundary: 'Build-source availability and generated-file exclusion only, not an exhaustive unused-code detector.'}));
  assert.ok(passed, 'Generated or private files remain in Git');
}
