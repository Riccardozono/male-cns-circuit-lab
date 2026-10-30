'use strict';
// Research-only deterministic line search on already learned PPO directions.
// It does not train, export weights, or change the app/save.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Model = require('./neural-statehead-cuda-model.cjs');
const Env = require('./statehead-continuous-ppo-env.cjs');

const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(ROOT, '.impeccable/review/learning-ml');
const SEED_RUN = path.join(BASE, 'statehead-safe-anchor-gae-distance5-ppo-4up-20261026-62');
const RUN = path.join(BASE, 'statehead-frontier-gae-distance5-ppo-4up-20261026-63');
const PREPARED = path.join(BASE, 'statehead-fulltrace-gate-basis-20261026-41');
const PREFLIGHT = path.join(BASE, 'statehead-fulltrace-gate-zero-preflight-20261026-42/report.json');
const REFERENCE = path.join(BASE, 'statehead-fulltrace-gated-ppo-4up-20261026-43');
const OUTPUT = path.join(BASE, 'statehead-frontier-ppo-small-step-line-search-20261026-67');
const SAVE = 'C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const EXPECTED_SAVE_SHA256 = '29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const hashFile = file => sha(fs.readFileSync(file));
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const safe = result => result.complete && !['urto', 'fuori pista', 'progresso non valido'].includes(result.reason);

