'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const {app, BrowserWindow, ipcMain, protocol, dialog} = require('electron');
const {DesktopEngine} = require('./engine.cjs');
const {ProgressFiles}=require('./progress-files.cjs');
const Progress=require('../outputs/progress-save.js');

// Configure Chromium before registering the local protocol or creating any
// window, so the GPU process inherits the Windows adapter choice.
const forceCpuFallback = process.env.MALE_CNS_FORCE_CPU_FALLBACK === '1';
if (forceCpuFallback) {
  app.commandLine.appendSwitch('disable-gpu');
} else {
  app.commandLine.appendSwitch('force_high_performance_gpu');
  app.commandLine.appendSwitch('enable-unsafe-webgpu');
}
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

protocol.registerSchemesAsPrivileged([{
  scheme: 'male-cns',
  privileges: {standard: true, secure: true, supportFetchAPI: true, corsEnabled: true}
}]);

let mainWindow = null;
let engine = null;
let testEngine=null;
let testReportDialog=dialog;
let progressFiles=null;
const progressSmoke=process.argv.includes('--progress-smoke');
const selectionSmoke=process.argv.includes('--selection-smoke');
const metricSmoke=process.argv.includes('--metric-smoke');
const rewardsSmoke=process.argv.includes('--rewards-smoke');
const modelBenchmark=process.argv.includes('--model-benchmark');
const modelTestSmoke=process.argv.includes('--model-test-smoke');
const learningSmoke = process.argv.includes('--learning-test');
const uiSmoke = process.argv.includes('--ui-smoke');
const trainingCopySmoke=process.argv.includes('--training-copy-smoke');
const trainingCopyV3=process.argv.includes('--male-cns-training-copy-v3');
const trainingCopyV3Baseline=process.argv.includes('--male-cns-training-copy-v3-baseline');
const trainingCopyV3Current=process.argv.includes('--male-cns-training-copy-v3-current');
const trainingCopyProfile=trainingCopyV3||trainingCopyV3Baseline||trainingCopyV3Current;
const trainingCopyProgressArg=process.argv.find(argument=>argument.startsWith('--training-copy-progress='));
const trainingCopyLearningSmoke=process.argv.includes('--training-copy-learning-smoke');
const trackSmoke = process.argv.includes('--track-smoke');
const performanceSmoke=process.argv.includes('--performance-test');
const physicsSmoke=process.argv.includes('--physics-smoke');
const carVisualSmoke=process.argv.includes('--car-visual-smoke');
const learningGenerationsArg=process.argv.find(argument=>argument.startsWith('--learning-generations='));
const learningGenerations=learningGenerationsArg?Math.max(2,Math.min(100,Number(learningGenerationsArg.split('=')[1])||2)):2;
const allBenchmark = process.argv.includes('--benchmark-all');
const benchmarkModelsArg = process.argv.find(argument => argument.startsWith('--benchmark-models='));
const benchmarkCircuitsArg = process.argv.find(argument => argument.startsWith('--benchmark-circuits='));
const benchmarkTimeoutArg = process.argv.find(argument => argument.startsWith('--benchmark-timeout-ms='));
const benchmarkOutputArg = process.argv.find(argument => argument.startsWith('--benchmark-output-dir='));
const benchmarkModels = benchmarkModelsArg ? benchmarkModelsArg.slice('--benchmark-models='.length).split(',').map(value => value.trim()).filter(Boolean) : ['v2', 'v3', 'v4', 'v5'];
const benchmarkCircuits = benchmarkCircuitsArg ? benchmarkCircuitsArg.slice('--benchmark-circuits='.length).split(',').map(value => value.trim()).filter(Boolean) : ['lab', 'monza', 'monaco', 'le-mans'];
const benchmarkTimeoutMs = benchmarkTimeoutArg ? Math.max(10000, Math.min(900000, Number(benchmarkTimeoutArg.slice('--benchmark-timeout-ms='.length)) || 180000)) : 180000;

function outputsDirectory() {
  return path.join(app.getAppPath(), 'outputs');
}

function mimeType(file) {
  const extension = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.glb': 'model/gltf-binary',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.bin': 'application/octet-stream',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf'
  })[extension] || 'application/octet-stream';
}

