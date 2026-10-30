'use strict';
// Paired seed panel for the 10% vs 50% ES sample share on V3/decoder7.
// Both arms restore the same gen108 checkpoint; only transient RNG seed and
// the in-memory ES offspring quota differ. No production file is edited.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const input=path.join(root,'.impeccable/review/decoder7/seed850813-natural-control-rtx-20261028/decoder7-main-runtime-gen108-research.malecns-save');
const originalControl=path.join(root,'.impeccable/review/decoder7/seed850813-gen108-steer1-curriculum-current-runner-four-updates-20261028/decoder7-main-runtime-result.json');
const userSave='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/decoder7/seed850814-850815-es-share50-paired-20261028');
const seeds=[850814,850815],sha=value=>crypto.createHash('sha256').update(value).digest('hex'),hashFile=file=>sha(fs.readFileSync(file));
const replaceOnce=(source,before,after,label)=>{
  const at=source.indexOf(before);
  if(at<0||source.indexOf(before,at+before.length)>=0)throw Error(`Expected one exact source anchor: ${label}`);
  return source.slice(0,at)+after+source.slice(at+before.length);
};

function installMainCompatibleDecoder6(L){
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
    graph.learning={...base,version:6,featureCount,featureNorm:1/Math.sqrt(n),thresholdOffset,nonlinear:true,readoutStride:2,length,mean,scales};
    return graph.learning;
  };
}

function compileTreatment(simPath,source){
  const before='?Math.min(Math.max(this.population<=8?2:1,Math.floor(this.population*.1)),Math.max(0,this.population-genomes.length-immigrantCount)):0;';
  const after='?Math.min(Math.max(this.population<=8?2:1,Math.floor(this.population*.5)),Math.max(0,this.population-genomes.length-immigrantCount)):0;';
  const transformed=replaceOnce(source,before,after,'ES sample share 10% -> 50%');
  const mod=new Module(simPath,module);mod.filename=simPath;mod.paths=Module._nodeModulePaths(path.dirname(simPath));mod._compile(transformed,simPath);mod.loaded=true;
  return {api:mod.exports,source:transformed};
}

async function runArm({F,P,model,circuits,state,payload,seed,name,version,outputDir}){
  const sim=new F.Simulation(structuredClone(model),{modelId:'v3',population:state.population,circuitId:state.circuitId,circuits,seed});
  P.validatePayload(payload,{graph:sim.graph,circuits:sim.circuits});
  P.restore(sim,structuredClone(state));
  // Use a new, paired generation RNG while keeping the saved gen108 genomes,
  // vehicle states, optimizer, and histories identical between the two arms.
  sim.seed=seed;sim.random=F.rng(seed);sim.running=true;
  const start=sim.generation,history=[];let terminal=new Map(),ticks=0,totalTicks=0,lastLog=performance.now();
  sim.onTrialTick=s=>{
    if(performance.now()-lastLog>25000){lastLog=performance.now();console.log('SEED_PANEL_RUNNING '+JSON.stringify({seed,arm:name,generation:s.generation,elapsed:s.elapsed,
      alive:s.cars.filter(c=>c.alive).length,progress:Math.max(...s.cars.map(c=>c.bestProgress))}));}
    if(s.cars.every(c=>!c.alive))for(const c of s.cars)terminal.set(c.id,{id:c.id,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),laps:c.laps,
      fitness:c.fitness,reason:c.reason||'',safe:F.isSafeLearningOutcome(c)});
  };
  while(sim.generation<start+4){
    const before=sim.generation;sim.tick();ticks++;totalTicks++;
    if(ticks>60000)throw Error(`${seed}/${name}: generation ${before} exceeded watchdog.`);
    if(sim.generation!==before){
      const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id);
      if(outcomes.length!==state.population)throw Error(`${seed}/${name}/gen${before}: got ${outcomes.length} terminal outcomes.`);
      const safe=outcomes.filter(c=>c.safe),h=sim.history.at(-1);
      const row={seed,arm:name,generation:before,population:outcomes.length,safeCount:safe.length,unsafeCount:outcomes.length-safe.length,
        safeFrontierM:safe.length?Math.max(...safe.map(c=>c.progressM)):null,rawFrontierM:Math.max(...outcomes.map(c=>c.progressM)),
        maxLaps:Math.max(...outcomes.map(c=>c.laps)),noLapCount:outcomes.filter(c=>c.laps<1).length,nextGenerationEsSamples:sim.lastOptimizerSampleCount??null,
        optimizerEpisodes:h.learning?.episodes??null,reasonCounts:outcomes.reduce((a,c)=>(a[c.reason]=(a[c.reason]||0)+1,a),{}),outcomes};
      history.push(row);fs.writeFileSync(path.join(outputDir,`${seed}-${name}-partial.json`),JSON.stringify({seed,arm:name,history},null,2));
      console.log('SEED_PANEL_GENERATION '+JSON.stringify({...row,outcomes:undefined,ticks}));terminal=new Map();ticks=0;
    }
  }
  const savePath=path.join(outputDir,`${seed}-${name}-gen112-research.malecns-save`);
  fs.writeFileSync(savePath,await P.encode(P.fromSimulation(sim),version));
  const decoded=await P.decode(fs.readFileSync(savePath,'utf8'),version);P.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});
  return {seed,arm:name,share:name==='treatment'?.5:.1,history,totalTicks,wallSeconds:0,
    outputSave:{path:savePath,sha256:hashFile(savePath),bytes:fs.statSync(savePath).size,decoded:true,generation:decoded.payload.workers[0].state.generation}};
}

