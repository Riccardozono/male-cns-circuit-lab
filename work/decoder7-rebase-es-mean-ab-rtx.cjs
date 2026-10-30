'use strict';

// Paired natural evolution: retain the saved ES mean vs rebase it on the safest archived frontier genome.
// Both branches use the same checkpoint, RNG seed, population, ES sample rate, and unchanged sigma.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const input=path.join(root,'.impeccable/review/decoder7/seed850813-natural-control-rtx-20261028/decoder7-main-runtime-gen108-research.malecns-save');
const referencePath=path.join(root,'.impeccable/review/decoder7/seed850813-natural-control-rtx-20261028/decoder7-main-runtime-result.json');
const userSave='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const output=path.join(root,'.impeccable/review/decoder7/rebase-es-mean-ab-rtx-20261028');
const seed=850816,sha=value=>crypto.createHash('sha256').update(value).digest('hex'),hashFile=file=>sha(fs.readFileSync(file));

function installMainCompatibleDecoder6(L){
  const originalBuild=L.build;
  L.build=function(graph){
    const config=graph.policyConfig;if(config?.version!==6)return originalBuild(graph);
    graph.policyConfig=null;let base;try{base=originalBuild(graph);}finally{graph.policyConfig=config;}
    const n=base.nodes.length,featureCount=n*2,readoutOffset=base.readoutOffset;
    if(base.version!==3||n!==64||base.length!==202)throw Error('V3 base policy no longer matches decoder6 assumptions.');
    const thresholdOffset=readoutOffset+featureCount*2,length=thresholdOffset+n+2,mean=Array(length).fill(0),scales=Array(length).fill(.1);
    for(let i=0;i<readoutOffset;i++){mean[i]=base.mean[i];scales[i]=base.scales[i];}
    for(let j=0;j<n;j++){mean[readoutOffset+j*2]=base.mean[readoutOffset+j*2];mean[readoutOffset+j*2+1]=base.mean[readoutOffset+j*2+1];}
    for(let j=0;j<featureCount;j++){scales[readoutOffset+j*2]=j<n?.08:.05;scales[readoutOffset+j*2+1]=j<n?.2:.1;}
    for(let j=0;j<n;j++)scales[thresholdOffset+j]=.03;
    mean[length-2]=base.mean[base.length-2];mean[length-1]=base.mean[base.length-1];
    scales[length-2]=base.scales[base.length-2];scales[length-1]=base.scales[base.length-1];
    graph.learning={...base,version:6,featureCount,featureNorm:1/Math.sqrt(n),thresholdOffset,nonlinear:true,readoutStride:2,length,mean,scales};
    return graph.learning;
  };
}