let env = null;
try {
  if (fs.existsSync(OUTPUT)) throw new Error('Preserve existing line-search artifact');
  const seedReportFile = path.join(SEED_RUN, 'report.json');
  const seedReport = json(seedReportFile);
  const runReportFile = path.join(RUN, 'report.json');
  const runReport = json(runReportFile);
  const runIdentity = json(path.join(RUN, 'identity.json'));
  const preflight = json(PREFLIGHT);
  const referenceReport = json(path.join(REFERENCE, 'report.json'));
  const referenceIdentity = json(path.join(REFERENCE, 'identity.json'));
  const basis = json(path.join(PREPARED, 'basis.private.json'));

  const guards = {
    seedPassed: seedReport.passed === true,
    seedNotApproved: seedReport.approvedForApp === false,
    runPassed: runReport.passed === true,
    runNotApproved: runReport.approvedForApp === false,
    runDidNotClaimLearning: runReport.learningSucceeded === false,
    frontierDidNotAdvance: runReport.trainingFrontierAdvanced === false,
    runSaveMatches: runReport.originalSaveSha256 === EXPECTED_SAVE_SHA256,
    diskSaveMatches: hashFile(SAVE) === EXPECTED_SAVE_SHA256,
    sameProtectedParent: referenceIdentity.parentSha256 === runIdentity.parentSha256,
    preflightParentMatches: preflight.parentSha256 === runIdentity.parentSha256,
    preflightResultMatches: preflight.fullResult.bestProgress === referenceReport.finalFreshReplay.bestProgress
      && preflight.fullResult.laps === referenceReport.finalFreshReplay.laps,
    referencePreflightHashMatches: referenceIdentity.preflightReportSha256 === hashFile(PREFLIGHT),
    identitySaveMatches: runIdentity.originalSaveSha256 === EXPECTED_SAVE_SHA256,
    preflightPassed: preflight.passed === true,
    basisHashMatches: preflight.basisFileSha256 === hashFile(path.join(PREPARED, 'basis.private.json')),
    frontierIsZeroLap: Boolean(runReport.trainingFrontier) && runReport.trainingFrontier.result.laps === 0,
  };
  const failedGuards = Object.entries(guards).filter(([, passed]) => !passed).map(([name]) => name);
  if (failedGuards.length) throw new Error(`Protected research input validation failed: ${failedGuards.join(', ')}`);
  fs.mkdirSync(OUTPUT, { recursive: false });

  const cachedBaseline = {
    observed: referenceReport.finalFreshReplay,
    controls: preflight.controls,
    traceSha256: preflight.parentActionTraceSha256,
    parentSha256: referenceIdentity.parentSha256,
  };
  env = Env.create({ basisOverride: basis, instantGate: true, verifiedBaseline: cachedBaseline });
  const environmentMetadata = env.metadata();
  if (!environmentMetadata.gateBasisOverride || !environmentMetadata.instantGate
      || environmentMetadata.parentSha256 !== runIdentity.parentSha256) {
    throw new Error('Research environment did not load the verified parent and real neural gate');
  }

  const baseline = runReport.trainingFrontier.result;
  const baselineReplay = env.evaluate(runReport.trainingFrontier.weights, { gateFloor: 0 });
  if (JSON.stringify(baselineReplay) !== JSON.stringify(baseline)) {
    throw new Error('Current safe frontier does not reproduce exactly');
  }

  const fractionsByDirection = {
    'update-1': [0.05, 0.075, 0.15, 0.2, 0.25],
    'update-3': [0.5, 0.7, 0.8, 0.9, 0.95],
  };
  const threshold = baseline.bestProgress + Math.max(10, baseline.bestProgress * 0.01);
  const results = [];
  const saveProgress = () => fs.writeFileSync(path.join(OUTPUT, 'progress.json'), JSON.stringify({
    phase: 'evaluating-learned-fractions', sourceRunReportSha256: hashFile(runReportFile),
    baseline, baselineReplay, safeFrontierThreshold: threshold, results,
  }, null, 2));
  saveProgress();
  for (const [direction, fractions] of Object.entries(fractionsByDirection)) {
    const updateNumber = Number(direction.slice('update-'.length));
    const event = json(path.join(RUN, `update-${String(updateNumber).padStart(2, '0')}.json`));
    const endpoint = event.candidates.find(candidate => candidate.fraction === 1);
    const archivePath = path.join(RUN, event.episodeSummaries[0].privateArchiveFile);
    const episodeText = require('node:zlib').gunzipSync(fs.readFileSync(archivePath)).toString('utf8');
    const behaviorWeights = JSON.parse(episodeText).behaviorWeights;
    if (!endpoint || JSON.stringify(behaviorWeights) !== JSON.stringify(runReport.trainingFrontier.weights)) {
      throw new Error(`${direction} does not originate from the verified unchanged training frontier`);
    }
    for (const fraction of fractions) {
      const weights = behaviorWeights.map((value, index) => value + fraction * (endpoint.weights[index] - value));
      const first = env.evaluate(weights, { gateFloor: 0 });
      const row = { direction, fraction, result: first, safe: safe(first), repeat: null,
        exceedsSafeFrontierThreshold: safe(first) && first.bestProgress > threshold };
      if (row.exceedsSafeFrontierThreshold) {
        row.repeat = env.evaluate(weights, { gateFloor: 0 });
        row.repeatIdentical = JSON.stringify(row.repeat) === JSON.stringify(first);
        row.verifiedSafeFrontierImprovement = row.repeatIdentical && safe(row.repeat)
          && row.repeat.bestProgress > threshold;
      }
      results.push(row);
      saveProgress();
      process.stdout.write('STATEHEAD_FRACTIONAL_LINE_SEARCH ' + JSON.stringify({
        direction, fraction, result: first, safe: row.safe,
        exceedsSafeFrontierThreshold: row.exceedsSafeFrontierThreshold,
        verifiedSafeFrontierImprovement: row.verifiedSafeFrontierImprovement ?? false,
      }) + '\n');
    }
  }

  const saveSha256 = hashFile(SAVE);
  if (saveSha256 !== EXPECTED_SAVE_SHA256) throw new Error('Original user save changed during line search');
  const report = {
    format: 'male-cns-statehead-ppo-fractional-line-search-v1',
    passed: true,
    learningSucceeded: results.some(row => row.verifiedSafeFrontierImprovement),
    trainingFrontierAdvanced: results.some(row => row.verifiedSafeFrontierImprovement),
    approvedForApp: false,
    diagnosticOnly: true,
    sourceRunReportSha256: hashFile(runReportFile),
    gradientDirectionReports: Object.fromEntries(Object.keys(fractionsByDirection).map(key => {
      const number = Number(key.slice('update-'.length));
      return [key, hashFile(path.join(RUN, `update-${String(number).padStart(2, '0')}.json`))];
    })),
    originalSaveSha256: saveSha256,
    baseline,
    baselineReplay,
    safeFrontierThreshold: threshold,
    results,
    cuda: env.stats(),
    sourceHashes: {
      runner: hashFile(__filename),
      environment: hashFile(path.join(__dirname, 'statehead-continuous-ppo-env.cjs')),
      stateHead: hashFile(path.join(__dirname, 'neural-statehead-gate.cjs')),
      motor: hashFile(path.join(__dirname, 'neural-command-residual.cjs')),
    },
    boundary: 'Deterministic full-from-line replay of fractions along two already learned PPO directions. No new training, teacher, route, reward, app logic, save, version, release, or checkpoint promotion. A safe frontier gain is not app approval or a lap.',
  };
  fs.writeFileSync(path.join(OUTPUT, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  process.stdout.write('STATEHEAD_FRACTIONAL_LINE_SEARCH_FINISHED ' + JSON.stringify({
    passed: report.passed, learningSucceeded: report.learningSucceeded,
    trainingFrontierAdvanced: report.trainingFrontierAdvanced,
    threshold, results: results.map(row => ({ direction: row.direction, fraction: row.fraction,
      progress: row.result.bestProgress, laps: row.result.laps, reason: row.result.reason,
      safe: row.safe, verifiedSafeFrontierImprovement: row.verifiedSafeFrontierImprovement ?? false })),
    cuda: report.cuda, report: path.join(OUTPUT, 'report.json'),
  }) + '\n');
} catch (error) {
  const failure = { error: error.stack || String(error) };
  if (!fs.existsSync(OUTPUT)) fs.mkdirSync(OUTPUT, { recursive: false });
  const failureFile = path.join(OUTPUT, 'failure.json');
  if (!fs.existsSync(failureFile)) fs.writeFileSync(failureFile, JSON.stringify(failure, null, 2), { flag: 'wx' });
  throw error;
} finally {
  if (env) Model.closeCuda();
}
