'use strict';

// Deterministic cross-product benchmark: every model is evaluated on every
// circuit until at least one agent completes one lap. The high generation cap
// is a safety guard against an unbounded process, not a simulation time limit.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const F = require('../outputs/simulation.js');
const Legacy = require('../outputs/legacy-models.js');

const ROOT = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'outputs');
const catalog = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'data', 'circuits.json'), 'utf8'));
const source = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'data', 'connectome.json'), 'utf8'));
const fullMetadata = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'data', 'connectome-full.json'), 'utf8'));
const constructors = {float64: Float64Array, float32: Float32Array, int32: Int32Array, uint32: Uint32Array, uint8: Uint8Array, int8: Int8Array};
const MODEL_IDS = ['v2', 'v3', 'v4'];
const CIRCUIT_IDS = ['lab', ...catalog.circuits.map(circuit => circuit.id)];

function readArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function numberArg(name, fallback, min, max) {
  const value = Number(readArg(name, fallback));
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback));
}

const config = {
  seed: Math.round(numberArg('seed', 7717, 0, 0x7fffffff)),
  population: Math.round(numberArg('population', 16, 1, F.MAX_POPULATION)),
  mutation: numberArg('mutation', .16, 0, F.EVOLUTION_RULES.mutationCeiling),
  // 0 means automatic: long circuits receive a longer episode so a surviving
  // cautious controller is not discarded at an arbitrary 60 simulated
  // seconds. A caller can still provide an exact tick budget for comparisons.
  evaluationTicks: Math.round(numberArg('evaluation-ticks', 0, 0, 120000)),
  minimumEpisodeSeconds: 60,
  targetSurvivalSpeed: 8,
  maxGenerations: Math.round(numberArg('max-generations', 100, 1, 1000)),
  learningEnabled: !process.argv.includes('--legacy-adapter')
};

const requestedModels = String(readArg('model', 'all')).split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
const requestedCircuits = String(readArg('circuit', 'all')).split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
const appendReport = process.argv.includes('--append');
const reportOnly = process.argv.includes('--report-only');
let reportConfiguration = config;
const runModels = requestedModels.includes('all') ? MODEL_IDS : MODEL_IDS.filter(modelId => requestedModels.includes(modelId));
const runCircuits = requestedCircuits.includes('all') ? CIRCUIT_IDS : CIRCUIT_IDS.filter(circuitId => requestedCircuits.includes(circuitId));
if (!runModels.length) throw new Error(`Nessun modello valido. Valori ammessi: ${MODEL_IDS.join(', ')}`);
if (!runCircuits.length) throw new Error(`Nessun circuito valido. Valori ammessi: ${CIRCUIT_IDS.join(', ')}`);

function loadFullData() {
  const bytes = fs.readFileSync(path.join(OUTPUT_DIR, 'data', fullMetadata.binary));
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== fullMetadata.binaryBytes || hash !== fullMetadata.binarySha256) {
    throw new Error(`Bundle V4 non valido: ${bytes.length} byte / SHA ${hash}`);
  }
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const data = {...fullMetadata, compact: true};
  for (const [name, descriptor] of Object.entries(fullMetadata.arrays)) {
    const Constructor = constructors[descriptor.dtype];
    if (!Constructor) throw new Error(`Tipo array non supportato nel bundle V4: ${descriptor.dtype}`);
    data[name] = new Constructor(buffer, descriptor.offset, descriptor.length);
  }
  return data;
}

const modelData = {
  v2: Legacy.buildV2(source),
  v3: Legacy.tagV3(source),
  v4: loadFullData()
};

function modelLabel(modelId, graph) {
  return graph.modelLabel || ({v2: 'MaleCNS V2 compatto ricostruito', v3: 'MaleCNS V3 storico', v4: 'MaleCNS V4 completo'}[modelId] || modelId);
}

function rounded(value) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : null;
}

function automaticEvaluationTicks(sim) {
  const lapSecondsAtTargetSpeed=sim.track.total/Math.max(1,config.targetSurvivalSpeed);
  return Math.ceil(Math.max(config.minimumEpisodeSeconds,lapSecondsAtTargetSpeed*1.15)/F.DT);
}