async function runArm({F,P,model,circuits,state,payload,outputDir,name,version,archiveSeed}){
  const sim=new F.Simulation(structuredClone(model),{modelId:'v3',population:state.population,circuitId:state.circuitId,circuits,seed});
  P.validatePayload(payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,structuredClone(state));
  if(!(sim.optimizerSampleIds instanceof Set)||sim.optimizerSampleIds.size!==0)throw Error('Restore failed to mark saved sample origins unknown.');
  const sigmaBefore=sim.optimizer.sigma.slice(),meanBefore=sim.optimizer.mean.slice();
  let rebase=null;
  if(name==='rebase'){
    const entry=archiveSeed;
    if(!entry?.genome?.policyWeights||entry.genome.policyWeights.length!==sim.graph.learning.length)throw Error('No compatible safe archive seed.');
    sim.optimizer.mean=entry.genome.policyWeights.slice();
    rebase={source:'bestProgress safe archive entry',bestProgress:entry.bestProgress,laps:entry.laps,fitness:entry.fitness,
      oldMeanRmsFromSeed:Math.sqrt(meanBefore.reduce((sum,v,i)=>sum+(v-sim.optimizer.mean[i])**2,0)/meanBefore.length),sigmaUnchanged:JSON.stringify(sigmaBefore)===JSON.stringify(sim.optimizer.sigma)};
  }
  sim.seed=seed;sim.random=F.rng(seed);sim.running=true;
  const start=sim.generation,history=[],optimizerCalls=[];let terminal=new Map(),ticks=0,lastLog=performance.now();
  const originalUpdate=sim.optimizer.update;
  sim.optimizer.update=function(ranked,compare){optimizerCalls.push({generation:sim.generation,ids:ranked.map(a=>a.id),count:ranked.length});return originalUpdate.call(this,ranked,compare);};
  sim.onTrialTick=s=>{
    if(performance.now()-lastLog>25000){lastLog=performance.now();console.log('REBASE_RUNNING '+JSON.stringify({arm:name,generation:s.generation,alive:s.cars.filter(c=>c.alive).length,progress:Math.max(...s.cars.map(c=>c.bestProgress))}));}
    if(s.cars.every(c=>!c.alive))for(const c of s.cars)terminal.set(c.id,{id:c.id,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),laps:c.laps,fitness:c.fitness,reason:c.reason||'',safe:F.isSafeLearningOutcome(c)});
  };
  let totalTicks=0;
  while(sim.generation<start+4){
    const before=sim.generation;sim.tick();ticks++;totalTicks++;
    if(ticks>60000)throw Error(`${name}: generation ${before} exceeded watchdog.`);
    if(sim.generation!==before){
      const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id);if(outcomes.length!==state.population)throw Error(`${name}/gen${before}: terminal outcome count mismatch.`);
      const safe=outcomes.filter(c=>c.safe),h=sim.history.at(-1),row={generation:before,population:outcomes.length,safeCount:safe.length,
        unsafeCount:outcomes.length-safe.length,safeFrontierM:safe.length?Math.max(...safe.map(c=>c.progressM)):null,
        rawFrontierM:Math.max(...outcomes.map(c=>c.progressM)),maxLaps:Math.max(...outcomes.map(c=>c.laps)),
        noLapCount:outcomes.filter(c=>c.laps<1).length,nextGenerationEsSamples:sim.lastOptimizerSampleCount??null,
        optimizerEpisodes:h.learning?.episodes??null,reasonCounts:outcomes.reduce((a,c)=>(a[c.reason]=(a[c.reason]||0)+1,a),{}),outcomes};
      history.push(row);fs.writeFileSync(path.join(outputDir,`${name}-partial.json`),JSON.stringify({name,history},null,2));
      console.log('REBASE_GENERATION '+JSON.stringify({arm:name,...row,outcomes:undefined,ticks}));terminal=new Map();ticks=0;
    }
  }
  const finalState=P.capture(sim),savePath=path.join(outputDir,`${name}-gen112-research.malecns-save`);
  fs.writeFileSync(savePath,await P.encode(P.fromSimulation(sim),version));
  const decoded=await P.decode(fs.readFileSync(savePath,'utf8'),version);P.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});
  return {name,rebase,history,optimizerCalls,totalTicks,outputSave:{path:savePath,sha256:hashFile(savePath),bytes:fs.statSync(savePath).size,decoded:true,
    generation:finalState.generation}};
}

