'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { gunzipSync, gzipSync } = require('node:zlib');
const Imitation = require('../desktop/imitation-trial.cjs');

async function main() {
  const [actorFile, genomeFile, destination, refinementReport] = process.argv.slice(2);
  if (!actorFile || !genomeFile || !destination) {
    throw Error('Uso: node work/make-v3-imitation-trial.cjs actor.json.gz genome.json prova.json.gz [ricompense.json]');
  }
  const outputs = path.resolve(__dirname, '../outputs');
  const genomeBytes = await fs.readFile(genomeFile);
  const originalActor = await fs.readFile(actorFile);
  const actor = JSON.parse(gunzipSync(originalActor, {maxOutputLength:8*1024*1024}).toString('utf8'));
  const genomeSha256 = createHash('sha256').update(genomeBytes).digest('hex');
  if (actor.inputGenomeHash !== genomeSha256) throw Error('Il genoma non corrisponde al decoder addestrato.');
  const runtime = await Imitation.runtimeHashes(outputs);
  for (const name of ['vehicle-992.js','rewards.js','data/circuits.json','data/connectome.json']) {
    if (actor.sourceHashes?.['outputs/' + name] !== runtime[name]) throw Error('Il riferimento usato nel training è cambiato: ' + name);
  }
  const trainedCircuits = actor.trainedCircuits ?? ['monza'];
  if (!Array.isArray(trainedCircuits) || trainedCircuits.length !== 1) throw Error('Serve un decoder addestrato su un singolo circuito.');
  const [circuitId] = trainedCircuits;
  let actuatorRefinement;
  if (refinementReport) {
    const report = JSON.parse(await fs.readFile(refinementReport, 'utf8'));
    const actorHash = createHash('sha256').update(originalActor).digest('hex');
    if (report.format !== 'male-cns-neural-actuator-reward-mutation-v1' || report.circuit !== circuitId ||
        report.actorSha256 !== actorHash || !report.transfers || !report.elite?.parameters) {
      throw Error('Rapporto di affinamento incompatibile con questo decoder V3.');
    }
    const {steeringScale, pedalScale, accelerationBias} = report.elite.parameters;
    actuatorRefinement = {steeringScale, pedalScale, accelerationBias};
  }
  const { format, featureCount, featureLayout, center, scale, layers } = actor;
  const bundle = {
    format: Imitation.FORMAT, circuitId, runtimeHashes: runtime,
    actor: {format, featureCount, featureLayout, center, scale, layers, ...(actuatorRefinement?{actuatorRefinement}:{})},
    genome: JSON.parse(genomeBytes.toString('utf8')),
  };
  await fs.writeFile(destination, gzipSync(JSON.stringify(bundle), {level:5}), {flag:'wx'});
  const verified = await Imitation.load(destination, outputs);
  console.log(JSON.stringify({ sha256: verified.sha256, file: path.resolve(destination) }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