async function serveLocalAsset(request) {
  const root = outputsDirectory();
  const url = new URL(request.url);
  const requested = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(root, requested);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Not found', {status: 404});
  try {
    const body = await fs.readFile(file);
    return new Response(body, {headers: {'content-type': mimeType(file)}});
  } catch {
    return new Response('Not found', {status: 404});
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: (modelTestSmoke||uiSmoke||trainingCopySmoke||trainingCopyLearningSmoke||trackSmoke||performanceSmoke||physicsSmoke||carVisualSmoke||progressSmoke||selectionSmoke||metricSmoke||rewardsSmoke) ? 300 : 1080,
    minHeight: (modelTestSmoke||uiSmoke||trainingCopySmoke||trainingCopyLearningSmoke||trackSmoke||performanceSmoke||physicsSmoke||carVisualSmoke||progressSmoke||selectionSmoke||metricSmoke||rewardsSmoke) ? 300 : 720,
    backgroundColor: '#0b1118',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });
  mainWindow.once('ready-to-show', () => {if (!modelTestSmoke&&!allBenchmark&&!modelBenchmark&&!learningSmoke&&!uiSmoke&&!trainingCopySmoke&&!trainingCopyLearningSmoke&&!trackSmoke&&!performanceSmoke&&!physicsSmoke&&!carVisualSmoke&&!progressSmoke&&!selectionSmoke&&!metricSmoke&&!rewardsSmoke&&!process.argv.includes('--smoke-test')) mainWindow.show();});
  mainWindow.on('closed', () => {mainWindow = null;});
  if(uiSmoke||trainingCopySmoke)mainWindow.webContents.on('console-message',details=>{if(details.level==='error'||details.level===3)console.error('UI_BOOT '+details.message);});
  const trainingCopyVariant=trainingCopyV3?'verified-v3-wide':trainingCopyV3Baseline?'verified-v3-baseline':'verified-v3-current';
  mainWindow.loadURL(trainingCopyProfile?'male-cns://app/index.html?training-copy='+trainingCopyVariant:'male-cns://app/index.html');
  if(modelTestSmoke){
    const output=path.resolve(process.argv.find(a=>a.startsWith('--model-test-output-dir='))?.slice('--model-test-output-dir='.length)||path.join(app.getPath('temp'),'male-cns-model-test-'+app.getVersion()));
    const harness=require('./model-test-smoke.cjs');testReportDialog=harness.reportDialog(output);
    mainWindow.webContents.once('did-finish-load',()=>harness.run(mainWindow,{output,engine,version:app.getVersion(),forceCpuFallback,capture:process.argv.includes('--model-test-capture')}).then(result=>app.exit(result.passed?0:1)).catch(async error=>{console.error(error);await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'model-test-error.json'),JSON.stringify({error:error.stack||error.message,generatedAt:new Date().toISOString()},null,2));app.exit(1);}));
  }
  if(progressSmoke){
    const arg=prefix=>process.argv.find(a=>a.startsWith(prefix))?.slice(prefix.length);
    const output=path.resolve(arg('--progress-output-dir=')||path.join(app.getPath('temp'),'male-cns-progress-'+app.getVersion()));
    const harness=require('./progress-smoke.cjs');
    progressFiles=new ProgressFiles({engine,dialog:harness.dialogs(output),window:mainWindow,version:app.getVersion()});
    mainWindow.webContents.once('did-finish-load',()=>harness.run(mainWindow,{output,engine,version:app.getVersion(),forceCpuFallback,capture:process.argv.includes('--progress-capture')}).then(result=>app.exit(result.passed?0:1)).catch(async error=>{console.error(error);await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'progress-error.json'),JSON.stringify({error:error.stack||error.message,version:app.getVersion(),generatedAt:new Date().toISOString()},null,2));app.exit(1);}));
  }else progressFiles=new ProgressFiles({engine,dialog,window:mainWindow,version:app.getVersion()});
  if(selectionSmoke){
    const arg=prefix=>process.argv.find(a=>a.startsWith(prefix))?.slice(prefix.length);
    const output=path.resolve(arg('--selection-output-dir=')||path.join(app.getPath('temp'),'male-cns-selection-'+app.getVersion()));
    mainWindow.webContents.once('did-finish-load',()=>require('./selection-smoke.cjs').run(mainWindow,{output,engine,version:app.getVersion(),forceCpuFallback,capture:process.argv.includes('--selection-capture')}).then(result=>app.exit(result.passed?0:1)).catch(async error=>{console.error(error);await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'selection-error.json'),JSON.stringify({error:error.stack||error.message,version:app.getVersion(),generatedAt:new Date().toISOString()},null,2));app.exit(1);}));
  }
  if(metricSmoke){
    const arg=prefix=>process.argv.find(a=>a.startsWith(prefix))?.slice(prefix.length);
    const output=path.resolve(arg('--metric-output-dir=')||path.join(app.getPath('temp'),'male-cns-metric-'+app.getVersion()));
    mainWindow.webContents.once('did-finish-load',()=>require('./metric-smoke.cjs').run(mainWindow,{output,version:app.getVersion(),forceCpuFallback,capture:process.argv.includes('--metric-capture')}).then(result=>app.exit(result.passed?0:1)).catch(async error=>{console.error(error);await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'metric-error.json'),JSON.stringify({error:error.stack||error.message,version:app.getVersion(),generatedAt:new Date().toISOString()},null,2));app.exit(1);}));
  }
  if(rewardsSmoke){
    const arg=prefix=>process.argv.find(a=>a.startsWith(prefix))?.slice(prefix.length);
    const output=path.resolve(arg('--rewards-output-dir=')||path.join(app.getPath('temp'),'male-cns-rewards-'+app.getVersion()));
    const harness=process.argv.includes('--model-comparison-smoke')?'./model-comparison-smoke.cjs':'./rewards-smoke.cjs';
    mainWindow.webContents.once('did-finish-load',()=>require(harness).run(mainWindow,{output,engine,version:app.getVersion(),forceCpuFallback,capture:process.argv.includes('--rewards-capture')}).then(result=>app.exit(result.passed?0:1)).catch(async error=>{console.error(error);await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'rewards-error.json'),JSON.stringify({error:error.stack||error.message,version:app.getVersion(),generatedAt:new Date().toISOString()},null,2));app.exit(1);}));
  }
  if(modelBenchmark){
    const arg=prefix=>process.argv.find(a=>a.startsWith(prefix))?.slice(prefix.length);
    const output=path.resolve(arg('--model-output-dir=')||path.join(app.getPath('temp'),'male-cns-model-'+app.getVersion()));
    mainWindow.webContents.once('did-finish-load',()=>require('./model-benchmark.cjs').run(mainWindow,{output,version:app.getVersion(),forceCpuFallback}).then(result=>app.exit(result.passed?0:1)).catch(async error=>{console.error(error);await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'model-error.json'),JSON.stringify({error:error.stack||error.message,version:app.getVersion(),generatedAt:new Date().toISOString()},null,2));app.exit(1);}));
  }
  if(carVisualSmoke){
    mainWindow.webContents.once('did-finish-load',()=>{
      const arg=prefix=>process.argv.find(a=>a.startsWith(prefix))?.slice(prefix.length);
      const output=path.resolve(arg('--car-visual-output-dir=')||path.join(app.getPath('temp'),'male-cns-car-visual-'+app.getVersion()));
      require('./car-visual-smoke.cjs').run(mainWindow,{output,version:app.getVersion(),forceCpuFallback,capture:process.argv.includes('--car-visual-capture')}).then(result=>app.exit(result.passed?0:1)).catch(async error=>{console.error(error);await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'car-visual-error.json'),JSON.stringify({error:error.stack||error.message,version:app.getVersion(),generatedAt:new Date().toISOString()},null,2));app.exit(1);});
    });
  }
  if(physicsSmoke){
    mainWindow.webContents.once('did-finish-load',()=>{
      const arg=prefix=>process.argv.find(a=>a.startsWith(prefix))?.slice(prefix.length);
      const output=path.resolve(arg('--physics-output-dir=')||path.join(app.getPath('temp'),'male-cns-physics-'+app.getVersion()));
      require('./physics-smoke.cjs').run(mainWindow,{output,version:app.getVersion(),forceCpuFallback,capture:process.argv.includes('--physics-capture')}).then(result=>app.exit(result.passed?0:1)).catch(async error=>{console.error(error);await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'physics-error.json'),JSON.stringify({error:error.stack||error.message,version:app.getVersion(),generatedAt:new Date().toISOString()},null,2));app.exit(1);});
    });
  }
  if(performanceSmoke){
    mainWindow.webContents.once('did-finish-load',()=>{
      const arg=prefix=>process.argv.find(a=>a.startsWith(prefix))?.slice(prefix.length);
      const output=path.resolve(arg('--performance-output-dir=')||path.join(app.getPath('temp'),'male-cns-performance-'+app.getVersion()));
      require('./performance-smoke.cjs').run(mainWindow,{output,version:app.getVersion(),baselineRuntime:arg('--baseline-runtime='),forceCpuFallback,capture:process.argv.includes('--performance-capture')}).then(result=>app.exit(result.passed?0:1)).catch(async error=>{console.error(error);await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'performance-error.json'),JSON.stringify({error:error.stack||error.message,version:app.getVersion(),generatedAt:new Date().toISOString()},null,2));app.exit(1);});
    });
  }
  if (trackSmoke) {
    mainWindow.webContents.once('did-finish-load',()=>{
      const outputArg=process.argv.find(argument=>argument.startsWith('--track-output-dir='));
      const output=outputArg?path.resolve(outputArg.slice('--track-output-dir='.length)):path.join(app.getPath('temp'),'male-cns-tracks-'+app.getVersion());
      require('./track-smoke.cjs').run(mainWindow,{output,version:app.getVersion()}).then(result=>app.exit(result.passed?0:1)).catch(error=>{console.error(error);app.exit(1);});
    });
  }
  if (uiSmoke) {
    mainWindow.webContents.once('did-finish-load', () => {
      const outputArg=process.argv.find(argument=>argument.startsWith('--ui-output-dir='));
      const output=outputArg?path.resolve(outputArg.slice('--ui-output-dir='.length)):path.join(app.getPath('temp'),'male-cns-ui-'+app.getVersion());
      const harness=process.argv.includes('--ui-redesign-smoke')?'./ui-redesign-smoke.cjs':process.argv.includes('--circuit-3d-smoke')?'./circuit-3d-smoke.cjs':'./ui-smoke.cjs';
      require(harness).run(mainWindow,{output,engine,version:app.getVersion(),forceCpuFallback,capture:process.argv.includes('--capture')}).then(result=>app.exit(result.passed?0:1)).catch(async error=>{console.error(error);await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'ui-error.json'),JSON.stringify({error:error.stack||String(error)},null,2));app.exit(1);});
    });
  }
  if(trainingCopySmoke){
    mainWindow.webContents.once('did-finish-load',()=>{
      const outputArg=process.argv.find(argument=>argument.startsWith('--training-copy-output-dir='));
      const output=outputArg?path.resolve(outputArg.slice('--training-copy-output-dir='.length)):path.join(app.getPath('temp'),'male-cns-training-copy-'+app.getVersion());
      require('./training-copy-smoke.cjs').run(mainWindow,{output,version:app.getVersion(),expectMigrated:Boolean(trainingCopyProgressArg),wide:trainingCopyV3,sensorMode:trainingCopyV3Current?'current':'legacy'}).then(result=>app.exit(result.passed?0:1)).catch(async error=>{
        console.error(error);await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'training-copy-error.json'),JSON.stringify({error:error.stack||String(error),version:app.getVersion()},null,2));app.exit(1);
      });
    });
  }
  if(trainingCopyLearningSmoke){
    mainWindow.webContents.once('did-finish-load',()=>{
      const outputArg=process.argv.find(argument=>argument.startsWith('--training-copy-learning-output-dir='));
      const output=outputArg?path.resolve(outputArg.slice('--training-copy-learning-output-dir='.length)):path.join(app.getPath('temp'),'male-cns-training-copy-learning-'+app.getVersion());
      require('./training-copy-learning-smoke.cjs').run(mainWindow,{output,engine,version:app.getVersion(),expectedGenerations:3,wide:trainingCopyV3}).then(result=>app.exit(result.passed?0:1)).catch(async error=>{
        console.error(error);await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'learning-error.json'),JSON.stringify({error:error.stack||error.message,version:app.getVersion()},null,2));app.exit(1);
      });
    });
  }
  if (allBenchmark) {
    const benchmarkOutputDir = benchmarkOutputArg ? path.resolve(benchmarkOutputArg.slice('--benchmark-output-dir='.length)) : app.getPath('temp');
    const benchmarkProgressPath = path.join(benchmarkOutputDir, 'male-cns-all-benchmark-progress.json');
    const benchmarkReportPath = path.join(benchmarkOutputDir, 'male-cns-all-benchmark.json');
    const benchmarkResults = [];
    let activeBenchmarkCase = null;
    let benchmarkCheckpointQueue = Promise.resolve();
    const queueBenchmarkCheckpoint = (status = 'running', error = null, finalResult = null) => {
      const results = finalResult?.results || benchmarkResults;
      const report = {
        ...(finalResult || {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          benchmarkMode: 'Electron DesktopEngine + WebGPU/CPU fallback',
          stoppingRule: 'stop each model/circuit case after the first agent completes at least one lap',
          safetyGuard: `${benchmarkTimeoutMs / 1000} seconds wall time per case; not a simulated-time limit`,
          configuration: {models: benchmarkModels, circuits: benchmarkCircuits, population: 16, mutation: .16, seed: 7717, speedMultiplier: 30, caseTimeoutMs: benchmarkTimeoutMs},
          results
        }),
        status,
        updatedAt: new Date().toISOString(),
        activeCase: status === 'completed' ? null : activeBenchmarkCase,
        summary: {
          totalCases: benchmarkModels.length * benchmarkCircuits.length,
          completedCases: results.length,
          lapCases: results.filter(result => result.reachedOneLap).length,
          pendingCases: Math.max(0, benchmarkModels.length * benchmarkCircuits.length - results.length)
        }
      };
      if (error) report.error = String(error.stack || error.message || error);
      const serialized = JSON.stringify(report, null, 2);
      benchmarkCheckpointQueue = benchmarkCheckpointQueue.catch(() => {}).then(async () => {
        await fs.mkdir(benchmarkOutputDir, {recursive: true});
        await fs.writeFile(benchmarkProgressPath, serialized, 'utf8');
      }).catch(writeError => console.error('DESKTOP_BENCHMARK_CHECKPOINT_ERROR ' + (writeError.stack || writeError.message)));
      return benchmarkCheckpointQueue;
    };
    queueBenchmarkCheckpoint();
    mainWindow.webContents.on('console-message', details => {
      const message = details.message || '';
      if (message.startsWith('BENCHMARK_CASE_START ')) {
        try {
          activeBenchmarkCase = JSON.parse(message.slice('BENCHMARK_CASE_START '.length));
          queueBenchmarkCheckpoint();
        } catch (error) {
          console.error('DESKTOP_BENCHMARK_CASE_START_PARSE_ERROR ' + (error.stack || error.message));
        }
      } else if (message.startsWith('BENCHMARK_CASE ')) {
        try {
          benchmarkResults.push(JSON.parse(message.slice('BENCHMARK_CASE '.length)));
          activeBenchmarkCase = null;
          console.log(message);
          queueBenchmarkCheckpoint();
        } catch (error) {
          console.error('DESKTOP_BENCHMARK_CASE_PARSE_ERROR ' + (error.stack || error.message));
        }
      }
    });
    mainWindow.webContents.once('did-finish-load', () => {
      const probe = `(async () => {
        const models = ${JSON.stringify(benchmarkModels)};
        const circuits = ${JSON.stringify(benchmarkCircuits)};
        const population = 16;
        const mutation = .16;
        const speedMultiplier = 30;
        const seed = 7717;
        const caseTimeoutMs = ${benchmarkTimeoutMs};
        const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
        const waitFor = async (predicate, timeoutMs) => {
          const started = performance.now();
          while (performance.now() - started < timeoutMs) {
            if (predicate()) return true;
            await wait(100);
          }
          return Boolean(predicate());
        };
        const dispatchChange = (id, value) => {
          const control = document.getElementById(id);
          if (!control) throw new Error('Controllo benchmark mancante: ' + id);
          control.value = value;
          control.dispatchEvent(new Event('change', {bubbles: true}));
        };
        const currentSim = () => globalThis.circuitLab?.sim;
        const selectModel = async modelId => {
          const current = globalThis.circuitLab?.modelId;
          if (current === modelId) {
            const sim = currentSim();
            sim.mode = 'connectome';
            sim.reset();
            await waitFor(() => currentSim()?.modelId === modelId && currentSim()?.generation === 1, 10000);
          } else {
            dispatchChange('controller-select', modelId);
            const loaded = await waitFor(() => globalThis.circuitLab?.modelId === modelId && currentSim()?.modelId === modelId && Boolean(currentSim()?.engine), 30000);
            if (!loaded) throw new Error('Timeout caricamento modello ' + modelId);
          }
          if (globalThis.desktopCompute) await globalThis.desktopCompute.command({type: 'setWorkerCount', value: 1});
          const singleWorker = await waitFor(() => Number(currentSim()?.engine?.workerCount) === 1, 20000);
          if (!singleWorker) throw new Error('Timeout configurazione worker singolo per ' + modelId);
          const mutationControl = document.getElementById('mutation-range');
          const selectedSimulation = currentSim();
          selectedSimulation.seed = seed;
          mutationControl.value = String(Math.round(mutation * 100));
          mutationControl.dispatchEvent(new Event('input', {bubbles: true}));
          if (Math.abs(Number(selectedSimulation?.mutation) - mutation) > 1e-9 || selectedSimulation?.seed !== seed) throw new Error('Seed o mutazione non applicati per ' + modelId);
        };
        const selectCircuit = async (modelId, circuitId) => {
          dispatchChange('circuit-select', circuitId);
          const selected = await waitFor(() => currentSim()?.circuitId === circuitId, 5000);
          if (!selected) throw new Error('Timeout caricamento circuito ' + circuitId);
          const sim = currentSim();
          if (Math.abs(Number(sim?.mutation) - mutation) > 1e-9 || sim?.seed !== seed) throw new Error('Configurazione benchmark incoerente per ' + modelId + '/' + circuitId);
          sim.speedMultiplier = speedMultiplier;
          sim.running = true;
          await wait(500);
        };
        const runCase = async (modelId, circuitId) => {
          await selectModel(modelId);
          await selectCircuit(modelId, circuitId);
          const sim = currentSim();
          const started = performance.now();
          let hit = null;
          while (performance.now() - started < caseTimeoutMs) {
            const history = sim.history || [];
            const entry = history.find(item => Number(item.noLapCount) < sim.population);
            if (entry) {
              hit = entry;
              break;
            }
            const completed=(sim.cars||[]).filter(car=>car.laps>=1);
            if(completed.length){const best=completed.slice().sort(globalThis.FlySim.compareAgents)[0];hit={generation:sim.generation,noLapCount:sim.population-completed.length,best:best.fitness,bestProgress:Math.max(...completed.map(car=>car.bestProgress)),bestLapTime:Math.min(...completed.map(car=>car.bestLapTime))};break;}
            await wait(250);
          }
          const history = sim.history || [];
          const last = history.at(-1) || null;
          const generationHistory = history.map(item => ({
            generation: item.generation,
            bestProgress: item.bestProgress,
            bestSafeProgress: item.bestSafeProgress,
            meanSafeProgress: item.meanSafeProgress,
            laps: item.laps,
            bestLapTime: item.bestLapTime,
            stagnation: item.stagnation,
            mutationAmount: item.mutationAmount,
            optimizerUpdates: item.learning?.updates ?? null,
            optimizerEpisodes: item.learning?.episodes ?? null
          }));
          const safePeak = generationHistory.reduce((best, item) => Number(item.bestSafeProgress) > best.progress
            ? {generation: item.generation, progress: Number(item.bestSafeProgress)}
            : best, {generation: null, progress: 0});
          const result = {
            modelId,
            circuitId,
            seed,
            caseTimeoutMs,
            adapter: 'reward-trained recurrent MaleCNS policy, no assisted driving',
            learning: {neurons:globalThis.FlySim.ensureLearning(sim.graph).nodes.length,parameters:sim.graph.learning.length,warmStart:false,stats:sim.learningStats},
            population: sim.population,
            mutation: sim.mutation,
            speedMultiplier: sim.speedMultiplier,
            workerCount: sim.engine?.workerCount ?? null,
            recommendedWorkerCount: sim.engine?.recommendedWorkerCount ?? null,
            completionStatus: hit ? 'lap' : 'wall-time-limit',
            reachedOneLap: Boolean(hit),
            firstLapGeneration: hit?.generation ?? null,
            completedAgentCountAtFirstLap: hit ? sim.population - Number(hit.noLapCount || 0) : 0,
            firstLapBestScore: hit?.best ?? null,
            firstLapBestProgress: hit?.bestProgress ?? null,
            firstLapTime: hit?.bestLapTime ?? null,
            generationsEvaluated: last?.generation ?? 0,
            finalBest: last?.best ?? null,
            finalBestProgress: last?.bestProgress ?? null,
            finalBestSafeProgress: last?.bestSafeProgress ?? null,
            peakBestSafeProgress: safePeak.progress,
            peakBestSafeProgressGeneration: safePeak.generation,
            generationHistory,
            elapsedWallSeconds: Number(((performance.now() - started) / 1000).toFixed(3)),
            gpu: sim.engine?.gpu || null
          };
          sim.running = false;
          return result;
        };
        const initialized = await waitFor(() => Boolean(globalThis.circuitLab?.sim) && document.getElementById('controller-select')?.options?.length >= 3 && document.getElementById('circuit-select')?.options?.length >= 4, 60000);
        if (!initialized) throw new Error('Timeout inizializzazione interfaccia benchmark.');
        const results = [];
        for (const modelId of models) {
          for (const circuitId of circuits) {
            console.log('BENCHMARK_CASE_START '+JSON.stringify({modelId,circuitId,seed,mutation,population,speedMultiplier,caseTimeoutMs,startedAt:new Date().toISOString()}));
            const result=await runCase(modelId,circuitId);
            results.push(result);
            console.log('BENCHMARK_CASE '+JSON.stringify(result));
          }
        }
        const lapCases = results.filter(result => result.reachedOneLap).length;
        const totalCases = models.length * circuits.length;
        return {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          benchmarkMode: 'Electron DesktopEngine + WebGPU/CPU fallback',
          stoppingRule: 'stop each model/circuit case after the first agent completes at least one lap',
          safetyGuard: '${benchmarkTimeoutMs / 1000} seconds wall time per case; not a simulated-time limit',
          configuration: {models, circuits, population, mutation, seed, speedMultiplier, caseTimeoutMs},
          summary: {totalCases, completedCases: results.length, lapCases, pendingCases: Math.max(0, totalCases - results.length)},
          results
        };
      })()`;
      mainWindow.webContents.executeJavaScript(probe, true).then(result => {
        console.log('DESKTOP_BENCHMARK ' + JSON.stringify(result));
        return queueBenchmarkCheckpoint('completed', null, result).then(() => fs.mkdir(benchmarkOutputDir, {recursive: true})).then(() => fs.writeFile(benchmarkReportPath, JSON.stringify(result, null, 2), 'utf8')).then(() => result);
      }).catch(async error => {
        console.error('DESKTOP_BENCHMARK_ERROR ' + (error.stack || error.message));
        try {
          await queueBenchmarkCheckpoint('failed', error);
          await fs.mkdir(benchmarkOutputDir, {recursive: true});
          await fs.writeFile(path.join(benchmarkOutputDir, 'male-cns-all-benchmark-error.json'), JSON.stringify({error: error.stack || error.message, activeCase: activeBenchmarkCase, completedCases: benchmarkResults}, null, 2), 'utf8');
        } catch (reportError) {
          console.error('DESKTOP_BENCHMARK_ERROR_REPORT_FAILED ' + (reportError.stack || reportError.message));
        }
        app.exit(1);
      }).then(result => {
        if (result) app.exit(result.summary.lapCases === result.summary.totalCases ? 0 : 2);
      });
    });
  }
  if (process.argv.includes('--smoke-test') || learningSmoke) {
    mainWindow.webContents.once('did-finish-load', () => {
      const probe = `new Promise(resolve => {
        const started = Date.now();
        const learningTest = ${learningSmoke};
        const learningGenerations=${learningGenerations};
        let accelerated = false;
        let baseline = null;
        let inspectedAgentId=0;
        let inspectionRequested=false;
        const check = () => {
          const text = document.getElementById('dataset-status')?.textContent || '';
          const activeText = document.getElementById('brain-map-active')?.textContent || '';
          const sim = globalThis.circuitLab?.sim;
          if (learningTest && sim && !accelerated) {
            sim.speedMultiplier = 30;
            accelerated = true;
          }
          const gpuState = sim?.engine?.gpu?.state;
          const car = sim?.cars?.[inspectedAgentId];
          const cars = sim?.cars || [];
          if (!baseline && cars.length) baseline = cars.map(current => [current.x, current.y]);
          const activeCount = car?.brain?.activeCount || 0;
          const activeBuffer = car?.brain?.active;
          const maxActivity = car?.brain && activeBuffer && Number.isInteger(activeCount) ? Math.max(0, ...Array.from(activeBuffer.subarray(0, activeCount), index => Math.abs(car.brain.activity[index] || 0))) : 0;
          const maxSpeed = cars.length ? Math.max(...cars.map(current => Math.abs(Number(current.speed) || 0))) : 0;
          const maxMovement = cars.length && baseline ? Math.max(...cars.map((current, index) => Math.hypot((Number(current.x) || 0) - (baseline[index]?.[0] || 0), (Number(current.y) || 0) - (baseline[index]?.[1] || 0)))) : 0;
          const maxThrottle = cars.length ? Math.max(...cars.map(current => Number(current.outputs?.[1]) || 0)) : 0;
          const maxBrake = cars.length ? Math.max(...cars.map(current => Number(current.outputs?.[2]) || 0)) : 0;
          const maxThrottleBrakeOverlap = cars.length ? Math.max(...cars.map(current => Math.min(Number(current.outputs?.[1]) || 0, Number(current.outputs?.[2]) || 0))) : 0;
          const aliveCount = cars.filter(current => current.alive).length;
          const learningHistory = sim?.history || [];
          const telemetry = {maxSpeed, maxMovement, maxThrottle, maxBrake, maxThrottleBrakeOverlap, aliveCount, cars: cars.slice(0, 3).map(current => ({id: current.id, x: current.x, y: current.y, speed: current.speed, alive: current.alive, outputs: current.outputs, progress: current.progress, reason: current.reason}))};
          const neuralReady = text.includes('APP WINDOWS') && sim?.cars?.length && Boolean(sim?.engine) && (gpuState === 'fallback' || gpuState === 'lost' || !sim?.graph?.full || (gpuState === 'active' && activeCount > 0));
          if(neuralReady&&!learningTest&&!inspectionRequested&&sim.graph.full&&cars.length>1){
            inspectedAgentId=1;inspectionRequested=true;
            const select=document.getElementById('agent-select');select.value='1';select.dispatchEvent(new Event('change',{bubbles:true}));
            setTimeout(check,250);return;
          }
          const inspectionReady=!inspectionRequested||activeCount>=Math.min(sim.graph.solver.activeNeuronBudget,sim.graph.n);
          const motionReady = maxSpeed > 0.01 || maxMovement > 0.1;
          const actuatorReady = maxThrottleBrakeOverlap <= 1e-9;
          const learningReady = !learningTest || learningHistory.length >= learningGenerations;
          const ready = Boolean(neuralReady && motionReady && actuatorReady && learningReady && inspectionReady);
          if ((ready && Date.now() - started > 5000) || Date.now() - started > (learningTest ? Math.max(90000,learningGenerations*8000) : 20000)) resolve({
            title: document.title,
            version: globalThis.circuitLab?.version,
            runtimeVersion: ${JSON.stringify(app.getVersion())},
            protocol: location.protocol,
            dataset: text,
            runState: document.getElementById('run-state')?.textContent || '',
            active: activeText,
            generation: document.getElementById('generation-value')?.textContent || '',
            dna: document.getElementById('neuron-readout')?.textContent || '',
            speedMultiplier: sim?.speedMultiplier || 0,
            elapsed: sim?.elapsed || 0,
            workers: sim?.engine?.workerCount || 0,
            cars: sim?.cars?.length || 0,
            gpu: sim?.engine?.gpu || null,
            neural: {activeCount, maxActivity},
            telemetry,
            neuralReady: Boolean(neuralReady),
            motionReady,
            actuatorReady,
            learningTest,
            learningGenerations,
            learningReady,
            inspectedAgentId,
            inspectionReady,
            learningHistory: learningHistory.map(entry => ({generation: entry.generation, best: entry.best, bestProgress: entry.bestProgress, bestLapTime:entry.bestLapTime, laps: entry.laps, stagnation: entry.stagnation})),
            policy: {version:sim?.graph?.learning?.version,parameters:sim?.graph?.learning?.length,warmStart:false,stats:sim?.learningStats},
            ready: Boolean(ready)
          });
          else setTimeout(check, 250);
        };
        check();
      })`;
      mainWindow.webContents.executeJavaScript(probe, true).then(result => {
        console.log('DESKTOP_SMOKE ' + JSON.stringify(result));
        return fs.writeFile(path.join(app.getPath('temp'), 'male-cns-circuit-lab-smoke.json'), JSON.stringify(result, null, 2), 'utf8').then(() => result);
      }).catch(error => {
        console.error('DESKTOP_SMOKE_ERROR ' + (error.stack || error.message));
        app.exit(1);
      }).then(result => {
        if (result) app.exit(result.ready ? 0 : 1);
      });
    });
  }
}

