'use strict';
// Research-only V3/decoder7 test: increase the share of ES-sampled offspring.
// The production tree and user saves are read-only; the patch is compiled in memory.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const input=path.join(root,'.impeccable/review/decoder7/seed850813-natural-control-rtx-20261028/decoder7-main-runtime-gen108-research.malecns-save');
const parentReport=path.join(root,'.impeccable/review/decoder7/seed850813-gen108-steer1-curriculum-current-runner-four-updates-20261028/decoder7-main-runtime-result.json');
const userSave='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/decoder7/seed850813-es-sample-share-50pct-four-generations-20261028');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const hashFile=file=>sha(fs.readFileSync(file));
const replaceOnce=(source,before,after,label)=>{
  const at=source.indexOf(before);
  if(at<0||source.indexOf(before,at+before.length)>=0)throw Error(`Expected one exact source anchor: ${label}`);
  return source.slice(0,at)+after+source.slice(at+before.length);
};

function installMainCompatibleDecoder6(L,D7){
  const originalBuild=L.build;
  L.build=function(graph){
    const config=graph.policyConfig;
    if(config?.version!==6)return originalBuild(graph);
    graph.policyConfig=null;
    let base;try{base=originalBuild(graph);}finally{graph.policyConfig=config;}
    const n=base.nodes.length,featureCount=n*2,readoutOffset=base.readoutOffset;
    if(base.version!==3||n!==64||base.length!==202)throw Error('Current V3 base policy no longer matches decoder6 assumptions.');
    const thresholdOffset=readoutOffset+featureCount*2,length=thresholdOffset+n+2;
    const mean=Array(length).fill(0),scales=Array(length).fill(.1);
    for(let i=0;i<readoutOffset;i++){mean[i]=base.mean[i];scales[i]=base.scales[i];}
    for(let j=0;j<n;j++){mean[readoutOffset+j*2]=base.mean[readoutOffset+j*2];mean[readoutOffset+j*2+1]=base.mean[readoutOffset+j*2+1];}
    for(let j=0;j<featureCount;j++){scales[readoutOffset+j*2]=j<n?.08:.05;scales[readoutOffset+j*2+1]=j<n?.2:.1;}
    for(let j=0;j<n;j++)scales[thresholdOffset+j]=.03;
    mean[length-2]=base.mean[base.length-2];mean[length-1]=base.mean[base.length-1];
    scales[length-2]=base.scales[base.length-2];scales[length-1]=base.scales[base.length-1];
    const policy={...base,version:6,featureCount,featureNorm:1/Math.sqrt(n),thresholdOffset,nonlinear:true,readoutStride:2,length,mean,scales};
    graph.learning=policy;return policy;
  };
}

