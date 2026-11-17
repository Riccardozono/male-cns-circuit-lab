'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { gunzipSync, gzipSync } = require('node:zlib');
const Imitation = require('../desktop/imitation-trial.cjs');

async function main() {
  const [actorFile, genomeFile, destination] = process.argv.slice(2);
  if (!actorFile || !genomeFile || !destination) {
    throw Error('Uso: node work/make-v3-imitation-trial.cjs actor.json.gz genome.json prova.json.gz');
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
  const { format, featureCount, featureLayout, center, scale, layers } = actor;
  const bundle = {
    format: Imitation.FORMAT, circuitId: 'monza', runtimeHashes: runtime,
    actor: {format, featureCount, featureLayout, center, scale, layers},
    genome: JSON.parse(genomeBytes.toString('utf8')),
  };
  await fs.writeFile(destination, gzipSync(JSON.stringify(bundle), {level:5}), {flag:'wx'});
  const verified = await Imitation.load(destination, outputs);
  console.log(JSON.stringify({ sha256: verified.sha256, file: path.resolve(destination) }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