app.whenReady().then(async () => {
  protocol.handle('male-cns', serveLocalAsset);
  engine = new DesktopEngine(outputsDirectory(), payload => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('compute:snapshot', payload);
  }, error => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('compute:error', {message: error.message});
  }, request => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('compute:gpu-request', request);
  },{trainingCopyV3,trainingCopyV3Baseline,trainingCopyV3Current});
  ipcMain.handle('compute:start', (_event, options) => engine.start(options));
  ipcMain.handle('compute:restore-progress',async (_event,file,rendererToken)=>{const verified=await Progress.decode(JSON.stringify(file),app.getVersion());return engine.restoreProgress(verified.payload,rendererToken);});
  ipcMain.handle('training-copy:load-default',async()=>{
    if(!trainingCopyProfile)throw Error('Caricamento automatico disponibile solo nella copia di allenamento isolata.');
    if(!trainingCopyProgressArg)return null;
    const filePath=path.resolve(trainingCopyProgressArg.slice('--training-copy-progress='.length));
    const file=JSON.parse(await fs.readFile(filePath,'utf8'));
    const verified=await Progress.decode(JSON.stringify(file),app.getVersion());
    await engine.validateProgress(verified.payload);
    return verified;
  });
  ipcMain.handle('compute:command', (_event, command) => engine.command(command));
  ipcMain.handle('compute:info', () => engine.info());
  ipcMain.handle('compute:gpu-response', (_event, payload) => engine.gpuResponse(payload));
  testEngine=new DesktopEngine(outputsDirectory(),payload=>mainWindow?.webContents.send('test:snapshot',payload),error=>mainWindow?.webContents.send('test:error',{message:error.message}),request=>mainWindow?.webContents.send('test:gpu-request',request));
  ipcMain.handle('test:start',(_event,options)=>testEngine.start({...options,workerCount:1,running:false,mode:'connectome'}));
  ipcMain.handle('test:command',(_event,command)=>testEngine.command(command));
  ipcMain.handle('test:info',()=>testEngine.info());
  ipcMain.handle('test:gpu-response',(_event,payload)=>testEngine.gpuResponse(payload));
  ipcMain.handle('test:stop',()=>testEngine.stop());
  ipcMain.handle('test:save-report',async (_event,report)=>{
    if(report?.schema!==1||report?.execution!=='sequential-cold-start'||report?.cases?.length!==4)throw Error('Rapporto del test non valido.');
    const text=JSON.stringify(report,null,2);if(text.length>100000)throw Error('Rapporto troppo grande.');
    const choice=await testReportDialog.showSaveDialog(mainWindow,{title:'Esporta risultati del test',defaultPath:`malecns-test-2-giri-${report.settings.circuitId}.json`,filters:[{name:'Risultati JSON',extensions:['json']}]});
    if(choice.canceled)return {canceled:true};await fs.writeFile(choice.filePath,text,'utf8');return {canceled:false,name:path.basename(choice.filePath)};
  });
  const fileOperation=async operation=>{try{return await operation();}catch(error){return {error:error.message};}};
  ipcMain.handle('progress:save',()=>fileOperation(()=>progressFiles.save()));
  ipcMain.handle('progress:open',()=>fileOperation(()=>progressFiles.open()));
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (engine) engine.stop();
  if(testEngine)testEngine.stop();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