async function main(){
  if(process.versions.node!=='24.19.0')throw Error(`Pinned Node 24.19.0 required; found ${process.versions.node}`);
  if(fs.existsSync(out))throw Error(`Refusing to overwrite existing output: ${out}`);
  const inputHash=hashFile(input),userHash=hashFile(userSave),reference=JSON.parse(fs.readFileSync(originalControl,'utf8'));
  if(inputHash!==reference.inputIntegrity.inputSha256||userHash!==reference.inputIntegrity.userSaveSha256)throw Error('Checkpoint or author save hash differs from recorded reference.');
  const P=require(path.join(root,'outputs/progress-save.js')),appSave=await P.decode(fs.readFileSync(input,'utf8'),'5.6.0');
  const state=appSave.payload.workers[0].state;
  if(state.generation!==108||state.population!==40||state.seed!==850813||state.circuitId!=='monza'||state.optimizer.mean.length!==523||state.genomes.some(g=>g&&g.adapterVersion!==7))
    throw Error('Unexpected gen108 V3/decoder7 checkpoint.');
  const simPath=path.join(root,'outputs/simulation.js'),sourceBefore=fs.readFileSync(simPath,'utf8'),treatment=compileTreatment(simPath,sourceBefore);
  const L=require(path.join(root,'outputs/neural-learning.js')),Legacy=require(path.join(root,'outputs/legacy-models.js')),
    Dense=require(path.join(root,'outputs/dense-neural.js')),D7=require('./decoder7-model.cjs');
  installMainCompatibleDecoder6(L);D7.install(L);
  const data=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),model=Legacy.tagV3(data);model.policyConfig={...D7.POLICY};
  const circuits=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/circuits.json'),'utf8'));
  const Fcontrol=require(simPath),FtreatmentApi=treatment.api;
  fs.mkdirSync(out,{recursive:false});
  const cuda=require(path.join(root,'work/cuda-exact-v3-runtime.cjs')),denseBefore=Dense.step;Dense.step=(...args)=>cuda.pass(...args);
  const arms=[],started=performance.now();
  try{
    for(const seed of seeds){
      for(const [name,F] of [['control',Fcontrol],['treatment',FtreatmentApi]]){
        const armStart=performance.now();
        const result=await runArm({F,P,model,circuits,state,payload:appSave.payload,cuda,seed,name,version:appSave.appVersion,outputDir:out});
        result.wallSeconds=(performance.now()-armStart)/1000;arms.push(result);
        console.log('SEED_PANEL_ARM_DONE '+JSON.stringify({seed,arm:name,seconds:result.wallSeconds,history:result.history.map(r=>({generation:r.generation,safe:r.safeCount,frontierM:r.safeFrontierM,laps:r.maxLaps,esSamples:r.nextGenerationEsSamples}))}));
      }
    }
  }finally{Dense.step=denseBefore;}
  const gpu=cuda.stats(),gpuIdentity=cuda.identity();
  if(gpu.gpuCalls<=0||gpu.cpuFallbacks!==0||gpu.device?.name!=='NVIDIA GeForce RTX 4060')throw Error('Expected RTX 4060 execution with zero CPU fallback.');
  const bySeed=seeds.map(seed=>{
    const control=arms.find(a=>a.seed===seed&&a.arm==='control'),treated=arms.find(a=>a.seed===seed&&a.arm==='treatment');
    if(!control||!treated||control.history.length!==4||treated.history.length!==4)throw Error(`Missing complete pair for seed ${seed}.`);
    for(let g=0;g<4;g++)if(control.history[g].generation!==treated.history[g].generation)throw Error(`Pair generation mismatch, seed ${seed}.`);
    const expected108=reference.history.find(row=>row.generation===108);
    if(control.history[0].safeCount!==expected108.safeCount||treated.history[0].safeCount!==expected108.safeCount||
       Math.abs(control.history[0].safeFrontierM-expected108.safeFrontier)>.001||Math.abs(treated.history[0].safeFrontierM-expected108.safeFrontier)>.001)
      throw Error(`Seed ${seed}: shared gen108 did not reproduce the verified anchor.`);
    return {seed,control:control.history.map(({seed:s,arm,...r})=>r),treatment:treated.history.map(({seed:s,arm,...r})=>r),
      deltas:treated.history.map((row,i)=>({generation:row.generation,safeCount:row.safeCount-control.history[i].safeCount,
        safeFrontierM:row.safeFrontierM-control.history[i].safeFrontierM,laps:row.maxLaps-control.history[i].maxLaps}))};
  });
  const sourceAfter=hashFile(simPath),userAfter=hashFile(userSave),inputAfter=hashFile(input);
  if(sourceAfter!==sha(sourceBefore)||userAfter!==userHash||inputAfter!==inputHash)throw Error('Production source or input save changed during test.');
  const flattened=bySeed.flatMap(pair=>pair.deltas),report={format:'male-cns-decoder7-es-sample-share-seed-panel-v1',appVersion:'5.6.0',
    method:'Two paired evolution RNG seeds, each with the same gen108 checkpoint in control (10% ES share) and treatment (50%). Same RNG seed within each pair; only ES sample quota differs. The starting population and learned checkpoint are intentionally held fixed.',
    settings:{circuit:'Monza',startingGeneration:108,generations:4,population:40,esParameters:523,seeds,controlShare:.1,treatmentShare:.5,
      controlEsSamples:4,treatmentEsSamples:20},pairs:bySeed,
    aggregate:{safeCountDeltaMean:flattened.reduce((s,r)=>s+r.safeCount,0)/flattened.length,
      safeFrontierDeltaMeanM:flattened.reduce((s,r)=>s+r.safeFrontierM,0)/flattened.length,
      safeCountWins:flattened.filter(r=>r.safeCount>0).length,safeCountTies:flattened.filter(r=>r.safeCount===0).length,
      safeCountLosses:flattened.filter(r=>r.safeCount<0).length,anyLaps:bySeed.some(pair=>pair.treatment.some(r=>r.maxLaps>0)),
      twoLaps:bySeed.some(pair=>pair.treatment.some(r=>r.maxLaps>=2))},
    integrity:{inputSha256:inputHash,inputUnchanged:inputAfter===inputHash,userSaveSha256:userHash,userSaveUnchanged:userAfter===userHash,
      controlSourceSha256:sha(sourceBefore),productionSourceSha256After:sourceAfter,productionSourceUnchanged:sourceAfter===sha(sourceBefore)},
    gpu,gpuIdentity,wallSeconds:(performance.now()-started)/1000,
    decision:'research-only; no app promotion',limits:'Two RNG seeds from one fixed, already-trained checkpoint and one circuit. Does not test independent initial populations, other models/circuits, cold start, or two laps.',
    sourceSha256:{simulation:hashFile(simPath),learning:hashFile(path.join(root,'outputs/neural-learning.js')),progress:hashFile(path.join(root,'outputs/progress-save.js')),
      dense:hashFile(path.join(root,'outputs/dense-neural.js')),decoder7:hashFile(path.join(root,'work/decoder7-model.cjs')),runner:hashFile(__filename),treatmentInMemory:sha(treatment.source)}};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('SEED_PANEL_DONE '+JSON.stringify({seeds,summary:bySeed.map(p=>({seed:p.seed,deltas:p.deltas})),gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks,
    twoLaps:report.aggregate.twoLaps,report:path.join(out,'report.json')}));
  cuda.close();
}

main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