function evaluateGeneration(sim) {
  const generation = sim.generation;
  const evaluationTicks=config.evaluationTicks||automaticEvaluationTicks(sim);
  let ticks=0,lapDetected=false;
  for (; ticks < evaluationTicks && sim.generation === generation; ticks++) {
    sim.tick();
    if (sim.cars.some(car => car.laps > 0)) {lapDetected=true;break;}
  }
  if (sim.generation === generation) sim.evolve();
  return {entry:sim.history.at(-1),evaluationTicks,ticks,lapDetected};
}

function runCase(modelId, circuitId, sim) {
  sim.setCircuit(circuitId);
  const graph = sim.graph;
  const started = Date.now();
  let firstLap = null;
  let last = null;
  let lastEvaluation = null;

  for (let generation = 1; generation <= config.maxGenerations; generation++) {
    const evaluation=evaluateGeneration(sim);
    lastEvaluation=evaluation;
    last=evaluation.entry;
    const completedAgentCount = sim.population - Number(last.noLapCount || 0);
    const line = {
      model: modelId,
      circuit: circuitId,
      generation: last.generation,
      best: rounded(last.best),
      bestProgress: rounded(last.bestProgress),
      completedAgentCount,
      fastestLap: rounded(last.bestLapTime),
      stagnation: last.stagnation
    };
    console.log('BENCHMARK_GENERATION ' + JSON.stringify(line));
    if (completedAgentCount > 0) {
      firstLap = {
        generation: last.generation,
        completedAgentCount,
        best: rounded(last.best),
        bestProgress: rounded(last.bestProgress),
        fastestLap: rounded(last.bestLapTime)
      };
      break;
    }
  }

  const result = {
    modelId,
    modelLabel: modelLabel(modelId, graph),
    circuitId,
    circuitName: sim.circuit.name,
    nodes: graph.n,
    edges: graph.edgeCount,
    fullGraph: Boolean(graph.full),
    adapter: sim.learningEnabled ? 'reward-trained recurrent MaleCNS policy; no driving assistance' : 'legacy DNa readout',
    learning: sim.learningEnabled ? {neurons: graph.learning.nodes.length, parameters:graph.learning.length, warmStart:false, stats:sim.optimizer.metrics()} : null,
      population: config.population,
      mutation: config.mutation,
      evaluationTicks: lastEvaluation?.evaluationTicks ?? automaticEvaluationTicks(sim),
      evaluationTicksUsed: lastEvaluation?.ticks ?? 0,
      lapDetectedDuringEvaluation: Boolean(lastEvaluation?.lapDetected),
    maxGenerations: config.maxGenerations,
    firstLapGeneration: firstLap?.generation ?? null,
    completedAgentCountAtFirstLap: firstLap?.completedAgentCount ?? 0,
    firstLapBestScore: firstLap?.best ?? null,
    firstLapBestProgress: firstLap?.bestProgress ?? null,
    firstLapTime: firstLap?.fastestLap ?? null,
    reachedOneLap: Boolean(firstLap),
    generationsEvaluated: last?.generation ?? 0,
    finalBest: rounded(last?.best),
    finalBestProgress: rounded(last?.bestProgress),
    finalStagnation: last?.stagnation ?? null,
    wallTimeSeconds: Number(((Date.now() - started) / 1000).toFixed(3))
  };
  console.log('BENCHMARK_RESULT ' + JSON.stringify(result));
  return result;
}