async function main(){
  if(process.versions.node!=='24.19.0')throw Error(`Pinned Node 24.19.0 required; found ${process.versions.node}`);
  if(fs.existsSync(out))throw Error(`Refusing to overwrite research output: ${out}`);
  const inputHash=hashFile(input),userSaveHash=hashFile(userSave),baseline=JSON.parse(fs.readFileSync(parentReport,'utf8'));
  if(inputHash!==baseline.inputIntegrity.inputSha256)throw Error('Checkpoint hash differs from the recorded A/B input.');
  if(userSaveHash!==baseline.inputIntegrity.userSaveSha256)throw Error('User save hash differs from the recorded value.');
  const P=require(path.join(root,'outputs/progress-save.js'));
  const appSave=await P.decode(fs.readFileSync(input,'utf8'),'5.6.0'),state=appSave.payload.workers[0].state;
  if(state.generation!==108||state.population!==40||state.seed!==850813||state.circuitId!=='monza'||state.optimizer.mean.length!==523||state.optimizer.sigma.length!==523||state.genomes.some(g=>g&&g.adapterVersion!==7))
    throw Error('Unexpected V3/decoder7 Monza checkpoint.');

  const simPath=path.join(root,'outputs/simulation.js'),sourceBefore=fs.readFileSync(simPath,'utf8');
  const oldTarget='?Math.min(Math.max(this.population<=8?2:1,Math.floor(this.population*.1)),Math.max(0,this.population-genomes.length-immigrantCount)):0;';
  const newTarget='?Math.min(Math.max(this.population<=8?2:1,Math.floor(this.population*.5)),Math.max(0,this.population-genomes.length-immigrantCount)):0;';
  const treatmentSource=replaceOnce(sourceBefore,oldTarget,newTarget,'ES sample share 50 percent');
  const Fbase=require(simPath),L=require(path.join(root,'outputs/neural-learning.js'));
  const Legacy=require(path.join(root,'outputs/legacy-models.js'));
  const Dense=require(path.join(root,'outputs/dense-neural.js'));
  const D7=require('./decoder7-model.cjs');
  installMainCompatibleDecoder6(L,D7);D7.install(L);
  const data=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'));
  const model=Legacy.tagV3(data);model.policyConfig={...D7.POLICY};
  const circuits=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/circuits.json'),'utf8'));
  const compiled=new Module(simPath,module);compiled.filename=simPath;compiled.paths=Module._nodeModulePaths(path.dirname(simPath));compiled._compile(treatmentSource,simPath);compiled.loaded=true;
  const F=compiled.exports,sim=new F.Simulation(model,{modelId:'v3',population:40,circuitId:'monza',circuits});
  P.validatePayload(appSave.payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,state);sim.running=true;
  if(sim.generation!==108||sim.graph.learning.length!==523)throw Error('Restored research runtime is incompatible.');
  const Cuda=require(path.join(root,'work/cuda-exact-v3-runtime.cjs'));
  const denseBefore=Dense.step;Dense.step=(...args)=>Cuda.pass(...args);
  fs.mkdirSync(out,{recursive:false});
  const history=[];let terminal=new Map(),generationTicks=0,totalTicks=0,lastLog=performance.now();
  sim.onTrialTick=s=>{
    if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('ES_SHARE_RUNNING '+JSON.stringify({generation:s.generation,elapsed:s.elapsed,alive:s.cars.filter(c=>c.alive).length,progress:Math.max(...s.cars.map(c=>c.bestProgress)),esSamples:sim.lastOptimizerSampleCount??null}));}
    if(s.cars.every(car=>!car.alive))for(const car of s.cars)terminal.set(car.id,{id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,
      fitness:car.fitness,reason:car.reason||'',safe:F.isSafeLearningOutcome(car)});
  };
  while(sim.generation<112){
    const before=sim.generation;sim.tick();generationTicks++;totalTicks++;
    if(generationTicks>60000)throw Error(`Generation ${before} exceeded the 60,000 tick watchdog.`);
    if(sim.generation!==before){
      const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id);
      if(outcomes.length!==40)throw Error(`Generation ${before}: expected 40 terminal outcomes, got ${outcomes.length}.`);
      const safe=outcomes.filter(row=>row.safe),h=sim.history.at(-1);
      const record={generation:before,population:40,safeCount:safe.length,unsafeCount:40-safe.length,
        safeFrontierM:safe.length?Math.max(...safe.map(row=>row.progressM)):null,rawFrontierM:Math.max(...outcomes.map(row=>row.progressM)),
        maxLaps:Math.max(...outcomes.map(row=>row.laps)),noLapCount:outcomes.filter(row=>row.laps<1).length,
        nextGenerationEsSamples:sim.lastOptimizerSampleCount??null,optimizerEpisodes:h.learning?.episodes??null,
        reasonCounts:outcomes.reduce((acc,row)=>(acc[row.reason]=(acc[row.reason]||0)+1,acc),{}),outcomes};
      history.push(record);fs.writeFileSync(path.join(out,'partial.json'),JSON.stringify({history},null,2));
      console.log('ES_SHARE_GENERATION '+JSON.stringify({...record,outcomes:undefined,ticks:generationTicks}));
      terminal=new Map();generationTicks=0;
    }
  }
  const gpu=Cuda.stats(),gpuIdentity=Cuda.identity();
  if(gpu.gpuCalls<=0||gpu.cpuFallbacks!==0||gpu.device?.name!=='NVIDIA GeForce RTX 4060')throw Error('Expected RTX 4060 CUDA execution with zero CPU fallback.');
  const controlRows=baseline.history;
  for(let i=0;i<history.length;i++){
    const control=controlRows.find(row=>row.generation===history[i].generation),observed=history[i];
    if(!control||control.generation!==observed.generation)throw Error(`Control is missing generation ${observed.generation}.`);
    if(i===0&&(control.safeCount!==observed.safeCount||Math.abs(control.safeFrontier-observed.safeFrontierM)>.001||control.maxLaps!==observed.maxLaps))
      throw Error(`Initial generation ${observed.generation} does not match the paired baseline.`);
  }
  const savePath=path.join(out,'decoder7-es-share50-gen110-research.malecns-save');
  fs.writeFileSync(savePath,await P.encode(P.fromSimulation(sim),appSave.appVersion));
  const decoded=await P.decode(fs.readFileSync(savePath,'utf8'),'5.6.0');
  P.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});
  const report={format:'male-cns-decoder7-es-sample-share-ab-v1',variant:'50-percent-es-sample-share',appVersion:'5.6.0',
    scope:'Only optimizerSampleTarget changes from 10% to 50%; comparator, physical rewards, safe parent/champion/archive filters, mutation and vehicle physics remain unchanged.',
    settings:{circuitId:'monza',seed:850813,startGeneration:108,population:40,esParameters:523,requestedEsShare:.5,naturalGenerations:history.length},
    history,control:{sourceReport:path.relative(root,parentReport).replaceAll('\\','/'),generations:history.map(item=>{
      const row=controlRows.find(candidate=>candidate.generation===item.generation);
      return {generation:row.generation,safeCount:row.safeCount,safeFrontier:row.safeFrontier,maxLaps:row.maxLaps};
    })},
    comparison:{safeCountDelta:history.map(item=>item.safeCount-controlRows.find(row=>row.generation===item.generation).safeCount),
      safeFrontierDeltaM:history.map(item=>item.safeFrontierM-controlRows.find(row=>row.generation===item.generation).safeFrontier),
      lapsDelta:history.map(item=>item.maxLaps-controlRows.find(row=>row.generation===item.generation).maxLaps)},
    inputIntegrity:{checkpointSha256:inputHash,checkpointUnchanged:hashFile(input)===inputHash,userSaveSha256:userSaveHash,userSaveUnchanged:hashFile(userSave)===userSaveHash},
    outputSave:{path:savePath,sha256:hashFile(savePath),bytes:fs.statSync(savePath).size,decoded:true,version:decoded.appVersion,generation:decoded.payload.workers[0].state.generation,
      population:decoded.payload.workers[0].state.population,optimizerMean:decoded.payload.workers[0].state.optimizer.mean.length},
    gpu,gpuIdentity,sourceSha256:{simulation:hashFile(simPath),learning:hashFile(path.join(root,'outputs/neural-learning.js')),progressSave:hashFile(path.join(root,'outputs/progress-save.js')),
      denseNeural:hashFile(path.join(root,'outputs/dense-neural.js')),decoder7:hashFile(path.join(root,'work/decoder7-model.cjs')),treatmentInMemory:sha(treatmentSource)},
    decision:'candidate-not-promoted',limits:'One seed, checkpoint, circuit and two generations. No two-lap result or evidence of cross-seed generalization.'};
  if(!report.inputIntegrity.checkpointUnchanged||!report.inputIntegrity.userSaveUnchanged)throw Error('An input save changed during this experiment.');
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('ES_SHARE_DONE '+JSON.stringify({gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks,history:history.map(row=>({generation:row.generation,safeCount:row.safeCount,safeFrontierM:row.safeFrontierM,laps:row.maxLaps,esSamples:row.nextGenerationEsSamples})),saveSha256:report.outputSave.sha256,report:path.join(out,'report.json')}));
  Dense.step=denseBefore;Cuda.close();
}

main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
