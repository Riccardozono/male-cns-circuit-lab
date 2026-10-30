'use strict';

// Verify ES sample provenance across a real save restore and two natural RTX generations.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const input=path.join(root,'.impeccable/review/decoder7/seed850813-natural-control-rtx-20261028/decoder7-main-runtime-gen108-research.malecns-save');
const userSave='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const updateCount=Number(process.argv[2]||4);
if(!Number.isInteger(updateCount)||updateCount<2||updateCount>8)throw Error('Update count must be between 2 and 8.');
const output=path.join(root,`.impeccable/review/decoder7/restore-es-provenance-${updateCount}gen-rtx-20261028`);
const sha256=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let Cuda=null,Dense=null,originalDense=null,uninstall=null;

async function main(){
  if(fs.existsSync(output)&&fs.readdirSync(output).length)throw Error('Output directory already has files; refusing to overwrite evidence.');
  fs.mkdirSync(output,{recursive:true});
  const inputHash=sha256(input),userSaveHash=sha256(userSave);
  const D6=require('./decoder6-model.cjs'),D7=require('./decoder7-model.cjs');
  const L=D6.L,P=require(path.join(root,'outputs/progress-save.js'));
  const simPath=path.join(root,'outputs/simulation.js'),densePath=path.join(root,'outputs/dense-neural.js');
  let simSource=fs.readFileSync(simPath,'utf8');
  const learningImport="  const Learning=typeof module!=='undefined'&&module.exports?require('./neural-learning.js'):root.MaleCNSLearning;";
  if(simSource.split(learningImport).length!==2)throw Error('Current simulation learning import anchor is not unique.');
  simSource=simSource.replace(learningImport,'  const Learning=require('+JSON.stringify(path.join(D6.runtime,'outputs/neural-learning.js'))+');');
  const simModule=new Module(simPath,module);simModule.filename=simPath;simModule.paths=Module._nodeModulePaths(path.dirname(simPath));simModule._compile(simSource,simPath);
  const F=simModule.exports;
  Dense=require(densePath);
  Cuda=require('./cuda-exact-v3-runtime.cjs');
  const appSave=await P.decode(fs.readFileSync(input,'utf8'),'5.6.0');
  const savedState=appSave.payload.workers[0].state;
  if(savedState.generation!==108||savedState.population!==40||savedState.genomes.some(g=>g?.adapterVersion!==7))throw Error('Unexpected V3/decoder7 checkpoint.');
  const source=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'));
  const circuits=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/circuits.json'),'utf8'));
  uninstall=D7.install(L);
  const sim=new F.Simulation(D7.model(source),{population:savedState.population,circuitId:savedState.circuitId,circuits});
  P.validatePayload(appSave.payload,{graph:sim.graph,circuits:sim.circuits});
  P.restore(sim,savedState);
  sim.optimizer=new L.EvolutionStrategy(sim.graph);Object.assign(sim.optimizer,savedState.optimizer);
  if(sim.optimizerSampleIds.size!==0)throw Error('Restored samples were incorrectly assigned ES provenance.');
  originalDense=Dense.step;Dense.step=(...args)=>Cuda.pass(...args);
  const optimizerCalls=[],transitions=[];
  let completedGenerationStats=null;
  const originalUpdate=sim.optimizer.update;
  sim.optimizer.update=function(ranked,compare){
    optimizerCalls.push({generation:sim.generation,agentIds:ranked.map(agent=>agent.id),sampleCount:ranked.length});
    return originalUpdate.call(this,ranked,compare);
  };
  sim.onTrialTick=s=>{
    if(s.cars.every(car=>!car.alive))completedGenerationStats={safeCount:s.cars.filter(F.isSafeLearningOutcome).length,
      rawBest:Math.max(...s.cars.map(car=>car.bestProgress)),safeBest:Math.max(0,...s.cars.filter(F.isSafeLearningOutcome).map(car=>car.bestProgress)),
      maxLaps:Math.max(...s.cars.map(car=>car.laps))};
  };
  const startingGeneration=sim.generation,startingUpdates=sim.optimizer.updates;
  let ticks=0,lastLog=performance.now();sim.running=true;
  while(sim.generation<startingGeneration+updateCount&&ticks++<180000){
    const generation=sim.generation;sim.tick();
    if(sim.generation!==generation){
      const h=sim.history.at(-1);
      transitions.push({completedGeneration:h.generation,...completedGenerationStats,
        bestProgress:h.bestProgress,optimizerUpdates:sim.optimizer.updates,
        nextGenerationSampleIds:Array.from(sim.optimizerSampleIds||[])});
      completedGenerationStats=null;
      console.log('RESTORE_ES_GENERATION '+JSON.stringify(transitions.at(-1)));
    }
    if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('RESTORE_ES_RUNNING '+JSON.stringify({generation:sim.generation,alive:sim.cars.filter(c=>c.alive).length,ticks}));}
  }
  if(sim.generation<startingGeneration+updateCount)throw Error(`${updateCount} generations did not complete naturally.`);
  const gpu=Cuda.stats(),integrity={inputSha256:inputHash,inputUnchanged:sha256(input)===inputHash,userSaveSha256:userSaveHash,userSaveUnchanged:sha256(userSave)===userSaveHash};
  if(!integrity.inputUnchanged||!integrity.userSaveUnchanged||gpu.gpuCalls<=0||gpu.cpuFallbacks!==0||gpu.device?.name!=='NVIDIA GeForce RTX 4060')throw Error('GPU or input-integrity verification failed.');
  if(optimizerCalls.length!==updateCount||optimizerCalls[0].sampleCount!==0)throw Error('The first restored generation did not skip samples of unknown origin.');
  for(let i=1;i<optimizerCalls.length;i++){
    const expected=[...(transitions[i-1]?.nextGenerationSampleIds||[])].sort((a,b)=>a-b),actual=[...optimizerCalls[i].agentIds].sort((a,b)=>a-b);
    if(!expected.length||JSON.stringify(actual)!==JSON.stringify(expected))throw Error(`Generation ${optimizerCalls[i].generation} used ES IDs different from the recorded sample provenance.`);
  }
    const result={variant:'decoder7-restore-es-provenance-fix',appVersion:appSave.appVersion,startingGeneration,population:savedState.population,
    startingOptimizerUpdates:startingUpdates,optimizerCalls,transitions,gpu,integrity,
    sourceSha256:{simulation:sha256(path.join(root,'outputs/simulation.js')),progress:sha256(path.join(root,'outputs/progress-save.js')),learning:sha256(path.join(root,'outputs/neural-learning.js')),runner:sha256(__filename)},
    wallSeconds:(performance.now()-startedAt)/1000,
    limits:'Two natural generations on one already-trained V3/decoder7 checkpoint and Monza only; verifies ES sample attribution after restore, not lap completion or general learning.'};
  const report=path.join(output,'report.json');fs.writeFileSync(report,JSON.stringify(result,null,2));
  console.log('RESTORE_ES_DONE '+JSON.stringify({report,gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks,optimizerCalls,transitions,inputUnchanged:integrity.inputUnchanged,userSaveUnchanged:integrity.userSaveUnchanged,wallSeconds:gpu.wallSeconds}));
}

const startedAt=performance.now();
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(()=>{
  if(originalDense&&Dense)Dense.step=originalDense;
  if(Cuda)Cuda.close();
  if(uninstall)uninstall();
});