function writeReports(results) {
  const completed = results.filter(result => result.reachedOneLap).length;
  const reportModels = [...new Set(results.map(result => result.modelId))];
  const reportCircuits = [...new Set(results.map(result => result.circuitId))];
  const scopeModels = appendReport ? MODEL_IDS : runModels;
  const scopeCircuits = appendReport ? CIRCUIT_IDS : runCircuits;
  const expectedCases = scopeModels.length * scopeCircuits.length;
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    benchmarkMode: 'headless recurrent MaleCNS policy, trained through reward-ranked evolution strategies; V4 uses sparse CPU rather than desktop WebGPU',
    sourceSha256: Object.fromEntries(['simulation.js','neural-learning.js'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(OUTPUT_DIR,file))).digest('hex')])),
    stoppingRule: 'stop each model/circuit case after the first agent completes at least one lap',
    safetyGuard: 'maxGenerations is a benchmark guard only; the simulation has no global simulated-time limit',
    configuration: reportConfiguration,
    scope: {models: scopeModels, circuits: scopeCircuits},
    models: reportModels,
    circuits: reportCircuits,
    summary: {totalCases: expectedCases, measuredCases: results.length, completedCases: completed, pendingCases: expectedCases - completed, notRunCases: Math.max(0, expectedCases - results.length)},
    results
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'benchmark-all-results.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  const rows = results.map(result => `| ${result.modelId.toUpperCase()} | ${result.circuitName} | ${result.reachedOneLap ? 'sì' : 'no'} | ${result.firstLapGeneration ?? '—'} | ${result.firstLapTime ?? '—'} | ${result.generationsEvaluated} | ${result.wallTimeSeconds}s |`).join('\n');
  const markdown = [
    '# Benchmark modelli × circuiti',
    '',
    `Generato: ${report.generatedAt}`,
    '',
    'Ogni caso si ferma quando almeno un agente completa un giro. `maxGenerations` è solo una protezione contro un processo infinito; non è un limite globale di tempo della simulazione.',
    '',
    `Adattatore: ${reportConfiguration.learningEnabled ? 'policy appresa per ricompense sull’attività ricorrente MaleCNS, partenza casuale e nessuna assistenza di guida' : 'readout DNa storico'}. Nessuna coordinata, mezzeria o traiettoria di riferimento entra nella policy.`,
    '',
    `Configurazione dell’ultima passata: popolazione ${reportConfiguration.population}, mutazione ${(reportConfiguration.mutation * 100).toFixed(1)}%, budget automatico proporzionale alla pista (target sopravvivenza ${reportConfiguration.targetSurvivalSpeed.toFixed(1)} px/s, minimo ${reportConfiguration.minimumEpisodeSeconds} s simulati)${reportConfiguration.evaluationTicks ? `, oppure ${reportConfiguration.evaluationTicks} tick espliciti` : ''}, massimo ${reportConfiguration.maxGenerations} generazioni, seed ${reportConfiguration.seed}. Ogni riga conserva i propri parametri effettivi.`,
    '',
    `Risultato: ${completed}/${expectedCases} combinazioni hanno raggiunto almeno un giro; ${results.length}/${expectedCases} sono state misurate in questa tabella e ${Math.max(0,expectedCases-results.length)} non sono ancora state eseguite.`,
    '',
    '| Modello | Circuito | 1 giro | Generazione | Miglior tempo | Generazioni | Tempo reale |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    rows || '| — | — | — | — | — | — | — |',
    '',
    'Il benchmark è headless: V4 usa il percorso sparse CPU di `simulation.js`. Non va interpretato come misura del throughput WebGPU della build Electron.'
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(OUTPUT_DIR, 'benchmark-all-results.md'), markdown, 'utf8');
}

let results = [];
if (appendReport) {
  try {
    const previous = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'benchmark-all-results.json'), 'utf8'));
    if (Array.isArray(previous.results)) results = previous.results.filter(result => result && result.modelId && result.circuitId);
    if (reportOnly && previous.configuration) reportConfiguration = previous.configuration;
  } catch {
    results = [];
  }
}
if (reportOnly) {
  writeReports(results);
  console.log('BENCHMARK_REPORT ' + JSON.stringify({measuredCases: results.length, report: 'outputs/benchmark-all-results.json'}));
  process.exit(0);
}
for (const modelId of runModels) {
  const sim = new F.Simulation(modelData[modelId], {
    modelId,
    circuits: catalog,
    circuitId: CIRCUIT_IDS[0],
    population: config.population,
    mutation: config.mutation,
    learningEnabled: config.learningEnabled,
    seed: config.seed
  });
  for (const circuitId of runCircuits) {
    const result=runCase(modelId, circuitId, sim),existingIndex=results.findIndex(item=>item.modelId===result.modelId&&item.circuitId===result.circuitId);
    if(existingIndex>=0)results[existingIndex]=result;else results.push(result);
    writeReports(results);
  }
}

const completed = results.filter(result => result.reachedOneLap).length;
const totalCases=appendReport?MODEL_IDS.length*CIRCUIT_IDS.length:results.length;
console.log('BENCHMARK_ALL ' + JSON.stringify({completedCases: completed, measuredCases: results.length, totalCases, report: 'outputs/benchmark-all-results.json'}));
