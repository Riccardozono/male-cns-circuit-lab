'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Coordinator } = require('./neural-native-coordinator.cjs');
const Save = require('./neural-native-save.cjs');

const root = path.resolve(__dirname, '..');
const directory = path.join(root, '.impeccable/review/neural-sacl/native-training-followup-20261023-01');
const modelFile = path.join(root, '.impeccable/review/neural-sacl/diversity-native-model/model.malecns-neural-diversity.json');
const bootstrapFile = path.join(root, '.impeccable/review/neural-sacl/native-training/bootstrap.json');
const generationLimit = 3;
const coordinator = new Coordinator({ modelFile, bootstrapFile, population: 4, mutation: .16, speedMultiplier: 30, workers: 4 });
let failure = null;
coordinator.on('error', error => { failure = error; });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');

async function main() {
  if (fs.existsSync(directory)) throw Error('Preserve existing follow-up output');
  fs.mkdirSync(directory, { recursive: true });
  const modelText = fs.readFileSync(modelFile, 'utf8');
  const bootstrap = JSON.parse(fs.readFileSync(bootstrapFile, 'utf8'));
  const modelSha256 = sha256(modelText);
  const bootstrapChampion = bootstrap.champion;
  const startedAt = new Date().toISOString();
  try {
    const initial = await coordinator.start();
    if (initial.cars.length !== 4 || initial.cars.some(car => car.lifetime !== 0 || car.bestProgress !== 0) || initial.running || initial.generation !== 1) {
      throw Error('Expected four real paused agents at the line');
    }
    console.log('NATIVE_FOLLOWUP_STARTED ' + JSON.stringify({
      modelSha256,
      bootstrapProgress: bootstrapChampion.progress,
      bootstrapLaps: bootstrapChampion.laps,
      agents: initial.cars.length,
      generation: initial.generation,
      speedMultiplier: initial.speedMultiplier,
      mutation: initial.mutation
    }));

    await coordinator.pause(true);
    const deadline = Date.now() + 600000;
    let announced = 0;
    while (coordinator.history.length < generationLimit) {
      if (failure) throw failure;
      if (Date.now() >= deadline) throw Error('Timed out waiting for three complete generations');
      if (coordinator.history.length > announced) {
        announced = coordinator.history.length;
        const generation = coordinator.history.at(-1);
        console.log('NATIVE_FOLLOWUP_GENERATION ' + JSON.stringify(generation));
      }
      await delay(100);
    }

    await coordinator.pause(false);
    const final = coordinator.snapshot();
    if (failure) throw failure;
    const state = Save.validateState(await coordinator.exportState());
    if (state.updates !== generationLimit || state.generation !== generationLimit + 1 || state.completedEpisodes !== generationLimit * 4) {
      throw Error('Private checkpoint does not contain exactly three complete four-agent generations');
    }
    const encoded = Save.encode(modelText, state);
    const checkpointPath = path.join(directory, 'checkpoint.malecns-private-native-learning-save');
    fs.writeFileSync(checkpointPath, encoded, { flag: 'wx' });

    const history = state.history.map(entry => ({
      generation: entry.generation,
      bestFitness: entry.best,
      meanFitness: entry.mean,
      furthestProgressM: entry.bestProgress,
      meanProgressM: entry.meanProgress,
      maxAgentLaps: entry.maxLaps,
      selectedAgentLaps: entry.laps,
      bestLapTimeSeconds: entry.bestLapTime,
      elapsedSimulationSeconds: entry.elapsed,
      completedEpisodes: entry.actualEpisodes,
      rewardRevision: entry.rewardRevision
    }));
    const maxAgentLaps = Math.max(...history.map(entry => entry.maxAgentLaps));
    const report = {
      startedAt,
      finishedAt: new Date().toISOString(),
      appVersion: '5.6.0 (research only; no release/version change)',
      modelSha256,
      engineIdentity: Save.identity(),
      bootstrap: {
        source: 'native-training/bootstrap.json',
        progressM: bootstrapChampion.progress,
        laps: bootstrapChampion.laps,
        objective: 'continue the existing isolated neuronal-diversity decoder experiment; not the user gen64 save'
      },
      configuration: { population: 4, workers: 4, generations: generationLimit, mutation: .16, speedMultiplier: 30 },
      initialAgentsAtLine: initial.cars.length,
      generationsCompleted: history.length,
      episodesCompleted: state.completedEpisodes,
      history,
      terminal: {
        generation: final.generation,
        paused: !final.running,
        archiveCells: state.archive.cells.length,
        championProgressM: state.archive.champion.progress,
        championLaps: state.archive.champion.laps,
        championReason: state.archive.champion.reason,
        maxAgentLaps,
        atLeastOneLapAchieved: maxAgentLaps >= 1,
        twoLapObjectiveAchieved: maxAgentLaps >= 2,
        learningSucceeded: maxAgentLaps >= 2
      },
      checkpoint: {
        file: path.basename(checkpointPath),
        bytes: Buffer.byteLength(encoded),
        sha256: sha256(encoded),
        privateFormat: true,
        normalSaveCompatible: false
      },
      boundary: 'Three actual full generations, four from-line native workers each, then saved optimizer/archive state in a private experimental checkpoint. No user save, normal app files, release artifacts, or version were changed. Metrics do not prove generalized convergence.'
    };
    const reportPath = path.join(directory, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' });
    console.log('NATIVE_FOLLOWUP_DONE ' + JSON.stringify(report));
  } finally {
    await coordinator.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