async function main(){
  if(process.versions.node!=='24.19.0')throw Error(`Pinned Node 24.19.0 required; found ${process.versions.node}`);
  if(fs.existsSync(output))throw Error('Output directory already exists; refusing to overwrite evidence.');
  const inputHash=hashFile(input),userHash=hashFile(userSave),reference=JSON.parse(fs.readFileSync(referencePath,'utf8'));
  if(inputHash!==reference.outputSave.sha256||userHash!==reference.inputIntegrity.userSaveSha256)throw Error('Input checkpoint or user save differs from recorded reference.');
  const P=require(path.join(root,'outputs/progress-save.js')),appSave=await P.decode(fs.readFileSync(input,'utf8'),'5.6.0'),state=appSave.payload.workers[0].state;
  if(state.generation!==108||state.population!==40||state.optimizer.mean.length!==523||state.optimizer.episodes!==3992)throw Error('Unexpected V3/decoder7 gen108 checkpoint.');
  const safeArchive=state.hallOfFame.filter(x=>Number.isFinite(x.bestProgress)&&Number.isFinite(x.fitness)).sort((a,b)=>b.bestProgress-a.bestProgress)[0];
  if(!safeArchive||Math.abs(safeArchive.bestProgress-795.6149210338748)>.001)throw Error('Safe archive seed differs from the reproduced gen108 frontier.');
  const simPath=path.join(root,'outputs/simulation.js'),learningPath=path.join(root,'outputs/neural-learning.js'),sourceBefore=fs.readFileSync(simPath,'utf8');
  const L=require(learningPath),Legacy=require(path.join(root,'outputs/legacy-models.js')),Dense=require(path.join(root,'outputs/dense-neural.js')),D7=require('./decoder7-model.cjs');
  installMainCompatibleDecoder6(L);D7.install(L);
  const model=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')));model.policyConfig={...D7.POLICY};
  const circuits=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/circuits.json'),'utf8')),F=require(simPath);
  fs.mkdirSync(output,{recursive:false});
  const cuda=require(path.join(root,'work/cuda-exact-v3-runtime.cjs')),denseBefore=Dense.step;Dense.step=(...args)=>cuda.pass(...args);
  const started=performance.now();let arms=[];
  try{
    for(const name of ['control','rebase']){
      const result=await runArm({F,P,model,circuits,state,payload:appSave.payload,outputDir:output,name,version:appSave.appVersion,archiveSeed:safeArchive});
      arms.push(result);console.log('REBASE_ARM_DONE '+JSON.stringify({arm:name,history:result.history.map(x=>({generation:x.generation,safe:x.safeCount,frontier:x.safeFrontierM,laps:x.maxLaps})),optimizerCalls:result.optimizerCalls,rebase:result.rebase}));
    }
  }finally{Dense.step=denseBefore;}
  const gpu=cuda.stats();if(gpu.gpuCalls<=0||gpu.cpuFallbacks!==0||gpu.device?.name!=='NVIDIA GeForce RTX 4060')throw Error('Expected RTX 4060 execution with zero CPU fallback.');
  const sourceAfter=hashFile(simPath),userAfter=hashFile(userSave),inputAfter=hashFile(input);
  if(sourceAfter!==sha(sourceBefore)||userAfter!==userHash||inputAfter!==inputHash)throw Error('Production source or original save changed.');
  const control=arms.find(x=>x.name==='control'),rebase=arms.find(x=>x.name==='rebase');
  if(control.history.length!==4||rebase.history.length!==4)throw Error('Incomplete paired generations.');
  if(control.history[0].safeCount!==28||rebase.history[0].safeCount!==28||Math.abs(control.history[0].safeFrontierM-795.6149210338748)>.001||Math.abs(rebase.history[0].safeFrontierM-795.6149210338748)>.001)
    throw Error('Generation 108 anchor did not reproduce.');
  const result={format:'male-cns-decoder7-es-mean-rebase-ab-v1',appVersion:appSave.appVersion,
    method:'One paired RNG seed, four natural generations per arm. Treatment changes only ES mean to the highest-progress safe archive genome; sigma, population, model, physics, rewards, mutation and ES quota remain unchanged. Restore starts with empty transient sample provenance, so generation 108 skips its unknown-origin update.',
    settings:{circuit:'Monza',startingGeneration:108,generations:4,population:40,seed,esParameters:523,initialEpisodes:state.optimizer.episodes,
      initialUpdates:state.optimizer.updates,safeArchiveProgressM:safeArchive.bestProgress,controlMean:'saved optimizer mean',treatmentMean:'safe archive genome',sigmaChanged:false},
    control,rebase,pairedDeltas:rebase.history.map((r,i)=>({generation:r.generation,safeCount:r.safeCount-control.history[i].safeCount,
      safeFrontierM:r.safeFrontierM-control.history[i].safeFrontierM,laps:r.maxLaps-control.history[i].maxLaps})),
    gpu,wallSeconds:(performance.now()-started)/1000,
    integrity:{inputSha256:inputHash,inputUnchanged:inputAfter===inputHash,userSaveSha256:userHash,userSaveUnchanged:userAfter===userHash,
      productionSourceSha256:sourceAfter,productionSourceUnchanged:sourceAfter===sha(sourceBefore)},
    sourceSha256:{simulation:hashFile(simPath),learning:hashFile(learningPath),progress:hashFile(path.join(root,'outputs/progress-save.js')),
      dense:hashFile(path.join(root,'outputs/dense-neural.js')),decoder7:hashFile(path.join(root,'work/decoder7-model.cjs')),runner:hashFile(__filename)},
    decision:'research-only; no model promoted',limits:'Single seed, one already-trained checkpoint and one circuit; this does not prove convergence on other seeds, tracks, models, or two laps.'};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(result,null,2),{encoding:'utf8',flag:'wx'});
  console.log('REBASE_DONE '+JSON.stringify({report:path.join(output,'report.json'),deltas:result.pairedDeltas,gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks,
    inputUnchanged:result.integrity.inputUnchanged,userSaveUnchanged:result.integrity.userSaveUnchanged,sourceUnchanged:result.integrity.productionSourceUnchanged}));cuda.close();
}

main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
